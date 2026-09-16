// @file: Unit tests for pickableTasks — the deterministic execution map (ready = TODO + deps DONE).
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickabilityBlockers,
  pickableTasks,
  type PickableAuditContext,
  type TicketRef,
} from '../check.ts';

const ref = (taskId: string, status: string, dependencies: string[] = []): TicketRef => ({
  file: `${taskId}.md`,
  taskId,
  status,
  dependencies,
});

const ids = (refs: TicketRef[]): string[] => refs.map((r) => r.taskId ?? '');

const crossSpecAudit = (validAuditOwners: string[] = []): PickableAuditContext => ({
  ownerByTaskId: new Map([
    ['A', '/repo/specs/a/a.spec.md'],
    ['B', '/repo/specs/b/b.spec.md'],
  ]),
  validAuditOwners: new Set(validAuditOwners),
});

describe('pickableTasks', () => {
  it('a TODO ticket whose deps are all DONE is pickable', () => {
    assert.deepStrictEqual(
      ids(pickableTasks([ref('A', '[x] DONE'), ref('B', '[ ] TODO', ['A'])])),
      ['B']
    );
  });

  it('a TODO ticket with a not-yet-DONE dep is blocked', () => {
    const refs = [ref('A', '[ ] TODO'), ref('B', '[ ] TODO', ['A'])];
    assert.deepStrictEqual(ids(pickableTasks(refs)), ['A']); // A is free; B waits on A
  });

  it('DONE tickets are never pickable', () => {
    assert.deepStrictEqual(ids(pickableTasks([ref('A', '[x] DONE')])), []);
  });

  it('a TODO ticket with no deps is pickable', () => {
    assert.deepStrictEqual(ids(pickableTasks([ref('A', '[ ] TODO')])), ['A']);
  });

  it('a placeholder "None (…)" dependency is treated as no dependency', () => {
    assert.deepStrictEqual(
      ids(pickableTasks([ref('A', '[ ] TODO', ['None (via scope cascade)'])])),
      ['A']
    );
  });

  it('B2-13: a V2 cross-spec DONE dependency without a valid audit receipt stays blocked', () => {
    const refs = [
      { ...ref('A', '[x] DONE'), flowVersion: 'v2' as const },
      { ...ref('B', '[ ] TODO', ['A']), flowVersion: 'v2' as const },
    ];
    assert.deepStrictEqual(ids(pickableTasks(refs, crossSpecAudit())), []);
    assert.deepStrictEqual(pickabilityBlockers(refs[1] as TicketRef, refs, crossSpecAudit()), [
      'A (group audit receipt)',
    ]);
  });

  it('B2-13: the equivalent V2 dependency becomes pickable with its valid group audit receipt', () => {
    const refs = [
      { ...ref('A', '[x] DONE'), flowVersion: 'v2' as const },
      { ...ref('B', '[ ] TODO', ['A']), flowVersion: 'v2' as const },
    ];
    assert.deepStrictEqual(ids(pickableTasks(refs, crossSpecAudit(['/repo/specs/a/a.spec.md']))), [
      'B',
    ]);
  });

  it('B2-13: a V2 candidate without a resolvable owning spec fails closed', () => {
    const refs = [
      { ...ref('A', '[x] DONE'), flowVersion: 'v2' as const },
      { ...ref('B', '[ ] TODO', ['A']), flowVersion: 'v2' as const },
    ];
    const audit: PickableAuditContext = {
      ownerByTaskId: new Map([['A', '/repo/specs/a/a.spec.md']]),
      validAuditOwners: new Set(['/repo/specs/a/a.spec.md']),
    };
    assert.deepStrictEqual(ids(pickableTasks(refs, audit)), []);
    assert.deepStrictEqual(pickabilityBlockers(refs[1] as TicketRef, refs, audit), [
      'B (owning spec)',
    ]);
  });

  it('B2-13: a DONE V2 dependency without a resolvable owning spec fails closed', () => {
    const refs = [
      { ...ref('A', '[x] DONE'), flowVersion: 'v2' as const },
      { ...ref('B', '[ ] TODO', ['A']), flowVersion: 'v2' as const },
    ];
    const audit: PickableAuditContext = {
      ownerByTaskId: new Map([['B', '/repo/specs/b/b.spec.md']]),
      validAuditOwners: new Set(),
    };
    assert.deepStrictEqual(ids(pickableTasks(refs, audit)), []);
    assert.deepStrictEqual(pickabilityBlockers(refs[1] as TicketRef, refs, audit), [
      'A (owning spec)',
    ]);
  });

  it('B2-13: V1 remains grandfathered and status-only without a group audit receipt', () => {
    const refs = [
      { ...ref('A', '[x] DONE'), flowVersion: 'v1' as const },
      { ...ref('B', '[ ] TODO', ['A']), flowVersion: 'v1' as const },
    ];
    assert.deepStrictEqual(ids(pickableTasks(refs, crossSpecAudit())), ['B']);
  });
});
