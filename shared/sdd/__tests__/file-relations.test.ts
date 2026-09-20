// @file: FO-2 pure file-relations contract tests over isolated V2/V1 inputs.
// @consumers: N/A
// @tasks: N/A

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileRelationTicketFromContent, resolveFileRelations } from '../file-relations.ts';
import type {
  FileRelationFindingCode,
  FileRelationPhaseInput,
  FileRelationsInput,
  FileRelationTicketInput,
} from '../file-relations.types.ts';

function isolatedRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'file-relations-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'existing.ts'), 'export const existing = true;\n');
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function phase(overrides: Partial<FileRelationPhaseInput> = {}): FileRelationPhaseInput {
  return {
    id: 'P1',
    state: 'todo',
    targetFiles: ['src/existing.ts'],
    deletedFiles: [],
    specIds: ['SPEC-1'],
    evidence: [],
    ...overrides,
  };
}

function ticket(
  taskId: string,
  phases: readonly FileRelationPhaseInput[],
  overrides: Partial<FileRelationTicketInput> = {}
): FileRelationTicketInput {
  return {
    file: `specs/app/app.task.${taskId}.md`,
    taskId,
    dependencies: [],
    flow: 'v2',
    status: 'todo',
    blockerActive: false,
    phases,
    ...overrides,
  };
}

function input(root: string, tickets: readonly FileRelationTicketInput[]): FileRelationsInput {
  return {
    repoRoot: root,
    file: 'src/existing.ts',
    flow: 'v2',
    spec: { status: 'resolved', id: 'SPEC-1', path: 'specs/app/app.spec.md' },
    hasLegacyTasks: false,
    tickets,
  };
}

function codes(result: ReturnType<typeof resolveFileRelations>): FileRelationFindingCode[] {
  return result.findings.map((finding) => finding.code);
}

