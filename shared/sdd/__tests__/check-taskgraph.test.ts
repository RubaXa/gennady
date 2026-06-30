// @file: Unit tests for the cross-ticket task-DAG check (collisions, unresolved deps, cycles).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTaskGraph, type TicketRef } from '../check.ts';

const ref = (file: string, taskId: string | null, dependencies: string[] = []): TicketRef => ({
  file,
  taskId,
  dependencies,
});
const codes = (refs: TicketRef[]): string[] => checkTaskGraph(refs).map((f) => f.code);

describe('checkTaskGraph', () => {
  it('clean DAG → no findings', () => {
    assert.deepStrictEqual(checkTaskGraph([ref('a.md', 'cli-a'), ref('b.md', 'cli-b', ['cli-a'])]), []);
  });

  it('flags a Task-ID used by two tickets', () => {
    assert.ok(codes([ref('a.md', 'cli-a'), ref('b.md', 'cli-a')]).includes('SDD_TASK_ID_COLLISION'));
  });

  it('flags a dependency that resolves to no ticket', () => {
    assert.ok(codes([ref('a.md', 'cli-a', ['cli-ghost'])]).includes('SDD_DEP_UNRESOLVED'));
  });

  it('flags a dependency cycle', () => {
    assert.ok(codes([ref('a.md', 'cli-a', ['cli-b']), ref('b.md', 'cli-b', ['cli-a'])]).includes('SDD_DAG_CYCLE'));
  });

  it('ignores tickets without a Task-ID for collision/cycle', () => {
    assert.deepStrictEqual(checkTaskGraph([ref('a.md', null), ref('b.md', null)]), []);
  });
});
