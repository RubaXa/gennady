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
  it('returns empty array for empty task selection', () => {
    assert.deepEqual(queryTask([], []), []);
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