describe('resolveFileRelations lifecycle and evidence', () => {
  it('requires the exact target phase to be IN_PROGRESS instead of trusting ticket status alone', () => {
    isolatedRoot((root) => {
      const onlyTicketStatus = ticket('APP-status-only', [phase()], {
        status: 'in-progress',
      });
      const actualPhase = ticket('APP-phase-active', [phase({ state: 'in-progress' })], {
        status: 'in-progress',
      });
      const result = resolveFileRelations(input(root, [actualPhase, onlyTicketStatus]));
      assert.deepStrictEqual(
        result.active.map((relation) => relation.taskId),
        ['APP-phase-active']
      );
      assert.deepStrictEqual(
        result.planned.map((relation) => relation.taskId),
        ['APP-status-only']
      );
      assert.strictEqual(result.active[0]?.evidence, 'active');
    });
  });

  it('keeps TODO work planned and accepts an exact not-yet-created target', () => {
    isolatedRoot((root) => {
      const future = ticket('APP-future', [phase({ targetFiles: ['src/future.ts'] })]);
      const result = resolveFileRelations({
        ...input(root, [future]),
        file: 'src/future.ts',
      });
      assert.deepStrictEqual(
        result.planned.map((relation) => relation.target),
        ['src/future.ts']
      );
      assert.ok(!codes(result).includes('SDD_FILE_TARGET_PATH_INVALID'));
    });
  });

  it('keeps a declared-only DONE target in history without claiming observed change', () => {
    isolatedRoot((root) => {
      const done = ticket('APP-done', [phase({ state: 'done' })], { status: 'done' });
      const result = resolveFileRelations(input(root, [done]));
      assert.strictEqual(result.history.length, 1);
      assert.strictEqual(result.history[0]?.evidence, 'declared-only-closed');
      assert.strictEqual(result.active.length, 0);
    });
  });

  it('classifies blocker state separately from active work', () => {
    isolatedRoot((root) => {
      const blocked = ticket('APP-blocked', [phase({ state: 'in-progress' })], {
        status: 'in-progress',
        blockerActive: true,
      });
      const result = resolveFileRelations(input(root, [blocked]));
      assert.strictEqual(result.active.length, 0);
      assert.strictEqual(result.blocked[0]?.taskId, 'APP-blocked');
      assert.strictEqual(result.blocked[0]?.evidence, 'declared');
    });
  });

  it('uses receipt evidence without promoting it to Git attribution', () => {
    isolatedRoot((root) => {
      const receipted = ticket(
        'APP-receipt',
        [
          phase({
            state: 'done',
            evidence: [{ path: 'src/existing.ts', kind: 'verified-target' }],
          }),
        ],
        { status: 'done' }
      );
      const result = resolveFileRelations(input(root, [receipted]));
      assert.strictEqual(result.history[0]?.evidence, 'verified-target');
    });
  });

  it('uses Git evidence only when the caller supplies actual attribution', () => {
    isolatedRoot((root) => {
      const attributed = ticket(
        'APP-git',
        [
          phase({
            state: 'done',
            evidence: [
              { path: 'src/existing.ts', kind: 'verified-target' },
              { path: 'src/existing.ts', kind: 'git-attributed' },
            ],
          }),
        ],
        { status: 'done' }
      );
      const result = resolveFileRelations(input(root, [attributed]));
      assert.strictEqual(result.history[0]?.evidence, 'git-attributed');
    });
  });

  it('keeps unsupported deletion provenance explicit and unobserved', () => {
    isolatedRoot((root) => {
      const deletion = ticket(
        'APP-delete',
        [
          phase({
            state: 'done',
            targetFiles: [],
            deletedFiles: ['src/removed.ts'],
            evidence: [{ path: 'src/removed.ts', kind: 'unknown' }],
          }),
        ],
        { status: 'done' }
      );
      const result = resolveFileRelations({
        ...input(root, [deletion]),
        file: 'src/removed.ts',
      });
      assert.strictEqual(result.history[0]?.evidence, 'unknown');
      assert.ok(codes(result).includes('SDD_FILE_PROVENANCE_UNKNOWN'));
      assert.ok(!['deleted', 'git-attributed'].includes(result.history[0]?.evidence ?? ''));
    });
  });

  it('classifies caller-validated deletion evidence as deleted', () => {
    isolatedRoot((root) => {
      const deletion = ticket(
        'APP-delete-verified',
        [
          phase({
            state: 'done',
            targetFiles: [],
            deletedFiles: ['src/removed.ts'],
            evidence: [{ path: 'src/removed.ts', kind: 'deleted' }],
          }),
        ],
        { status: 'done' }
      );
      const result = resolveFileRelations({
        ...input(root, [deletion]),
        file: 'src/removed.ts',
      });
      assert.strictEqual(result.history[0]?.evidence, 'deleted');
      assert.ok(!codes(result).includes('SDD_FILE_PROVENANCE_UNKNOWN'));
    });
  });

  it('distinguishes absent evidence, explicit unknown, and stronger observed evidence', () => {
    isolatedRoot((root) => {
      const noEvidence = resolveFileRelations(
        input(root, [ticket('APP-none', [phase({ state: 'done' })], { status: 'done' })])
      );
      assert.strictEqual(noEvidence.history[0]?.evidence, 'declared-only-closed');
      assert.ok(!codes(noEvidence).includes('SDD_FILE_PROVENANCE_UNKNOWN'));

      const ambiguous = resolveFileRelations(
        input(root, [
          ticket(
            'APP-ambiguous',
            [
              phase({
                state: 'done',
                evidence: [{ path: 'src/existing.ts', kind: 'unknown' }],
              }),
            ],
            { status: 'done' }
          ),
        ])
      );
      assert.strictEqual(ambiguous.history[0]?.evidence, 'unknown');
      assert.ok(codes(ambiguous).includes('SDD_FILE_PROVENANCE_UNKNOWN'));

      const observed = resolveFileRelations(
        input(root, [
          ticket(
            'APP-observed',
            [
              phase({
                state: 'done',
                evidence: [
                  { path: 'src/existing.ts', kind: 'unknown' },
                  { path: 'src/existing.ts', kind: 'git-attributed' },
                ],
              }),
            ],
            { status: 'done' }
          ),
        ])
      );
      assert.strictEqual(observed.history[0]?.evidence, 'git-attributed');
      assert.ok(!codes(observed).includes('SDD_FILE_PROVENANCE_UNKNOWN'));
    });
  });
});

