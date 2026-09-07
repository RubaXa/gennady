// @file: Both-outcomes proof for the R1 quality parser (structural integrity).
// @consumers: ai/flow-eval/quality-gate
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSddCheckResult, checkCompletion } from '../quality-gate.ts';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

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

describe('checkCompletion (R-COMPLETE, both outcomes, from disk)', () => {
  const T = { artifact: 'Tools/g.sh', ticket: 'specs/s/s.task.T1.md', spec: 'specs/s/s.spec.md' };
  function bed(opts: {
    artifact: boolean;
    done: boolean;
    round: boolean;
    audit: boolean;
    review: boolean;
  }): string {
    const dir = mkdtempSync(join(tmpdir(), 'rcomplete-'));
    for (const rel of [T.artifact, T.ticket, T.spec])
      mkdirSync(join(dir, dirname(rel)), { recursive: true });
    if (opts.artifact) writeFileSync(join(dir, T.artifact), '#!/bin/bash\n');
    const round = opts.round ? '- [x] `2026-09-07T00:00:00Z` DONE\n' : '- [ ] `<ts>` DONE\n';
    writeFileSync(
      join(dir, T.ticket),
      `- **Status:** ${opts.done ? '[x] DONE' : '[ ] TODO'}\n` +
        `<!--SECTION:EXECUTION_LOG-->\n${round}<!--/SECTION:EXECUTION_LOG-->\n`
    );
    writeFileSync(
      join(dir, T.spec),
      (opts.audit ? '<!--SDD_AUDIT_RECEIPT-->x<!--/SDD_AUDIT_RECEIPT-->\n' : '') +
        (opts.review ? '<!--SDD_REVIEW_RECEIPT-->x<!--/SDD_REVIEW_RECEIPT-->\n' : '')
    );
    return dir;
  }
  it('PASS when artifact + DONE + closed round + both receipts', () => {
    const r = checkCompletion(
      bed({ artifact: true, done: true, round: true, audit: true, review: true }),
      T
    );
    assert.strictEqual(r.pass, true);
    assert.strictEqual(r.rule, 'R-COMPLETE');
  });
  it('FAIL (abandoned) when artifact built but ticket TODO + open round', () => {
    const r = checkCompletion(
      bed({ artifact: true, done: false, round: false, audit: true, review: true }),
      T
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /ticket not \[x\] DONE/);
    assert.match(r.detail, /no closed execution-log round/);
  });
  it('FAIL when the group audit receipt is missing (skipped audit)', () => {
    const r = checkCompletion(
      bed({ artifact: true, done: true, round: true, audit: false, review: true }),
      T
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /no group audit receipt/);
  });
  it('FAIL when the declared artifact was never produced', () => {
    const r = checkCompletion(
      bed({ artifact: false, done: true, round: true, audit: true, review: true }),
      T
    );
    assert.strictEqual(r.pass, false);
    assert.match(r.detail, /not produced/);
  });
});
