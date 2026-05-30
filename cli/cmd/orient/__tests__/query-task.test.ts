// @file: Unit tests for queryTask — find files by task ID (S2 scenario).
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryTask } from '../core/query-task.ts';
import type { ScannedFile } from '../orient.types.ts';

function makeFile(absPath: string, taskIds: string[]): ScannedFile {
  return {
    absPath,
    header: { file: 'test file', tasks: taskIds, consumers: [] },
    exports: [],
  };
}

describe('queryTask', () => {
  it('returns empty array for empty task list', () => {
    const results = queryTask([], []);
    assert.deepStrictEqual(results, []);
  });

  it('single task: finds matching files', () => {
    const files = [
      makeFile('/project/src/a.ts', ['TSK-01']),
      makeFile('/project/src/b.ts', ['TSK-02']),
    ];
    const results = queryTask(files, ['TSK-01']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].taskId, 'TSK-01');
    assert.strictEqual(results[0].files.length, 1);
    assert.strictEqual(results[0].files[0].absPath, '/project/src/a.ts');
  });

  it('multiple tasks: returns grouped results', () => {
    const files = [
      makeFile('/project/src/a.ts', ['TSK-01']),
      makeFile('/project/src/b.ts', ['TSK-02']),
      makeFile('/project/src/c.ts', ['TSK-01', 'TSK-02']),
    ];
    const results = queryTask(files, ['TSK-01', 'TSK-02']);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].taskId, 'TSK-01');
    assert.strictEqual(results[0].files.length, 2);
    assert.strictEqual(results[1].taskId, 'TSK-02');
    assert.strictEqual(results[1].files.length, 2);
  });

  it('task not found: returns empty files array', () => {
    const files = [makeFile('/project/src/a.ts', ['TSK-01'])];
    const results = queryTask(files, ['TSK-999']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].taskId, 'TSK-999');
    assert.strictEqual(results[0].files.length, 0);
  });

  it('handles duplicate task IDs in input', () => {
    const files = [makeFile('/project/src/a.ts', ['TSK-01'])];
    const results = queryTask(files, ['TSK-01', 'TSK-01']);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].files.length, 1);
    assert.strictEqual(results[1].files.length, 1);
  });
});
