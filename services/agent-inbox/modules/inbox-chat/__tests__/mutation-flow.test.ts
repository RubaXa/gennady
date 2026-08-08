// @file: BDD coverage for TSK-163 durable chat and queued artifact mutation flow.
// @consumers: node:test runner
// @tasks: TSK-163

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { InMemoryTaskQueue } from '../../inbox-queue/task-queue.ts';
import { TaskRegistry } from '../../inbox-queue/task-registry.ts';
import { MutationFlow } from '../mutation-flow.ts';
import { OperatorSession } from '../operator-session.ts';

type FlowContext = {
  root: string;
  journal: EventJournal;
  flow: MutationFlow;
  queue: InMemoryTaskQueue;
};

async function createFlowContext(): Promise<FlowContext> {
  const root = await mkdtemp(join(tmpdir(), 'inbox-chat-v2-'));
  const queue = new InMemoryTaskQueue(new TaskRegistry());
  return {
    root,
    queue,
    journal: new EventJournal(join(root, 'events.jsonl')),
    flow: new MutationFlow({ queue, stateDir: root }),
  };
}

describe('MutationFlow and OperatorSession', () => {
  it('chat history survives restart via journal', async () => {
    const { journal } = await createFlowContext();
    const session = new OperatorSession({ journal, answer: async (text) => `answer:${text}` });
    await session.ask('group/proj!1', 'one');
    await session.ask('group/proj!1', 'two');
    const restarted = new OperatorSession({ journal });
    assert.deepStrictEqual(
      restarted.history('group/proj!1').map((turn) => turn.text),
      ['one', 'answer:one', 'two', 'answer:two']
    );
  });

  it('cas conflict is visible and undo is lifo per artifact', async () => {
    const { root, flow } = await createFlowContext();
    const artifact = join(root, 'report.md');
    const other = join(root, 'other.md');
    await writeFile(artifact, 'one');
    await writeFile(other, 'other');
    await flow.apply('group/proj!1', { path: artifact, revision: 0, content: 'two' });
    await flow.apply('group/proj!1', { path: artifact, revision: 1, content: 'three' });
    await flow.apply('group/proj!1', { path: other, revision: 0, content: 'other-two' });
    await assert.rejects(
      () => flow.apply('group/proj!1', { path: artifact, revision: 1, content: 'lost' }),
      /STALE_REVISION/
    );
    await flow.undo('group/proj!1', artifact);
    assert.strictEqual(await readFile(artifact, 'utf8'), 'two');
    await flow.undo('group/proj!1', artifact);
    assert.strictEqual(await readFile(artifact, 'utf8'), 'one');
    assert.strictEqual(await readFile(other, 'utf8'), 'other-two');

    const restartedFlow = new MutationFlow({
      queue: new InMemoryTaskQueue(new TaskRegistry()),
      stateDir: root,
    });
    await restartedFlow.undo('group/proj!1', other);
    assert.strictEqual(await readFile(other, 'utf8'), 'other');
  });

  it('operator session cannot write', async () => {
    const { journal } = await createFlowContext();
    const session = new OperatorSession({ journal });
    assert.ok(!('write' in session));
    assert.ok(!('vcsWrite' in session));
  });

  it('context overflow restarts transparently without duplicate original response', async () => {
    const { journal } = await createFlowContext();
    let resolveAnswer: ((value: string) => void) | undefined;
    const delayed = new Promise<string>((resolve) => {
      resolveAnswer = resolve;
    });
    const session = new OperatorSession({
      journal,
      answer: async (_text, _anchor, digest) =>
        digest ? `reissued:${digest.includes('question')}` : delayed,
    });
    const request = session.ask('group/proj!2', 'question');
    await new Promise((resolve) => setImmediate(resolve));
    const operatorTurn = session.history('group/proj!2')[0]!;
    const restarted = await session.restartWithDigest('group/proj!2', operatorTurn.turnId);
    resolveAnswer?.('obsolete');
    await request;
    assert.match(restarted.text, /^reissued:true/);
    assert.deepStrictEqual(
      session.history('group/proj!2').map((turn) => turn.text),
      ['question', 'reissued:true']
    );
  });
});
