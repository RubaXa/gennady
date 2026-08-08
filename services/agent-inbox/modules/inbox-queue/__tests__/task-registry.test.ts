// @file: Unit tests for TaskRegistry — 19 type registry, formal grammar references, dedup key, supersede, enqueue result
// @consumers: node:test runner
// @tasks: TSK-159

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TaskRegistry,
  typeRef,
  globRef,
  allOfRef,
  producerOfRef,
  externalRef,
  type TaskReference,
  type TaskInstance,
} from '../task-registry.ts';
import { InMemoryTaskQueue } from '../task-queue.ts';

describe('contract: all registry references resolve', () => {
  it('all task type names resolve', () => {
    const registry = new TaskRegistry();
    const names = [
      'prepare_env',
      'plan',
      'enrich',
      'gate_coverage',
      'gate_verdict',
      'track_*',
      'lens_*',
      'synthesize',
      'delta_review',
      'delta_prepare',
      'delta_changeset',
      'delta_tracks',
      'synthesize_delta',
      'gate_verdict_delta',
      'verify_fix',
      'thread_triage',
      'fact_check',
      'deepen',
      'widen_search',
      'mutate_artifact',
      'chat_question',
      'effect_*',
      'tail_author',
      'tail_reviewer',
    ];
    for (const name of names) {
      const resolved = registry.resolveType(name);
      assert.ok(resolved, `type ${name} should resolve`);
      assert.strictEqual(resolved.name, name);
    }
  });

  it('type-name reference resolves to TaskType', () => {
    const registry = new TaskRegistry();
    const ref = typeRef('fact_check');
    const resolved = registry.matchReference(ref, 'fact_check');
    assert.strictEqual(resolved, true);
  });

  it('glob pattern matches multiple type names', () => {
    const registry = new TaskRegistry();
    const ref = globRef('track_*');
    assert.strictEqual(registry.matchReference(ref, 'track_foo'), true);
    assert.strictEqual(registry.matchReference(ref, 'track_bar'), true);
    assert.strictEqual(registry.matchReference(ref, 'lens_x'), false);
  });

  it('allOf aggregate evaluates via evaluateReference', () => {
    const registry = new TaskRegistry();
    const instances: TaskInstance[] = [
      {
        taskId: '#1',
        type: 'fact_check',
        status: 'done',
        params: {},
        dependsOn: [],
        dedupKey: 'fc',
        priority: 90,
        createdBy: 'test',
        createdAt: new Date().toISOString(),
      },
      {
        taskId: '#2',
        type: 'deepen',
        status: 'done',
        params: {},
        dependsOn: [],
        dedupKey: 'dp',
        priority: 90,
        createdBy: 'test',
        createdAt: new Date().toISOString(),
      },
    ];
    const ref = allOfRef([typeRef('fact_check'), typeRef('deepen')]);
    const satisfied = registry.evaluateReference(ref, new Set(['fact_check', 'deepen']), instances);
    assert.strictEqual(satisfied, true);
  });

  it('producerOf reference resolves via evaluateReference', () => {
    const registry = new TaskRegistry();
    const instances: TaskInstance[] = [
      {
        taskId: '#1',
        type: 'synthesize',
        status: 'done',
        params: { artifact: 'summary' },
        dependsOn: [],
        dedupKey: 'syn',
        priority: 10,
        createdBy: 'test',
        createdAt: new Date().toISOString(),
      },
    ];
    const ref = producerOfRef('summary');
    const satisfied = registry.evaluateReference(ref, new Set(), instances);
    assert.strictEqual(satisfied, true);
  });

  it('external reference evaluates to false', () => {
    const registry = new TaskRegistry();
    const ref = externalRef('operator_decision');
    assert.strictEqual(registry.matchReference(ref, 'any'), false);
  });
});

describe('enqueue dedupes and supersedes by dedupKey', () => {
  it('enqueue with same dedupKey → supersedes queued task in-place', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const first = queue.enqueue('mr', 'verify_fix', { x: 1 }, 'my-key');
    const second = queue.enqueue('mr', 'verify_fix', { x: 2 }, 'my-key');

    assert.strictEqual(first.taskId, second.taskId);
    assert.strictEqual(first.position, second.position);
  });

  it('enqueue with different dedupKey → different taskId', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const first = queue.enqueue('mr', 'verify_fix', {}, 'key-a');
    const second = queue.enqueue('mr', 'verify_fix', {}, 'key-b');

    assert.notStrictEqual(first.taskId, second.taskId);
  });

  it('dedupKey collision only within same MR', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const mrA = queue.enqueue('mr-a', 'verify_fix', {}, 'shared-key');
    const mrB = queue.enqueue('mr-b', 'verify_fix', {}, 'shared-key');

    assert.ok(mrA.taskId);
    assert.ok(mrB.taskId);
    assert.strictEqual(queue.state('mr-a').length, 1);
    assert.strictEqual(queue.state('mr-b').length, 1);
  });
});

describe('supersede does not kill running task', () => {
  it('queued task with same dedupKey → replaced in-place', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const first = queue.enqueue('mr', 'verify_fix', { v: 1 }, 'key');
    const firstInst = queue.instance('mr', first.taskId);
    assert.ok(firstInst);
    assert.strictEqual(firstInst.params.v, 1);

    const second = queue.enqueue('mr', 'verify_fix', { v: 2 }, 'key');
    assert.strictEqual(second.taskId, first.taskId);
    assert.strictEqual(firstInst.params.v, 2);
  });

  it('running task with same dedupKey → NOT superseded', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const result = queue.enqueue('mr', 'verify_fix', { v: 1 }, 'key');
    const inst = queue.instance('mr', result.taskId);
    assert.ok(inst);
    inst.status = 'running';

    const second = queue.enqueue('mr', 'verify_fix', { v: 2 }, 'key');
    assert.strictEqual(second.taskId, result.taskId);
    assert.strictEqual(inst.status, 'running');
    assert.strictEqual(inst.params.v, 1);
  });

  it('multiple supersede → only latest survives', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const first = queue.enqueue('mr', 'verify_fix', { v: 1 }, 'key');
    const inst = queue.instance('mr', first.taskId);
    assert.ok(inst);
    assert.strictEqual(inst.params.v, 1);

    queue.enqueue('mr', 'verify_fix', { v: 2 }, 'key');
    assert.strictEqual(inst.params.v, 2);

    queue.enqueue('mr', 'verify_fix', { v: 3 }, 'key');
    assert.strictEqual(inst.params.v, 3);
  });
});

describe('enqueue result shape', () => {
  it('enqueue returns taskId and position for new task', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const result = queue.enqueue('mr', 'verify_fix', {});

    assert.ok(typeof result.taskId === 'string');
    assert.ok(typeof result.position === 'number');
  });

  it('enqueue returns same taskId on dedup collision', () => {
    const registry = new TaskRegistry();
    const queue = new InMemoryTaskQueue(registry);
    const first = queue.enqueue('mr', 'verify_fix', {}, 'dedup-key');
    const second = queue.enqueue('mr', 'verify_fix', {}, 'dedup-key');

    assert.strictEqual(second.taskId, first.taskId);
  });
});
