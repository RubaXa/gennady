// @file: Unit tests for the fail-closed critic readiness gate.
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkCriticReadinessForTargetSet } from '../critic-readiness.ts';

const STATE = `sha256:${'a'.repeat(64)}`;
const roundState = (number: number): string =>
  `sha256:${'0123456789abcdef'[number % 16]?.repeat(64)}`;

function replaceFixture(source: string, needle: string, replacement: string): string {
  assert.ok(source.includes(needle), `fixture needle missing: ${needle}`);
  const changed = source.replace(needle, replacement);
  assert.notStrictEqual(changed, source);
  return changed;
}

const round = (
  number: number,
  verdict: string,
  targetSet = 'demo.spec.md',
  decision?: string,
  changes = 'none',
  writeSet = targetSet,
  changedState = STATE
): string =>
  [
    `### Round ${number} — 2026-08-${String(number).padStart(2, '0')}`,
    `- Verdict: ${verdict}`,
    `- Target-set: ${targetSet}`,
    `- Write-set: ${writeSet}`,
    `- Changed-state: ${changedState}`,
    `- Dispatch: ${number === 1 ? 'fresh — initial target-set' : 'continued'}`,
    `- Changes: ${changes}`,
    ...(decision ? [`- Operator-decision: ${decision}`] : []),
  ].join('\n');

const editingRound = (
  number: number,
  verdict = 'NEEDS_WORK',
  decision?: string,
  targetSet = 'demo.spec.md',
  writeSet = targetSet
): string =>
  round(
    number,
    verdict,
    targetSet,
    decision,
    `edited after round ${number}`,
    writeSet,
    roundState(number)
  );

const history = (...rounds: string[]): string =>
  ['# Demo', '## Critic Rounds', ...rounds].join('\n');

const codes = (content: string): string[] =>
  checkCriticReadinessForTargetSet('demo.spec.md', content, null).map((finding) => finding.code);

