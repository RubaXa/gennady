// @file: Unit tests for pickableTasks — the deterministic execution map (ready = TODO + deps DONE).
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickableTasks, type TicketRef } from '../check.ts';

const ref = (taskId: string, status: string, dependencies: string[] = []): TicketRef => ({
  file: `${taskId}.md`,
  taskId,
  status,
  dependencies,
});

const ids = (refs: TicketRef[]): string[] => refs.map((r) => r.taskId ?? '');

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
});