describe('resolveFileRelations exact matching and findings', () => {
  it('fails closed when the canonical spec owner is ambiguous', () => {
    isolatedRoot((root) => {
      const result = resolveFileRelations({
        ...input(root, []),
        spec: {
          status: 'ambiguous',
          id: 'SPEC-1',
          candidates: ['specs/a/a.spec.md', 'specs/b/b.spec.md'],
        },
      });
      assert.deepStrictEqual(codes(result), ['SDD_FILE_SPEC_OWNER_AMBIGUOUS']);
      assert.strictEqual(result.semanticOwner.evidence, 'unknown');
      assert.strictEqual(result.findings[0]?.blocking, true);
    });
  });

  it('rejects glob claims and never infers basename or substring matches', () => {
    isolatedRoot((root) => {
      const claims = ticket('APP-paths', [
        phase({
          targetFiles: ['existing.ts', 'src/existing.ts.backup', 'src/*.ts'],
        }),
      ]);
      const result = resolveFileRelations(input(root, [claims]));
      assert.strictEqual(result.planned.length, 0);
      assert.deepStrictEqual(codes(result), ['SDD_FILE_TARGET_PATH_INVALID']);
      assert.strictEqual(result.findings[0]?.path, 'src/*.ts');
    });
  });

  it('fails closed on multiple active writers and active/spec mismatch', () => {
    isolatedRoot((root) => {
      const first = ticket('APP-a', [phase({ state: 'in-progress' })], {
        status: 'in-progress',
      });
      const second = ticket('APP-b', [phase({ state: 'in-progress', specIds: ['OTHER'] })], {
        status: 'in-progress',
      });
      const result = resolveFileRelations(input(root, [second, first]));
      assert.deepStrictEqual(
        result.active.map((relation) => relation.taskId),
        ['APP-a', 'APP-b']
      );
      assert.ok(codes(result).includes('SDD_FILE_ACTIVE_WRITERS_COLLISION'));
      assert.ok(codes(result).includes('SDD_FILE_ACTIVE_SPEC_MISMATCH'));
      assert.ok(
        result.findings
          .filter((finding) => finding.code !== 'SDD_FILE_ACTIVE_PLANNED_OVERLAP')
          .every((finding) => finding.blocking)
      );
    });
  });

  it('does not confuse two active phases of one ticket with multiple writers', () => {
    isolatedRoot((root) => {
      const sameWriter = ticket(
        'APP-one',
        [phase({ id: 'P1', state: 'in-progress' }), phase({ id: 'P2', state: 'in-progress' })],
        { status: 'in-progress' }
      );
      const result = resolveFileRelations(input(root, [sameWriter]));
      assert.strictEqual(result.active.length, 2);
      assert.ok(!codes(result).includes('SDD_FILE_ACTIVE_WRITERS_COLLISION'));
    });
  });

  it('accepts an explicit dependency path as writer serialization', () => {
    isolatedRoot((root) => {
      const predecessor = ticket('APP-first', [phase({ state: 'in-progress' })], {
        status: 'in-progress',
      });
      const successor = ticket('APP-second', [phase({ state: 'in-progress' })], {
        status: 'in-progress',
        dependencies: ['APP-middle'],
      });
      const middle = ticket('APP-middle', [], { dependencies: ['APP-first'] });
      const result = resolveFileRelations(input(root, [successor, middle, predecessor]));
      assert.ok(!codes(result).includes('SDD_FILE_ACTIVE_WRITERS_COLLISION'));
    });
  });

  it('warns only for active/planned overlap across distinct tickets', () => {
    isolatedRoot((root) => {
      const sameTicket = ticket(
        'APP-one',
        [phase({ id: 'P1', state: 'in-progress' }), phase({ id: 'P2', state: 'todo' })],
        { status: 'in-progress' }
      );
      const sameResult = resolveFileRelations(input(root, [sameTicket]));
      assert.ok(!codes(sameResult).includes('SDD_FILE_ACTIVE_PLANNED_OVERLAP'));

      const otherPlanned = ticket('APP-two', [phase({ state: 'todo' })]);
      const crossResult = resolveFileRelations(input(root, [sameTicket, otherPlanned]));
      assert.ok(codes(crossResult).includes('SDD_FILE_ACTIVE_PLANNED_OVERLAP'));
    });
  });

  it('allows cross-spec work only when references include the file owner spec', () => {
    isolatedRoot((root) => {
      const crossSpec = ticket(
        'APP-cross',
        [
          phase({
            state: 'in-progress',
            specIds: ['OTHER', 'SPEC-1'],
          }),
        ],
        { status: 'in-progress' }
      );
      const result = resolveFileRelations(input(root, [crossSpec]));
      assert.ok(!codes(result).includes('SDD_FILE_ACTIVE_SPEC_MISMATCH'));
    });
  });

  it('sorts relation and finding output deterministically', () => {
    isolatedRoot((root) => {
      const z = ticket('APP-z', [phase({ state: 'in-progress', specIds: ['OTHER'] })], {
        status: 'in-progress',
      });
      const a = ticket('APP-a', [phase({ state: 'in-progress' })], {
        status: 'in-progress',
      });
      const left = resolveFileRelations(input(root, [z, a]));
      const right = resolveFileRelations(input(root, [a, z]));
      assert.deepStrictEqual(left, right);
    });
  });
});

