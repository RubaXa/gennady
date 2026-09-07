// @file: Unit proofs for transitive, cycle-safe phase dependency receipt preflight.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPhaseDependencies } from '../phase-dependencies.ts';
import { formatPhaseReceipt, phaseReceiptPlanState, type PhaseReceipt } from '../phase-receipt.ts';

function receipt(phase: string): PhaseReceipt {
  const plan = {
    ticket: 'specs/app/app.task.TSK-1.md',
    phase,
    profile: 'code' as const,
    profileBasis: 'phase-kind' as const,
    targets: [`src/${phase}.ts`],
    deletedFiles: [],
    verification: [],
    producesCoverage: false,
    environmentState: `sha256:${(phase === 'P1' ? '1' : '2').repeat(64)}`,
  };
  return {
    schema: 1,
    ...plan,
    planState: phaseReceiptPlanState(plan),
    targetState: `sha256:${(phase === 'P1' ? '3' : '4').repeat(64)}`,
    commands: [],
  };
}

function ticket(
  rows: readonly string[],
  receipts: readonly PhaseReceipt[] = [],
  schemaAware = true
): string {
  return [
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    ...rows,
    '<!--/SECTION:PHASES_OVERVIEW-->',
    ...(schemaAware ? ['<!--PHASE_RECEIPTS:v1-->'] : []),
    ...receipts.map(formatPhaseReceipt),
  ].join('\n');
}

describe('checkPhaseDependencies', () => {
  it('walks the complete dependency closure leaf-first and reports a stale ancestor', () => {
    const content = ticket(
      ['| P1 | impl | — | [x] |', '| P2 | impl | P1 | [x] |', '| P3 | test | P2 | [ ] |'],
      [receipt('P1'), receipt('P2')]
    );
    const visited: string[] = [];
    const issue = checkPhaseDependencies(content, 'P3', (_candidate, phase) => {
      visited.push(phase);
      return phase === 'P1' ? 'target state changed' : null;
    });
    assert.deepStrictEqual(visited, ['P1']);
    assert.match(issue ?? '', /dependency P1 is not current: target state changed/);
  });

  it('fails closed deterministically on an unknown ancestor and on a cycle', () => {
    const unknown = checkPhaseDependencies(
      ticket(['| P2 | impl | P0 | [x] |', '| P3 | test | P2 | [ ] |'], [receipt('P2')]),
      'P3',
      () => null
    );
    assert.match(unknown ?? '', /dependency chain P2 -> P0 references an absent phase/);

    const cycle = checkPhaseDependencies(
      ticket(
        ['| P1 | impl | P2 | [x] |', '| P2 | impl | P1 | [x] |', '| P3 | test | P2 | [ ] |'],
        [receipt('P1'), receipt('P2')]
      ),
      'P3',
      () => null
    );
    assert.match(cycle ?? '', /dependency graph contains a cycle: P2 -> P1 -> P2/);
  });

  it('grandfathers only missing legacy evidence; an existing legacy receipt is still validated', () => {
    const rows = ['| P1 | impl | — | [x] |', '| P2 | test | P1 | [ ] |'];
    assert.strictEqual(
      checkPhaseDependencies(ticket(rows, [], false), 'P2', () => 'stale'),
      null
    );
    const issue = checkPhaseDependencies(ticket(rows, [receipt('P1')], false), 'P2', () => 'stale');
    assert.match(issue ?? '', /dependency P1 is not current: stale/);
  });

  it('requires every dependency receipt when the schema marker is present', () => {
    const issue = checkPhaseDependencies(
      ticket(['| P1 | impl | — | [x] |', '| P2 | test | P1 | [ ] |']),
      'P2',
      () => null
    );
    assert.match(issue ?? '', /dependency P1 has no CLI-owned receipt/);
  });
});
