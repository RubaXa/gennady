// @file: Resolver-backed task lookup separates real relations from legacy migration evidence.
// @spec: CLI-ORIENT
// @consumers: OrientCommand

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryTask } from '../core/query-task.ts';
import type { ScannedFile } from '../orient.types.ts';
import type { FileRelationsResult } from '../../../../shared/sdd/file-relations.types.ts';

function file(absPath: string, tasks: string[]): ScannedFile {
  return { absPath, header: { file: 'source', tasks, consumers: [] }, exports: [] };
}

function relation(path: string, taskId: string): FileRelationsResult {
  return {
    file: path,
    flow: 'v2',
    semanticOwner: {
      kind: 'semantic-owner',
      evidence: 'declared',
      spec: { status: 'resolved', id: 'APP', path: 'specs/app/app.spec.md' },
    },
    active: [
      {
        kind: 'active',
        taskId,
        ticketFile: 'specs/app/app.task.APP-work.md',
        phaseId: 'P1',
        target: path,
        targetKind: 'target',
        evidence: 'active',
      },
    ],
    planned: [],
    blocked: [],
    history: [],
    findings: [],
  };
}

describe('queryTask', () => {
  it('returns empty array for empty task list', () => {
    assert.deepEqual(queryTask([], []), []);
  });
  it('single task: finds matching files', () => {
    const a = file('/project/src/a.ts', ['APP-stale']);
    const b = file('/project/src/b.ts', ['APP-work']);
    const evidence = new Map([
      [a.absPath, relation('src/a.ts', 'APP-work')],
      [b.absPath, relation('src/b.ts', 'APP-test')],
    ]);
    const results = queryTask([a, b], ['APP-work'], evidence);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.taskId, 'APP-work');
    assert.deepEqual(results[0]?.files, [a]);
    assert.deepEqual(results[0]?.migrationFiles, [b]);
  });
  it('multiple tasks: returns grouped results', () => {
    const a = file('/project/src/a.ts', []);
    const b = file('/project/src/b.ts', []);
    const c = file('/project/src/c.ts', ['APP-stale']);
    const shared = relation('src/c.ts', 'APP-work');
    shared.planned = relation('src/c.ts', 'APP-test').active.map((active) => ({
      ...active,
      kind: 'planned',
      evidence: 'declared',
    }));
    const evidence = new Map([
      [a.absPath, relation('src/a.ts', 'APP-work')],
      [b.absPath, relation('src/b.ts', 'APP-test')],
      [c.absPath, shared],
    ]);
    const results = queryTask([a, b, c], ['APP-work', 'APP-test'], evidence);
    assert.equal(results.length, 2);
    assert.equal(results[0]?.taskId, 'APP-work');
    assert.deepEqual(results[0]?.files, [a, c]);
    assert.equal(results[1]?.taskId, 'APP-test');
    assert.deepEqual(results[1]?.files, [b, c]);
    assert.deepEqual(
      results.map((result) => result.migrationFiles),
      [[], []]
    );
  });
  it('task not found: returns empty files array', () => {
    const source = file('/project/src/a.ts', ['APP-missing']);
    const evidence = new Map([[source.absPath, relation('src/a.ts', 'APP-work')]]);
    const results = queryTask([source], ['APP-missing'], evidence);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.taskId, 'APP-missing');
    assert.deepEqual(results[0]?.files, []);
    assert.deepEqual(results[0]?.migrationFiles, [source]);
  });
  it('handles duplicate task IDs in input', () => {
    const source = file('/project/src/a.ts', []);
    const evidence = new Map([[source.absPath, relation('src/a.ts', 'APP-work')]]);
    const results = queryTask([source], ['APP-work', 'APP-work'], evidence);
    assert.equal(results.length, 2);
    assert.deepEqual(
      results.map((result) => result.taskId),
      ['APP-work', 'APP-work']
    );
    assert.deepEqual(
      results.map((result) => result.files),
      [[source], [source]]
    );
    assert.deepEqual(
      results.map((result) => result.migrationFiles),
      [[], []]
    );
  });
  it('does not assign ownership from legacy @tasks', () => {
    const source = file('/project/source.ts', ['TSK-1']);
    const result = queryTask([source], ['TSK-1'])[0];
    assert.deepEqual(result?.files, []);
    assert.deepEqual(result?.migrationFiles, [source]);
  });
  it('uses canonical relations independently of stale legacy headers', () => {
    const source = file('/project/source.ts', ['TSK-old']);
    const evidence = new Map([[source.absPath, relation('source.ts', 'APP-work')]]);
    const results = queryTask([source], ['APP-work', 'TSK-old'], evidence);
    assert.deepEqual(results[0]?.files, [source]);
    assert.deepEqual(results[0]?.migrationFiles, []);
    assert.deepEqual(results[1]?.files, []);
    assert.deepEqual(results[1]?.migrationFiles, [source]);
  });
  it('does not promote legacy resolver output into canonical task ownership', () => {
    const source = file('/project/source.ts', ['TSK-1']);
    const evidence = relation('source.ts', 'TSK-1');
    evidence.flow = 'v1';
    const result = queryTask([source], ['TSK-1'], new Map([[source.absPath, evidence]]))[0];
    assert.deepEqual(result?.files, []);
    assert.deepEqual(result?.migrationFiles, [source]);
  });
});
