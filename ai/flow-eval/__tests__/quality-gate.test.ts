// @file: Both-outcomes proof for the R1 quality parser (structural integrity).
// @consumers: ai/flow-eval/quality-gate
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSddCheckResult } from '../quality-gate.ts';

describe('parseSddCheckResult (R1, both outcomes)', () => {
  it('PASS on a clean summary', () => {
    const r = parseSddCheckResult('[sdd-check] ✅ clean — 6 file(s) checked');
    assert.strictEqual(r.pass, true);
    assert.strictEqual(r.rule, 'R1');
  });

  it('FAIL on an error summary, carrying the count', () => {
    const r = parseSddCheckResult(
      'specs/x.spec.md: error: SDD_DIAGRAM_INVALID …\n[sdd-check] 3 error(s), 0 warning(s) across 3 file(s)'
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /3/);
  });

  it('FAIL (not a silent pass) when no verdict is present', () => {
    assert.strictEqual(parseSddCheckResult('some unrelated output').pass, false);
  });
});