describe('checkCriticReadinessForTargetSet', () => {
  it('fails when critic evidence is absent', () => {
    assert.deepStrictEqual(codes('# Demo'), ['SDD_CRITIC_NOT_RUN']);
  });

  it('fails when the section has no canonical round', () => {
    assert.deepStrictEqual(codes('# Demo\n\n## Critic Rounds\n\nRound 1: looks fine'), [
      'SDD_CRITIC_ROUND_FORMAT_INVALID',
    ]);
  });

  it('requires exactly one canonical Critic Rounds section', () => {
    assert.deepStrictEqual(codes('# Demo\n## critic rounds\n' + round(1, 'CLEAN')), [
      'SDD_CRITIC_NOT_RUN',
    ]);
    assert.deepStrictEqual(
      codes(
        `${history(round(1, 'NEEDS_WORK'))}\n## Other\ntext\n## Critic Rounds\n${round(2, 'CLEAN')}`
      ),
      ['SDD_CRITIC_ROUND_FORMAT_INVALID']
    );
  });

  it('does not treat a fenced Critic Rounds example as evidence', () => {
    const content = ['# Demo', '~~~md', '## Critic Rounds', round(1, 'CLEAN'), '~~~'].join('\n');
    assert.deepStrictEqual(codes(content), ['SDD_CRITIC_NOT_RUN']);
  });

  it('uses the latest canonical round rather than an older verdict', () => {
    assert.deepStrictEqual(
      codes(
        history(
          editingRound(1),
          round(2, 'CRITICAL', 'demo.spec.md', undefined, 'none', 'demo.spec.md', roundState(2))
        )
      ),
      ['SDD_CRITIC_NOT_CLEAN']
    );
  });

  it('passes when the latest canonical round is CLEAN and ignores later sections', () => {
    const content = `${history(editingRound(1), round(2, 'CLEAN', 'demo.spec.md', undefined, 'none', 'demo.spec.md', roundState(2)))}\n## Decision Log\n- Verdict: CRITICAL`;
    assert.deepStrictEqual(codes(content), []);
  });

  it('rejects a round after an earlier completion', () => {
    assert.deepStrictEqual(codes(history(round(1, 'CLEAN'), round(2, 'CLEAN'))), [
      'SDD_CRITIC_ROUND_AFTER_COMPLETION',
    ]);
  });

  it('makes a non-clean no-edit round terminal instead of dispatching again', () => {
    assert.deepStrictEqual(codes(history(round(1, 'NEEDS_WORK'), round(2, 'CLEAN'))), [
      'SDD_CRITIC_ROUND_AFTER_COMPLETION',
    ]);
  });

  it('requires a newly computed pre-dispatch state after edits', () => {
    assert.deepStrictEqual(
      codes(
        history(
          round(1, 'NEEDS_WORK', 'demo.spec.md', undefined, 'edited requirement'),
          round(2, 'CLEAN')
        )
      ),
      ['SDD_CRITIC_CHANGED_STATE_NOT_ADVANCED']
    );
  });

  it('fails closed when any round has no verdict instead of reusing a later CLEAN', () => {
    const malformed = [
      '### Round 1 — 2026-08-01',
      '- Changes: pending',
      '- Target-set: demo.spec.md',
      '- Write-set: demo.spec.md',
      `- Changed-state: ${STATE}`,
      '- Dispatch: fresh — initial target-set',
    ].join('\n');
    assert.deepStrictEqual(codes(history(malformed, round(2, 'CLEAN'))), [
      'SDD_CRITIC_VERDICT_MISSING',
    ]);
  });

  it('fails closed on a non-canonical verdict', () => {
    assert.deepStrictEqual(codes(history(round(1, 'NEEDS WORK'))), ['SDD_CRITIC_VERDICT_MISSING']);
  });

  it('requires canonical dated sequential round headings', () => {
    const undated = '### Round 1\n- Verdict: CLEAN\n- Target-set: demo.spec.md';
    assert.deepStrictEqual(codes(history(undated)), ['SDD_CRITIC_ROUND_FORMAT_INVALID']);
    assert.deepStrictEqual(codes(history(round(2, 'CLEAN'))), [
      'SDD_CRITIC_ROUND_SEQUENCE_INVALID',
    ]);
    assert.deepStrictEqual(codes(history(round(1, 'NEEDS_WORK'), round(1, 'CLEAN'))), [
      'SDD_CRITIC_ROUND_SEQUENCE_INVALID',
    ]);
  });

  it('does not let fenced examples create or terminate canonical rounds', () => {
    const content = history(
      [
        '### Round 1 — 2026-08-01',
        '- Verdict: NEEDS_WORK',
        '- Target-set: demo.spec.md',
        '- Write-set: demo.spec.md',
        `- Changed-state: ${STATE}`,
        '- Dispatch: fresh — initial target-set',
        '- Changes: none',
        '```md',
        '### Round 2 — 2026-08-02',
        '- Verdict: CLEAN',
        '- Target-set: demo.spec.md',
        '- Write-set: demo.spec.md',
        '```',
      ].join('\n')
    );
    assert.deepStrictEqual(codes(content), ['SDD_CRITIC_NOT_CLEAN']);
  });

  it('tracks tilde fence marker and length before accepting a closing fence', () => {
    const content = history(
      [
        '### Round 1 — 2026-08-01',
        '- Verdict: NEEDS_WORK',
        '- Target-set: demo.spec.md',
        '- Write-set: demo.spec.md',
        `- Changed-state: ${STATE}`,
        '- Dispatch: fresh — initial target-set',
        '- Changes: none',
        '~~~~md',
        '### Round 2 — 2026-08-02',
        '- Verdict: CLEAN',
        '- Target-set: demo.spec.md',
        '- Write-set: demo.spec.md',
        '~~~',
        '### Round 3 — 2026-08-03',
        '- Verdict: CLEAN',
        '- Target-set: demo.spec.md',
        '- Write-set: demo.spec.md',
        '~~~~',
      ].join('\n')
    );
    assert.deepStrictEqual(codes(content), ['SDD_CRITIC_NOT_CLEAN']);
  });

  it('requires one canonical target-set marker and the expected complete bundle', () => {
    const missing = history('### Round 1 — 2026-08-01\n- Verdict: CLEAN');
    assert.deepStrictEqual(codes(missing), ['SDD_CRITIC_TARGET_SET_MISSING']);

    const mismatch = history(round(1, 'CLEAN', 'specs/a.spec.md'));
    assert.deepStrictEqual(
      checkCriticReadinessForTargetSet('demo.spec.md', mismatch, [
        'specs/a.spec.md',
        'specs/b.spec.md',
      ]).map((finding) => finding.code),
      ['SDD_CRITIC_TARGET_SET_MISMATCH']
    );

    assert.deepStrictEqual(codes(history(round(1, 'CLEAN', 'b.spec.md | a.spec.md'))), [
      'SDD_CRITIC_TARGET_SET_MISSING',
    ]);
  });

  it('blocks at the fifth result regardless of sensor verdict until the operator decides', () => {
    const firstFour = [1, 2, 3, 4].map((number) => editingRound(number));
    assert.deepStrictEqual(codes(history(...firstFour, round(5, 'CLEAN'))), [
      'SDD_CRITIC_OPERATOR_DECISION_INVALID',
    ]);
    assert.deepStrictEqual(codes(history(...firstFour, round(5, 'NEEDS_WORK'))), [
      'SDD_CRITIC_OPERATOR_DECISION_INVALID',
    ]);
  });

  it('does not treat a CLEAN sensor at the cap as ready when the operator chose continuation', () => {
    const firstFour = [1, 2, 3, 4].map((number) => editingRound(number));
    const continued = round(
      5,
      'CLEAN',
      'demo.spec.md',
      'CONTINUE THROUGH ROUND 7',
      'none',
      'demo.spec.md',
      roundState(5)
    );
    assert.deepStrictEqual(codes(history(...firstFour, continued)), ['SDD_CRITIC_NOT_CLEAN']);
    assert.deepStrictEqual(
      codes(
        history(
          ...firstFour,
          continued,
          round(6, 'NEEDS_WORK', 'demo.spec.md', undefined, 'none', 'demo.spec.md', roundState(5))
        )
      ),
      ['SDD_CRITIC_NOT_CLEAN']
    );
    assert.deepStrictEqual(
      codes(
        history(
          ...firstFour,
          continued,
          round(6, 'CLEAN', 'demo.spec.md', undefined, 'none', 'demo.spec.md', roundState(5))
        )
      ),
      []
    );
    assert.deepStrictEqual(
      codes(
        history(
          ...firstFour,
          continued,
          editingRound(6),
          round(7, 'CLEAN', 'demo.spec.md', undefined, 'none', 'demo.spec.md', roundState(7))
        )
      ),
      ['SDD_CRITIC_OPERATOR_DECISION_INVALID']
    );
  });

  it('an explicit continuation permits rounds only through the stated new cap', () => {
    const firstFour = [1, 2, 3, 4].map((number) => editingRound(number));
    assert.deepStrictEqual(
      codes(
        history(
          ...firstFour,
          round(5, 'NEEDS_WORK', 'demo.spec.md', 'CONTINUE THROUGH ROUND 7'),
          editingRound(6),
          round(7, 'CLEAN', 'demo.spec.md', undefined, 'none', 'demo.spec.md', roundState(7))
        )
      ),
      ['SDD_CRITIC_OPERATOR_DECISION_INVALID']
    );
    assert.deepStrictEqual(
      codes(
        history(
          ...firstFour,
          round(5, 'NEEDS_WORK', 'demo.spec.md', 'CONTINUE THROUGH ROUND 7'),
          editingRound(6),
          round(7, 'CLEAN', 'demo.spec.md', 'CLEAN', 'none', 'demo.spec.md', roundState(7))
        )
      ),
      []
    );
  });

  it('treats a continuation decision as non-ready until a permitted round completes', () => {
    const content = history(
      ...[1, 2, 3, 4].map((number) => editingRound(number)),
      round(5, 'NEEDS_WORK', 'demo.spec.md', 'CONTINUE THROUGH ROUND 7')
    );
    assert.deepStrictEqual(codes(content), ['SDD_CRITIC_NOT_CLEAN']);
  });

  it('treats operator RESTART as terminal for the old critic cycle', () => {
    const content = history(
      ...[1, 2, 3, 4].map((number) => editingRound(number)),
      round(5, 'NEEDS_WORK', 'demo.spec.md', 'RESTART: target changed')
    );
    assert.deepStrictEqual(codes(content), ['SDD_CRITIC_RESTART_REQUIRED']);
  });

  it('rejects OPERATOR_ACCEPTED because the sensor verdict must remain honest', () => {
    assert.deepStrictEqual(codes(history(round(1, 'OPERATOR_ACCEPTED'))), [
      'SDD_CRITIC_VERDICT_MISSING',
    ]);
  });

  it('accepts a non-clean sensor verdict only with operator CLEAN at the active cap', () => {
    assert.deepStrictEqual(codes(history(round(1, 'NEEDS_WORK', 'demo.spec.md', 'CLEAN'))), [
      'SDD_CRITIC_OPERATOR_DECISION_INVALID',
    ]);
    const firstFour = [1, 2, 3, 4].map((number) => editingRound(number));
    assert.deepStrictEqual(
      codes(history(...firstFour, round(5, 'NEEDS_WORK', 'demo.spec.md', 'CLEAN'))),
      []
    );
  });

  it('rejects operator CLEAN at the cap when the latest round changed artifacts', () => {
    const firstFour = [1, 2, 3, 4].map((number) => editingRound(number));
    assert.deepStrictEqual(
      codes(
        history(
          ...firstFour,
          round(5, 'CLEAN', 'demo.spec.md', 'CLEAN', 'updated requirement wording')
        )
      ),
      ['SDD_CRITIC_OPERATOR_DECISION_INVALID']
    );
    assert.deepStrictEqual(
      codes(
        history(
          ...firstFour,
          round(
            5,
            'NEEDS_WORK',
            'demo.spec.md',
            'CONTINUE THROUGH ROUND 6',
            'updated requirement wording'
          ),
          round(6, 'CLEAN', 'demo.spec.md', 'CLEAN', 'none', 'demo.spec.md', roundState(6))
        )
      ),
      []
    );
  });

  it('requires a post-edit sensor round even when the editing round reported CLEAN', () => {
    assert.deepStrictEqual(
      codes(history(round(1, 'CLEAN', 'demo.spec.md', undefined, 'updated requirement wording'))),
      ['SDD_CRITIC_NOT_CLEAN']
    );
    assert.deepStrictEqual(
      codes(
        history(
          round(1, 'CLEAN', 'demo.spec.md', undefined, 'updated requirement wording'),
          round(2, 'CLEAN', 'demo.spec.md', undefined, 'none', 'demo.spec.md', roundState(2))
        )
      ),
      []
    );
  });

  it('requires one stable write-set that is a subset of the review target-set', () => {
    const missing = replaceFixture(round(1, 'CLEAN'), '- Write-set: demo.spec.md\n', '');
    assert.deepStrictEqual(codes(history(missing)), ['SDD_CRITIC_WRITE_SET_INVALID']);
    assert.deepStrictEqual(
      codes(history(round(1, 'CLEAN', 'a.spec.md | b.spec.md', undefined, 'none', 'c.spec.md'))),
      ['SDD_CRITIC_WRITE_SET_INVALID']
    );
    assert.deepStrictEqual(
      codes(
        history(
          round(
            1,
            'NEEDS_WORK',
            'a.spec.md | b.spec.md',
            undefined,
            'edited a',
            'a.spec.md',
            roundState(1)
          ),
          round(2, 'CLEAN', 'a.spec.md | b.spec.md', undefined, 'none', 'b.spec.md', roundState(2))
        )
      ),
      ['SDD_CRITIC_WRITE_SET_CHANGED_IN_CYCLE']
    );
  });

  it('requires one target-set per cycle and a reason for every fresh fallback', () => {
    assert.deepStrictEqual(
      codes(
        history(
          editingRound(1),
          round(2, 'CLEAN', 'other.spec.md', undefined, 'none', 'other.spec.md', roundState(2))
        )
      ),
      ['SDD_CRITIC_TARGET_SET_CHANGED_IN_CYCLE']
    );
    const invalidFresh = replaceFixture(
      round(2, 'CLEAN'),
      '- Dispatch: continued',
      '- Dispatch: fresh'
    );
    assert.deepStrictEqual(
      codes(history(editingRound(1), invalidFresh.replace(STATE, roundState(2)))),
      ['SDD_CRITIC_DISPATCH_INVALID']
    );
    const validFresh = replaceFixture(
      round(2, 'CLEAN'),
      '- Dispatch: continued',
      '- Dispatch: fresh — session lost: host evicted worker'
    );
    assert.deepStrictEqual(
      codes(history(editingRound(1), validFresh.replace(STATE, roundState(2)))),
      []
    );

    const changedCycle = replaceFixture(
      round(1, 'CLEAN', 'new.spec.md'),
      '- Dispatch: fresh — initial target-set',
      '- Dispatch: fresh — target-set changed: added the missing module spec'
    );
    assert.deepStrictEqual(codes(history(changedCycle)), []);

    const promotedCycle = replaceFixture(
      round(1, 'CLEAN', 'a.spec.md | b.spec.md', undefined, 'none', 'a.spec.md | b.spec.md'),
      '- Dispatch: fresh — initial target-set',
      '- Dispatch: fresh — write-set changed: promoted b.spec.md after routed finding'
    );
    assert.deepStrictEqual(codes(history(promotedCycle)), []);
  });

  it('does not let an older CLEAN hide a malformed newer round', () => {
    assert.deepStrictEqual(
      codes(`${history(round(1, 'CLEAN'))}\n### Round latest — broken\n- Verdict: CLEAN`),
      ['SDD_CRITIC_ROUND_FORMAT_INVALID']
    );
  });

  it('rejects a CLEAN whose recorded changed state is not the current integrated state', () => {
    const different = `sha256:${'b'.repeat(64)}`;
    assert.deepStrictEqual(
      checkCriticReadinessForTargetSet(
        'demo.spec.md',
        history(round(1, 'CLEAN')),
        ['demo.spec.md'],
        different
      ).map((finding) => finding.code),
      ['SDD_CRITIC_CHANGED_STATE_MISMATCH']
    );
  });
});
