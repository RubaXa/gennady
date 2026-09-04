// @file: Both-outcomes proof for the infra `task` golden gates (QUALITY-RULES R2/R6).
// @consumers: ai/flow-eval/provision (infra-* fixtures)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { FIXTURE_FILES } from '../provision.ts';
import type { SddEvalFixtureId } from '../types.ts';

// A correct + a wrong implementation per infra fixture. The golden gate must ACCEPT the reference
// and REJECT the wrong one — both reproducible.
const CASES: Record<
  string,
  { fixture: SddEvalFixtureId; path: string; exec: boolean; reference: string; broken: string }
> = {
  'log-summary': {
    fixture: 'infra-log-summary',
    path: 'bin/log-summary.sh',
    exec: true,
    reference: `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: log-summary.sh <access.log>" >&2; exit 1; }
echo "total_requests: $(wc -l < "$f" | tr -d ' ')"
echo "server_errors: $(awk '{print $9}' "$f" | grep -c '^5[0-9][0-9]$' || true)"
echo "top_ips:"
awk '{print $1}' "$f" | sort | uniq -c | sort -k1,1nr -k2,2 | head -3 | awk '{print $2, $1}'
`,
    broken: `#!/usr/bin/env bash
set -euo pipefail
echo "total_requests: 999"
`,
  },
  'rotate-logs': {
    fixture: 'infra-rotate-logs',
    path: 'bin/rotate-logs.sh',
    exec: true,
    reference: `#!/usr/bin/env bash
set -euo pipefail
dir="\${1:?usage: rotate-logs.sh <dir> <keep-days>}"
keep="\${2:?usage: rotate-logs.sh <dir> <keep-days>}"
[ -d "$dir" ] || { echo "no such dir: $dir" >&2; exit 1; }
cd "$dir"
shopt -s nullglob
for f in *.log; do gzip -f "$f"; done
for g in *.gz; do
  if [ -n "$(find "$g" -maxdepth 0 -mtime +"$keep" 2>/dev/null)" ]; then rm -f "$g"; fi
done
`,
    broken: `#!/usr/bin/env bash
set -euo pipefail
exit 0
`,
  },
  makefile: {
    fixture: 'infra-makefile',
    path: 'Makefile',
    exec: false,
    reference: `.PHONY: all build test clean help
all: build
build:
\tmkdir -p build && echo ok > build/out.txt
test:
\tbash test/run.sh
clean:
\trm -rf build
help:
\t@echo "targets: build test clean help"
`,
    broken: `build:
\techo no-artifact
help:
\t@echo hi
`,
  },
};

function layout(fixture: SddEvalFixtureId): string {
  const dir = mkdtempSync(join(tmpdir(), 'infra-golden-'));
  for (const [rel, content] of Object.entries(FIXTURE_FILES[fixture])) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function install(dir: string, rel: string, body: string, exec: boolean): void {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  if (exec) chmodSync(p, 0o755);
}

function verify(dir: string): { code: number; out: string } {
  const res = spawnSync('bash', [join(dir, 'golden', 'verify.sh')], { encoding: 'utf8' });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

describe('infra task golden gates (both outcomes reproducible)', () => {
  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: ACCEPTS a correct reference (positive)`, () => {
      const dir = layout(c.fixture);
      install(dir, c.path, c.reference, c.exec);
      const { code, out } = verify(dir);
      assert.strictEqual(code, 0, `expected PASS, got:\n${out}`);
      assert.match(out, /PASS/);
    });

    it(`${name}: REJECTS a wrong implementation (negative)`, () => {
      const dir = layout(c.fixture);
      install(dir, c.path, c.broken, c.exec);
      const { code, out } = verify(dir);
      assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
      assert.match(out, /FAIL/);
    });

    it(`${name}: REJECTS a missing artifact (negative)`, () => {
      const dir = layout(c.fixture);
      const { code } = verify(dir);
      assert.notStrictEqual(code, 0, `expected FAIL for missing artifact`);
    });
  }
});
