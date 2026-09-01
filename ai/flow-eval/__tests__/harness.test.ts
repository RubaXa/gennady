import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { SddEvalJudge } from '../judge.ts';
import { SddEvalObserver } from '../observer.ts';
import { SddEvalRunner } from '../runner.ts';
import { provisionScenarioDirectories } from '../provision.ts';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import { SddEvalOpenCodeRuntime } from '../opencode-runtime.ts';
import { SddEvalSessionDirectoryMap } from '../session-directory.ts';
import { composeSddPhasePrompt } from '../prompts.ts';

const execFileAsync = promisify(execFile);
import type {
  OpenCodeModel,
  SddEvalEvidenceSource,
  SddEvalEvent,
  SddEvalObservation,
  SddEvalRuntime,
  SddEvalTailEntry,
} from '../types.ts';

function tail(
  id: string,
  text: string,
  toolCalls: SddEvalTailEntry['toolCalls'] = []
): SddEvalTailEntry {
  return { messageId: id, role: 'assistant', text, fingerprint: id, toolCalls };
}

class FakeEvidence implements SddEvalEvidenceSource {
  readonly snapshots: Array<{
    tail: SddEvalTailEntry[];
    status: SddEvalObservation['status'];
    events?: SddEvalEvent[];
  }>;
  calls = 0;
  constructor(snapshots: FakeEvidence['snapshots']) {
    this.snapshots = snapshots;
  }
  #snapshot() {
    const snapshot = this.snapshots[
      Math.min(Math.floor(this.calls / 3), this.snapshots.length - 1)
    ] ?? {
      tail: [],
      status: 'completed' as const,
    };
    this.calls++;
    return snapshot;
  }
  async readTail(_sessionId: string, limit: number) {
    return this.#snapshot().tail.slice(-limit);
  }
  async readEvents(_sessionId: string) {
    return this.#snapshot().events ?? [];
  }
  async readDiff() {
    return 'diff --git a/a.ts b/a.ts';
  }
  async readStatus() {
    return this.#snapshot().status;
  }
}

class FakeRuntime implements SddEvalRuntime {
  prompts: Array<{ sessionId: string; text: string; model: OpenCodeModel }> = [];
  judgePrompts: string[] = [];
  active = 0;
  peak = 0;
  aborts: string[] = [];
  async createSession() {
    return { id: `ses_${this.prompts.length + 1}` };
  }
  async prompt(input: { sessionId: string; text: string; model: OpenCodeModel }) {
    this.prompts.push(input);
    this.active++;
    this.peak = Math.max(this.peak, this.active);
    await Promise.resolve();
    this.active--;
  }
  async judge(input: { directory: string; prompt: string; model: OpenCodeModel }) {
    void input.directory;
    void input.model;
    this.judgePrompts.push(input.prompt);
    return 'pass: diff satisfies intent';
  }
  async abort(sessionId: string) {
    this.aborts.push(sessionId);
  }
}

test('observer includes tool calls in its fingerprint so repeated bash loops are visible', async () => {
  const tool = { callId: 'call-1', tool: 'bash', status: 'completed', inputSummary: 'npm test' };
  const evidence = new FakeEvidence([
    { tail: [tail('m', '', [tool])], status: 'running' },
    { tail: [tail('m', '', [tool])], status: 'running' },
  ]);
  const observations = await new SddEvalObserver(evidence, {
    everyMs: 0,
    stuckAfter: 1,
    tailLimit: 1,
  }).collect('ses_tool');
  assert.equal(observations.length, 2);
  assert.equal(observations.at(-1)?.stuck, true);
  assert.equal(observations.at(-1)?.tail[0]?.toolCalls[0]?.tool, 'bash');
});

