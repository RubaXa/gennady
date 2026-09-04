// @file: Both-outcomes proof for the infra-log-summary golden gate (QUALITY-RULES R2/R6).
// @consumers: ai/flow-eval/provision (infra-log-summary fixture)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { FIXTURE_FILES } from '../provision.ts';

// A correct reference implementation the golden set must ACCEPT.
const REFERENCE = `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: log-summary.sh <access.log>" >&2; exit 1; }
total=$(wc -l < "$f" | tr -d ' ')
errors=$(awk '{print $9}' "$f" | grep -c '^5[0-9][0-9]$' || true)
echo "total_requests: $total"
echo "server_errors: $errors"
echo "top_ips:"
awk '{print $1}' "$f" | sort | uniq -c | sort -k1,1nr -k2,2 | head -3 | awk '{print $2, $1}'
`;

// A wrong implementation the golden set must REJECT (still strict-mode, but wrong output).
const BROKEN = `#!/usr/bin/env bash
set -euo pipefail
echo "total_requests: 999"
`;

function layoutFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'infra-golden-'));
  for (const [rel, content] of Object.entries(FIXTURE_FILES['infra-log-summary'])) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function runVerify(dir: string): { code: number; out: string } {
  const res = spawnSync('bash', [join(dir, 'golden', 'verify.sh')], { encoding: 'utf8' });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

function installScript(dir: string, body: string): void {
  const p = join(dir, 'bin', 'log-summary.sh');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  chmodSync(p, 0o755);
}

describe('infra-log-summary golden gate (both outcomes reproducible)', () => {
  it('ACCEPTS a correct reference implementation (positive, reproducible)', () => {
    const dir = layoutFixture();
    installScript(dir, REFERENCE);
    const { code, out } = runVerify(dir);
    assert.strictEqual(code, 0, `expected PASS, got:\n${out}`);
    assert.match(out, /PASS/);
  });

  it('REJECTS a wrong implementation (negative, reproducible)', () => {
    const dir = layoutFixture();
    installScript(dir, BROKEN);
    const { code, out } = runVerify(dir);
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS a missing implementation (negative, reproducible)', () => {
    const dir = layoutFixture();
    const { code, out } = runVerify(dir);
    assert.notStrictEqual(code, 0, `expected FAIL for missing script, got:\n${out}`);
  });
});
