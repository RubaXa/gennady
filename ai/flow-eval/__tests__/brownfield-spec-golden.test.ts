// @file: Both-outcomes proof for the brownfield spec-facing golden gates (QUALITY-RULES R2/R5):
// recover-spec, delta-to-spec, modify-via-spec.
// @consumers: ai/flow-eval/provision (brownfield-recover-spec/-delta-to-spec/-via-spec fixtures)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { FIXTURE_FILES } from '../provision.ts';
import type { SddEvalFixtureId } from '../types.ts';

const SPEC_WITH_FACTS = `# report.sh specification

\`bin/report.sh <file>\` summarises a text file.

- Prints \`lines: <N>\` — line count.
- Prints \`words: <N>\` — word count.
- Prints \`chars: <N>\` — byte count.
- Missing file argument: usage message on stderr, non-zero exit.
`;

const SPEC_NO_CHARS = `# report.sh specification

\`bin/report.sh <file>\` summarises a text file: prints \`lines:\` and \`words:\`.
`;

const SPEC_NO_FACTS = `# report tool\n\nThis document is about report but says nothing measurable.\n`;

// Adequacy negatives: names the tool and mentions the behaviours, but as PROSE with no enumerated
// functional requirements — not a usable spec.
const SPEC_PROSE_NO_BULLETS = `# report.sh

The report tool prints lines, words and chars, and on a missing file it exits non-zero.
`;

// Enumerates requirements but omits the error/edge behaviour (happy-path only).
const SPEC_BULLETS_NO_ERROR = `# report.sh specification

- Prints \`lines: <N>\` — line count.
- Prints \`words: <N>\` — word count.
- Prints \`chars: <N>\` — byte count.
`;

const REPORT3 = `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: report.sh <file>" >&2; exit 1; }
echo "lines: $(wc -l < "$f" | tr -d ' ')"
echo "words: $(wc -w < "$f" | tr -d ' ')"
echo "chars: $(wc -c < "$f" | tr -d ' ')"
`;

const REPORT2 = `#!/usr/bin/env bash
set -euo pipefail
f="\${1:-}"
[ -n "$f" ] && [ -f "$f" ] || { echo "usage: report.sh <file>" >&2; exit 1; }
echo "lines: $(wc -l < "$f" | tr -d ' ')"
echo "words: $(wc -w < "$f" | tr -d ' ')"
`;

function layout(fixture: SddEvalFixtureId, extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'brownfield-spec-'));
  for (const [rel, content] of Object.entries({ ...FIXTURE_FILES[fixture], ...extra })) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function verify(dir: string): { code: number; out: string } {
  const res = spawnSync('bash', [join(dir, 'golden', 'verify.sh')], { encoding: 'utf8' });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

describe('brownfield recover-spec golden gate (both outcomes reproducible)', () => {
  it('ACCEPTS a recovered spec that covers the behaviour (positive)', () => {
    const { code, out } = verify(
      layout('brownfield-recover-spec', { 'specs/report/report.spec.md': SPEC_WITH_FACTS })
    );
    assert.strictEqual(code, 0, `expected PASS, got:\n${out}`);
    assert.match(out, /PASS/);
  });

  it('REJECTS a missing spec (negative)', () => {
    const { code, out } = verify(layout('brownfield-recover-spec'));
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS a spec that names the tool but covers no behaviour (negative)', () => {
    const { code, out } = verify(
      layout('brownfield-recover-spec', { 'specs/report/report.spec.md': SPEC_NO_FACTS })
    );
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS prose that mentions behaviours but enumerates no requirements (adequacy)', () => {
    const { code, out } = verify(
      layout('brownfield-recover-spec', { 'specs/report/report.spec.md': SPEC_PROSE_NO_BULLETS })
    );
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /enumerate functional requirements/);
  });

  it('REJECTS a requirements list that omits the error/edge behaviour (adequacy)', () => {
    const { code, out } = verify(
      layout('brownfield-recover-spec', { 'specs/report/report.spec.md': SPEC_BULLETS_NO_ERROR })
    );
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /error\/edge/);
  });
});

describe('brownfield delta-to-spec golden gate (both outcomes reproducible)', () => {
  it('ACCEPTS a spec that names the added behaviour (positive)', () => {
    const { code, out } = verify(
      layout('brownfield-delta-to-spec', { 'specs/report/report.spec.md': SPEC_WITH_FACTS })
    );
    assert.strictEqual(code, 0, `expected PASS, got:\n${out}`);
    assert.match(out, /PASS/);
  });

  it('REJECTS a spec that omits the added chars behaviour (negative)', () => {
    const { code, out } = verify(
      layout('brownfield-delta-to-spec', { 'specs/report/report.spec.md': SPEC_NO_CHARS })
    );
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS a missing spec (negative)', () => {
    const { code, out } = verify(layout('brownfield-delta-to-spec'));
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS prose naming chars but enumerating no requirements (adequacy)', () => {
    const { code, out } = verify(
      layout('brownfield-delta-to-spec', { 'specs/report/report.spec.md': SPEC_PROSE_NO_BULLETS })
    );
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /enumerate functional requirements/);
  });
});

describe('brownfield modify-via-spec golden gate (both outcomes reproducible)', () => {
  it('ACCEPTS updated code AND updated spec (positive)', () => {
    const { code, out } = verify(
      layout('brownfield-via-spec', {
        'bin/report.sh': REPORT3,
        'specs/report/report.spec.md': SPEC_WITH_FACTS,
      })
    );
    assert.strictEqual(code, 0, `expected PASS, got:\n${out}`);
    assert.match(out, /PASS/);
  });

  it('REJECTS when code was not changed (negative)', () => {
    const { code, out } = verify(
      layout('brownfield-via-spec', {
        'bin/report.sh': REPORT2,
        'specs/report/report.spec.md': SPEC_WITH_FACTS,
      })
    );
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS when the spec was not updated (negative)', () => {
    const { code, out } = verify(
      layout('brownfield-via-spec', {
        'bin/report.sh': REPORT3,
        'specs/report/report.spec.md': SPEC_NO_CHARS,
      })
    );
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /FAIL/);
  });

  it('REJECTS updated code + chars-prose spec with no enumerated requirements (adequacy)', () => {
    const { code, out } = verify(
      layout('brownfield-via-spec', {
        'bin/report.sh': REPORT3,
        'specs/report/report.spec.md': SPEC_PROSE_NO_BULLETS,
      })
    );
    assert.notStrictEqual(code, 0, `expected FAIL, got:\n${out}`);
    assert.match(out, /enumerate functional requirements/);
  });
});