describe('structured boundary and flow grandfathering', () => {
  it('adapts ticket sections only through canonical parsers and caller spec resolution', () => {
    const content = [
      '<!--SECTION:META-->',
      '- **Task-ID:** APP-canonical',
      '- **Status:** [~] IN_PROGRESS',
      '- **Spec References:**',
      '  - Contract: [Contract](specs/app/app.spec.md#contract)',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | impl | — | [~] IN_PROGRESS |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Target Files:**',
      '  - src/existing.ts',
      '- **Deleted Files:**',
      '  - none',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '### Round 1 — 2026-09-20, initial',
      '#### P1',
      '- 🛑 `2026-09-20T10:00:00Z` BLOCKED dependency unavailable',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    const adapted = fileRelationTicketFromContent({
      file: 'specs/app/app.task.APP-canonical.md',
      flow: 'v2',
      content,
      resolveSpecReference: (reference) =>
        reference.startsWith('specs/app/app.spec.md') ? 'SPEC-1' : null,
    });
    assert.strictEqual(adapted.ok, true);
    if (!adapted.ok) return;
    assert.strictEqual(adapted.ticket.status, 'in-progress');
    assert.deepStrictEqual(adapted.ticket.dependencies, []);
    assert.strictEqual(adapted.ticket.blockerActive, true);
    assert.strictEqual(adapted.ticket.phases[0]?.state, 'in-progress');
    assert.deepStrictEqual(adapted.ticket.phases[0]?.specIds, ['SPEC-1']);
  });

  it('does not treat a raw receipt block as verified evidence without a canonical validator result', () => {
    const rawReceipt = [
      '<!--SECTION:META-->',
      '- **Task-ID:** APP-raw-receipt',
      '- **Status:** [x] DONE',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|----|------|------|--------|',
      '| P1 | impl | — | [x] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Target Files:**',
      '  - src/existing.ts',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:EXECUTION_LOG-->',
      '<!--SDD_PHASE_RECEIPT:P1-->',
      '```json',
      '{}',
      '```',
      '<!--/SDD_PHASE_RECEIPT:P1-->',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    const adapted = fileRelationTicketFromContent({
      file: 'specs/app/app.task.APP-raw-receipt.md',
      flow: 'v2',
      content: rawReceipt,
      resolveSpecReference: () => null,
    });
    assert.strictEqual(adapted.ok, true);
    if (!adapted.ok) return;
    assert.deepStrictEqual(adapted.ticket.phases[0]?.evidence, []);
  });

  it('keeps V1 scopes free of V2-only findings while the equivalent migrated scope is strict', () => {
    isolatedRoot((root) => {
      const legacyTicket = ticket(
        'APP-legacy',
        [phase({ state: 'in-progress', targetFiles: ['src/*.ts'], specIds: [] })],
        { flow: 'v1', status: 'in-progress' }
      );
      const legacy = resolveFileRelations({
        ...input(root, [legacyTicket]),
        flow: 'v1',
        spec: { status: 'unresolved', id: null },
        hasLegacyTasks: true,
      });
      assert.deepStrictEqual(legacy.findings, []);

      const migrated = resolveFileRelations({
        ...input(root, [{ ...legacyTicket, flow: 'v2' }]),
        spec: { status: 'unresolved', id: null },
        hasLegacyTasks: true,
      });
      assert.deepStrictEqual(codes(migrated), [
        'SDD_FILE_SPEC_OWNER_UNRESOLVED',
        'SDD_FILE_TARGET_PATH_INVALID',
        'SDD_FILE_V2_TASKS_FORBIDDEN',
      ]);
    });
  });

  it('does not create V2-only collision or overlap findings from untouched V1 tickets in a mixed corpus', () => {
    isolatedRoot((root) => {
      const first = ticket('APP-v1-a', [phase({ state: 'in-progress', specIds: [] })], {
        flow: 'v1',
        status: 'in-progress',
      });
      const second = ticket('APP-v1-b', [phase({ state: 'in-progress', specIds: [] })], {
        flow: 'v1',
        status: 'in-progress',
      });
      const planned = ticket('APP-v1-planned', [phase({ specIds: [] })], { flow: 'v1' });
      const result = resolveFileRelations(input(root, [first, second, planned]));
      assert.strictEqual(result.active.length, 2);
      assert.strictEqual(result.planned.length, 1);
      assert.deepStrictEqual(result.findings, []);
    });
  });
});
