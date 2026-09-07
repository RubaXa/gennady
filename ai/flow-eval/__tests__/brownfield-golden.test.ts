// @file: Both-outcomes proof for the brownfield code-delta golden gate (QUALITY-RULES R2/R5).
// @consumers: ai/flow-eval/provision (brownfield-extend-cli fixture)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { FIXTURE_FILES } from '../provision.ts';

// The brownfield golden must ACCEPT a delta that adds the new behaviour while preserving the old,
// and REJECT both a no-op (change never applied) and a delta that breaks existing behaviour. Every
// outcome is reproducible from a fixed sample, so a passing run is objective, not judge opinion.
const REFERENCE = `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: report.sh <file>" >&2; exit 1; }
echo "lines: $(wc -l < "$f" | tr -d ' ')"
echo "words: $(wc -w < "$f" | tr -d ' ')"
echo "chars: $(wc -c < "$f" | tr -d ' ')"
`;

// Regression: the change was never applied — the original two-line tool, no chars line.
const UNCHANGED = `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: report.sh <file>" >&2; exit 1; }
echo "lines: $(wc -l < "$f" | tr -d ' ')"
echo "words: $(wc -w < "$f" | tr -d ' ')"
`;

// Broke existing behaviour: chars added, but the original "words:" line was renamed.
const BROKE_EXISTING = `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: report.sh <file>" >&2; exit 1; }
echo "lines: $(wc -l < "$f" | tr -d ' ')"
echo "word_count: $(wc -w < "$f" | tr -d ' ')"
echo "chars: $(wc -c < "$f" | tr -d ' ')"
`;

// Bug fix branch: the tool must print distinct lines in first-appearance order.
const BUG_REFERENCE = `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: uniq-lines.sh <file>" >&2; exit 1; }
awk '!seen[$0]++' "$f"
`;

// Regression: the bug was never fixed — still sorts (wrong order).
const BUG_UNFIXED = `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: uniq-lines.sh <file>" >&2; exit 1; }
sort "$f" | uniq
`;

// Fixed the order but dropped the error contract (no argument check).
const BUG_LOST_CONTRACT = `#!/usr/bin/env bash
set -euo pipefail
awk '!seen[$0]++' "\${1:-}"
`;

function layoutFixture(fixture: 'brownfield-extend-cli' | 'brownfield-fix-bug'): string {
  const dir = mkdtempSync(join(tmpdir(), 'brownfield-golden-'));
  for (const [rel, content] of Object.entries(FIXTURE_FILES[fixture])) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function install(dir: string, rel: string, candidate: string): void {
  const script = join(dir, rel);
  writeFileSync(script, candidate);
  chmodSync(script, 0o755);
}

function layout(candidate: string): string {
  const dir = layoutFixture('brownfield-extend-cli');
  install(dir, 'bin/report.sh', candidate);
  return dir;
}

function layoutBug(candidate: string): string {
  const dir = layoutFixture('brownfield-fix-bug');
  install(dir, 'bin/uniq-lines.sh', candidate);
  return dir;
}

function verify(dir: string): { code: number; out: string } {
  const res = spawnSync('bash', [join(dir, 'golden', 'verify.sh')], { encoding: 'utf8' });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

describe('brownfield code-delta golden gate (both outcomes reproducible)', () => {
  it('ACCEPTS a delta that adds new behaviour and preserves the old (positive)', () => {
    const { code, out } = verify(layout(REFERENCE));
    assert.strictEqual(code, 0, `expected PASS, got:\n${out}`);
    assert.match(out, /PASS/);
  });

  it('REJECTS a no-op that never applied the change (negative)', () => {
    const { code, out } = verify(layout(UNCHANGED));
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS a delta that breaks existing behaviour (negative)', () => {
    const { code, out } = verify(layout(BROKE_EXISTING));
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });
});

describe('brownfield bug-fix golden gate (both outcomes reproducible)', () => {
  it('ACCEPTS a fix that restores first-appearance order (positive)', () => {
    const { code, out } = verify(layoutBug(BUG_REFERENCE));
    assert.strictEqual(code, 0, `expected PASS, got:\n${out}`);
    assert.match(out, /PASS/);
  });

  it('REJECTS the still-buggy original that sorts (negative)', () => {
    const { code, out } = verify(layoutBug(BUG_UNFIXED));
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS a fix that drops the error contract (negative)', () => {
    const { code, out } = verify(layoutBug(BUG_LOST_CONTRACT));
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });
});
