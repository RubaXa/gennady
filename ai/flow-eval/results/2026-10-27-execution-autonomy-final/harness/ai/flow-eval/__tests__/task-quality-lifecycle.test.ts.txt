// @file: Hanging SDK requests and interruption cannot prevent bounded microprobe cleanup.
// @spec: AI-SKILLS
// @consumers: finite task-quality live runner lifecycle verification

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { cleanupTaskQualitySession, withTaskQualityDeadline } from '../task-quality-lifecycle.ts';

it('bounds create, evidence and delete requests even if the backend ignores cancellation', async () => {
  for (const name of ['create', 'trajectory', 'usage', 'delete']) {
    let requestSignal: AbortSignal | undefined;
    await assert.rejects(
      withTaskQualityDeadline((signal) => {
        requestSignal = signal;
        return new Promise<never>(() => {});
      }, 15),
      /Lifecycle deadline exceeded/,
      name
    );
    assert.equal(requestSignal?.aborted, true, name);
  }
});

it('honors operator cancellation, including a signal already aborted before the request', async () => {
  const stop = new AbortController();
  const pending = withTaskQualityDeadline(() => new Promise<never>(() => {}), 1000, stop.signal);
  stop.abort(new Error('operator interrupted'));
  await assert.rejects(pending, /operator interrupted/);
  let spawned = false;
  await assert.rejects(
    withTaskQualityDeadline(
      async () => {
        spawned = true;
      },
      1000,
      stop.signal
    ),
    /operator interrupted/
  );
  assert.equal(spawned, false);
});

it('removes the sandbox after hanging, rejected or successful session deletion', async () => {
  for (const mode of ['hang', 'reject', 'success']) {
    let removals = 0;
    const deleted = await cleanupTaskQualitySession(
      async () => {
        if (mode === 'hang') return new Promise<never>(() => {});
        if (mode === 'reject') throw new Error('server unavailable');
        return true;
      },
      () => {
        removals++;
      },
      15
    );
    assert.equal(removals, 1, mode);
    assert.equal(deleted, mode === 'success', mode);
  }
});