test('runner aborts a worker through the runtime after the first unchanged slice', async () => {
  const runtime = new FakeRuntime();
  const evidence = new FakeEvidence([
    { tail: [tail('m', 'loop')], status: 'running' },
    { tail: [tail('m', 'loop')], status: 'running' },
  ]);
  const result = await new SddEvalRunner(runtime, evidence, {
    observeEveryMs: 0,
    stuckAfter: 1,
  }).runScenario({
    id: 'loop',
    phase: 'execute',
    mode: 'canonical-execute',
    intent: 'stop looping',
    directory: '/tmp/isolated-loop',
  });
  assert.deepEqual(runtime.aborts, ['ses_1']);
  assert.equal(result.worker.observations.at(-1)?.stuck, true);
});

test('CLI rejects invalid observation controls before provisioning or SDK access', async () => {
  await assert.rejects(
    execFileAsync('node', ['--import', 'tsx', 'ai/flow-eval/cli.ts', '--observe-every-ms', '-1'], {
      cwd: resolve(import.meta.dirname, '../../..'),
    }),
    /observe-every-ms must be >= 0/
  );
});

test(
  'provisioner gives fixture scenarios unique isolated directories',
  { timeout: 120_000 },
  async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'sdd-flow-eval-test-'));
    try {
      const scenarios = await provisionScenarioDirectories(
        [
          {
            id: 'fib',
            fixture: 'fibonacci-library',
            phase: 'spec-authoring',
            mode: 'full-spec-to-approval-1',
            intent: 'implement fib',
          },
          {
            id: 'game',
            fixture: 'tic-tac-toe',
            phase: 'scaffold',
            mode: 'actual-tickets-to-approval-2',
            intent: 'implement game',
          },
          {
            id: 'slug',
            fixture: 'slugify-toolchain',
            phase: 'execute',
            mode: 'canonical-execute',
            intent: 'implement slug',
          },
        ],
        { rootDirectory: fixtureRoot }
      );
      assert.equal(new Set(scenarios.map((scenario) => scenario.directory)).size, 3);
      assert.ok(scenarios.every((scenario) => scenario.directory.includes('sdd-flow-eval-')));
      assert.ok(existsSync(`${scenarios[0]?.directory}/ai/skills/sdd/SKILL.md`));
      assert.ok(existsSync(`${scenarios[0]?.directory}/ai/directives/sdd-v2/router.directive.xml`));
      assert.ok(existsSync(`${scenarios[0]?.directory}/.claude/skills/sdd-execute`));
      const sourceRoot = resolve(import.meta.dirname, '../../..');
      const sandboxPackage = join(scenarios[0]?.directory ?? '', 'node_modules/gennady');
      assert.notEqual(await realpath(sandboxPackage), await realpath(sourceRoot));
      await writeFile(join(sandboxPackage, 'sandbox-probe.txt'), 'sandbox-only', 'utf8');
      assert.equal(existsSync(join(sourceRoot, 'sandbox-probe.txt')), false);
      assert.equal(
        await readFile(join(scenarios[0]?.directory ?? '', 'ai/skills/sdd/SKILL.md'), 'utf8'),
        await readFile(join(sourceRoot, 'ai/skills/sdd/SKILL.md'), 'utf8')
      );
      const gitCheck = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd: scenarios[0]?.directory,
      });
      assert.equal(gitCheck.stdout.trim(), await realpath(scenarios[0]?.directory ?? ''));
      const cliCheck = await execFileAsync('npx', ['--no-install', 'gennady', 'sdd-state'], {
        cwd: scenarios[0]?.directory,
        env: { ...process.env, NO_COLOR: '1' },
      });
      assert.doesNotMatch(
        `${cliCheck.stdout}\n${cliCheck.stderr}`,
        /command not found|not recognized/i
      );

      const scaffoldDirectory = scenarios[1]?.directory;
      const scaffoldState = await execFileAsync('npx', ['--no-install', 'gennady', 'sdd-state'], {
        cwd: scaffoldDirectory,
        env: { ...process.env, NO_COLOR: '1' },
      });
      assert.match(scaffoldState.stdout, /FLOW_VERSION=v2/);
      assert.match(scaffoldState.stdout, /AUTHORING_READY=yes/);
      const scaffoldCheck = await execFileAsync(
        'npx',
        ['--no-install', 'gennady', 'sdd-check', '--all', '.'],
        { cwd: scaffoldDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      assert.match(scaffoldCheck.stdout, /✅ clean/);

      const executeDirectory = scenarios[2]?.directory;
      const executionMap = await execFileAsync('npx', ['--no-install', 'gennady', 'sdd-task'], {
        cwd: executeDirectory,
        env: { ...process.env, NO_COLOR: '1' },
      });
      assert.match(executionMap.stdout, /SLG-slug/);
      const authoringCheck = await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-check',
          '--task',
          'specs/slugify/core/core.task.SLG-slug.md',
          '--authoring',
        ],
        { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      assert.match(authoringCheck.stdout, /✅ clean/);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
);

test('observer marks repeated bounded tails as stuck and records errors/waiting', async () => {
  const emitted: SddEvalObservation[] = [];
  const evidence = new FakeEvidence([
    {
      tail: [tail('1', 'waiting')],
      status: 'idle',
      events: [{ type: 'permission.updated', summary: 'approval required' }],
    },
    {
      tail: [tail('1', 'waiting')],
      status: 'idle',
      events: [{ type: 'session.error', summary: 'provider failed' }],
    },
    {
      tail: [tail('1', 'waiting')],
      status: 'idle',
      events: [{ type: 'session.error', summary: 'provider failed' }],
    },
  ]);
  const observer = new SddEvalObserver(evidence, {
    everyMs: 0,
    stuckAfter: 2,
    tailLimit: 1,
    onObservation: (_sessionId, observation) => emitted.push(observation),
  });
  const observations = await observer.collect('ses_1');
  assert.equal(observations.length, 3);
  assert.equal(observations.at(-1)?.stuck, true);
  assert.equal(observations.at(-1)?.repeatCount, 2);
  assert.equal(observations.at(-1)?.waiting, true);
  assert.deepEqual(observations.at(-1)?.errors, ['provider failed']);
  assert.equal(emitted.length, observations.length);
});

test('judge receives only intent, diff, events and bounded tail', async () => {
  const runtime = new FakeRuntime();
  await new SddEvalJudge(runtime, { providerID: 'test', modelID: 'judge' }).evaluate(
    'case',
    '/tmp/project',
    {
      intent: 'add a parser',
      diff: 'diff --git ...',
      events: [{ type: 'session.idle' }],
      tail: [tail('1', 'done')],
    }
  );
  const prompt = runtime.judgePrompts.at(-1) ?? '';
  assert.match(prompt, /INTENT/);
  assert.match(prompt, /DIFF/);
  assert.match(prompt, /EVENTS/);
  assert.match(prompt, /BOUNDED_TAIL/);
  assert.doesNotMatch(prompt, /workerPrompt|full transcript|TRACE/);
});

test('phase prompt selects the installed SDD flow and approval boundary', () => {
  const authoring = composeSddPhasePrompt({
    phase: 'spec-authoring',
    mode: 'full-spec-to-approval-1',
    intent: 'author spec',
  });
  const scaffold = composeSddPhasePrompt({
    phase: 'scaffold',
    mode: 'actual-tickets-to-approval-2',
    intent: 'derive tickets',
  });
  const execute = composeSddPhasePrompt({
    phase: 'execute',
    mode: 'canonical-execute',
    intent: 'execute tickets',
  });
  assert.match(authoring, /Approval #1/);
  assert.match(scaffold, /actual implementation tickets|Approval #2/);
  assert.match(execute, /canonical specification and tickets/);
  assert.match(authoring, /Do not implement product code/); // authoring explicitly forbids coding
});

test('runner runs small scenarios in bounded parallel batches and sends isolated judge evidence', async () => {
  const runtime = new FakeRuntime();
  const evidence = new FakeEvidence([{ tail: [tail('1', 'done')], status: 'completed' }]);
  const runner = new SddEvalRunner(runtime, evidence, {
    concurrency: 2,
    observeEveryMs: 0,
    tailLimit: 1,
  });
  const results = await runner.runAll(
    [1, 2, 3].map((n) => ({
      id: `case-${n}`,
      intent: `intent-${n}`,
      directory: `/tmp/project-${n}`,
      phase: 'execute',
      mode: 'canonical-execute',
    }))
  );
  assert.equal(results.length, 3);
  assert.equal(runtime.prompts.length, 3);
  assert.ok(results.every((result) => result.judge?.verdict === 'pass'));
  assert.ok(runtime.judgePrompts.every((prompt) => prompt.includes('diff --git')));
});

test('judge adapter produces typed result with configured model', async () => {
  const runtime = new FakeRuntime();
  const model = { providerID: 'openai', modelID: 'gpt-5.6-sol' };
  const result = await new SddEvalJudge(runtime, model).evaluate('case', '/tmp/project', {
    phase: 'execute',
    mode: 'canonical-execute',
    intent: 'do thing',
    diff: 'diff',
    events: [],
    tail: [],
  });
  assert.equal(result.model.modelID, 'gpt-5.6-sol');
  assert.equal(result.verdict, 'pass');
});

test('SDK runtime and evidence preserve each parallel session cwd for messages/status/diff/abort', async () => {
  const registry = new SddEvalSessionDirectoryMap();
  const calls: Array<{ operation: string; directory?: string }> = [];
  const sdk = {
    session: {
      create: async ({ query }: { query: { directory: string } }) => {
        calls.push({ operation: 'create', directory: query.directory });
        const id =
          calls.filter((call) => call.operation === 'create').length === 1 ? 'ses_a' : 'ses_b';
        return { data: { id } };
      },
      promptAsync: async () => ({ data: undefined }),
      abort: async ({ query }: { query: { directory?: string } }) => {
        calls.push({ operation: 'abort', directory: query.directory });
        return { data: true };
      },
      messages: async ({ query }: { query: { directory?: string; limit?: number } }) => {
        calls.push({ operation: `messages:${query.limit ?? 'all'}`, directory: query.directory });
        return {
          data: [
            {
              info: { id: 'message-1', role: 'assistant', time: { completed: 10 } },
              parts: [
                {
                  id: 'tool-1',
                  type: 'tool',
                  callID: 'call-1',
                  tool: 'bash',
                  state: { status: 'completed', input: { command: 'npm test' } },
                },
              ],
            },
          ],
        };
      },
      status: async ({ query }: { query: { directory?: string } }) => {
        calls.push({ operation: 'status', directory: query.directory });
        return { data: { ses_a: { type: 'idle' }, ses_b: { type: 'idle' } } };
      },
      diff: async ({ query }: { query: { directory?: string } }) => {
        calls.push({ operation: 'diff', directory: query.directory });
        return {
          data: [
            {
              file: 'specs/demo.spec.md',
              before: '',
              after: '# Demo\nDEMO-REQ-1',
              additions: 2,
              deletions: 0,
            },
          ],
        };
      },
    },
  };
  const runtime = new SddEvalOpenCodeRuntime({
    client: sdk as never,
    registry,
  });
  const evidence = new SddEvalOpenCodeEvidenceSource({
    client: sdk as never,
    registry,
  });
  await runtime.createSession({ title: 'case-a', directory: '/tmp/sdd-case-a' });
  await runtime.createSession({ title: 'case-b', directory: '/tmp/sdd-case-b' });
  for (const [id, directory] of [
    ['ses_a', '/tmp/sdd-case-a'],
    ['ses_b', '/tmp/sdd-case-b'],
  ] as const) {
    await evidence.readTail(id, 2);
    await evidence.readStatus(id);
    const diff = await evidence.readDiff(id);
    assert.match(diff, /FILE specs\/demo\.spec\.md/);
    assert.match(diff, /AFTER\n# Demo\nDEMO-REQ-1/);
    await runtime.abort(id);
    assert.ok(
      calls.filter((call) => call.operation.startsWith('messages') && call.directory === directory)
        .length >= 2
    );
    assert.ok(
      calls.filter(
        (call) =>
          (call.operation === 'status' ||
            call.operation === 'diff' ||
            call.operation === 'abort') &&
          call.directory === directory
      ).length >= 3
    );
  }
});
