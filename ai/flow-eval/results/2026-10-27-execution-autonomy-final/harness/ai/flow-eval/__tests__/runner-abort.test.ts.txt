// @file: Cooperative AbortSignal contract for an in-flight flow-eval worker session.
// @spec: AI-SKILLS
// @consumers: runner.ts

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { SddEvalRunner } from '../runner.ts';
import type { OpenCodeModel, SddEvalEvidenceSource, SddEvalRuntime } from '../types.ts';

it('cooperative abort stops the active worker and returns without waiting for observation cadence', async () => {
  const aborts: string[] = [];
  let promptStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    promptStarted = resolve;
  });
  const runtime: SddEvalRuntime = {
    async createSession() {
      return { id: 'session-abort' };
    },
    async prompt(_input: {
      sessionId: string;
      directory: string;
      text: string;
      model: OpenCodeModel;
      agent?: string;
    }) {
      promptStarted();
      await new Promise<void>(() => undefined);
    },
    async abort(sessionId) {
      aborts.push(sessionId);
    },
  };
  const evidence: SddEvalEvidenceSource = {
    async readTail() {
      return [];
    },
    async readEvents() {
      return [];
    },
    async readDiff() {
      return '';
    },
    async readStatus() {
      return 'running';
    },
  };
  const controller = new AbortController();
  const resultPromise = new SddEvalRunner(runtime, evidence, {
    observeEveryMs: 60_000,
    signal: controller.signal,
  }).runScenario({
    id: 'abort',
    phase: 'execute',
    mode: 'canonical-execute',
    intent: 'x',
    directory: '/tmp/flow-eval-abort-fixture',
  });
  await started;
  controller.abort(new Error('operator signal'));
  await assert.rejects(resultPromise, /operator signal/);
  assert.deepEqual(aborts, ['session-abort']);
});

it('a pre-aborted signal creates no session and sends no prompt', async () => {
  let sessions = 0;
  let prompts = 0;
  const runtime: SddEvalRuntime = {
    async createSession() {
      sessions += 1;
      return { id: 'must-not-exist' };
    },
    async prompt() {
      prompts += 1;
    },
  };
  const controller = new AbortController();
  controller.abort(new Error('already interrupted'));
  const runner = new SddEvalRunner(runtime, emptyEvidence(), { signal: controller.signal });
  await assert.rejects(
    runner.runScenario({
      id: 'pre-abort',
      phase: 'execute',
      mode: 'canonical-execute',
      intent: 'x',
      directory: '/tmp/flow-eval-pre-abort',
    }),
    /already interrupted/
  );
  assert.equal(sessions, 0);
  assert.equal(prompts, 0);
});

it('an abort in one batch prevents the next batch from creating a session', async () => {
  const created: string[] = [];
  let firstPromptStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    firstPromptStarted = resolve;
  });
  const runtime: SddEvalRuntime = {
    async createSession(input) {
      created.push(input.title);
      return { id: input.title };
    },
    async prompt() {
      firstPromptStarted();
      await new Promise<void>(() => undefined);
    },
    async abort() {},
  };
  const controller = new AbortController();
  const run = new SddEvalRunner(runtime, emptyEvidence(), {
    concurrency: 1,
    observeEveryMs: 60_000,
    signal: controller.signal,
  }).runAll([scenario('first'), scenario('second')]);
  await started;
  controller.abort(new Error('stop batches'));
  await assert.rejects(run, /stop batches/);
  assert.deepEqual(created, ['sdd-eval:first']);
});

function emptyEvidence(): SddEvalEvidenceSource {
  return {
    async readTail() {
      return [];
    },
    async readEvents() {
      return [];
    },
    async readDiff() {
      return '';
    },
    async readStatus() {
      return 'running';
    },
  };
}

function scenario(id: string) {
  return {
    id,
    phase: 'execute' as const,
    mode: 'canonical-execute' as const,
    intent: 'x',
    directory: `/tmp/flow-eval-${id}`,
  };
}
