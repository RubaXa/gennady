// @file: Unit tests for queryTask — find files by task ID (S2 scenario).
// @spec: CLI-ORIENT
// @consumers: OrientCommand

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
      makeFile('/project/src/a.ts', ['DP-fields']),
      makeFile('/project/src/b.ts', ['DP-jsdoc']),
    ];
    const results = queryTask(files, ['DP-fields']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].taskId, 'DP-fields');
    assert.strictEqual(results[0].files.length, 1);
    assert.strictEqual(results[0].files[0].absPath, '/project/src/a.ts');
  });

  it('multiple tasks: returns grouped results', () => {
    const files = [
      makeFile('/project/src/a.ts', ['DP-fields']),
      makeFile('/project/src/b.ts', ['DP-jsdoc']),
      makeFile('/project/src/c.ts', ['DP-fields', 'DP-jsdoc']),
    ];
    const results = queryTask(files, ['DP-fields', 'DP-jsdoc']);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].taskId, 'DP-fields');
    assert.strictEqual(results[0].files.length, 2);
    assert.strictEqual(results[1].taskId, 'DP-jsdoc');
    assert.strictEqual(results[1].files.length, 2);
  });

  it('task not found: returns empty files array', () => {
    const files = [makeFile('/project/src/a.ts', ['DP-fields'])];
    const results = queryTask(files, ['TSK-999']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].taskId, 'TSK-999');
    assert.strictEqual(results[0].files.length, 0);
  });

  it('handles duplicate task IDs in input', () => {
    const files = [makeFile('/project/src/a.ts', ['DP-fields'])];
    const results = queryTask(files, ['DP-fields', 'DP-fields']);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].files.length, 1);
    assert.strictEqual(results[1].files.length, 1);
  });
});
