import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { SddEvalJudge } from '../judge.ts';
import { SddEvalObserver, fingerprintTail } from '../observer.ts';
import { SddEvalRunner } from '../runner.ts';
import { provisionScenarioDirectories } from '../provision.ts';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import { SddEvalOpenCodeRuntime } from '../opencode-runtime.ts';
import { SddEvalSessionDirectoryMap } from '../session-directory.ts';
import { composeSddPhasePrompt } from '../prompts.ts';
import { selectCoverageAdapter } from '../../../cli/cmd/testcov/coverage-adapter-registry.ts';
import { createCoverageArtifactBoundary } from '../../../cli/cmd/testcov/coverage-artifact.ts';

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
  prompts: Array<{ sessionId: string; directory: string; text: string; model: OpenCodeModel }> = [];
  judgePrompts: string[] = [];
  active = 0;
  peak = 0;
  aborts: string[] = [];
  judgeResult = 'pass: diff satisfies intent';
  async createSession() {
    return { id: `ses_${this.prompts.length + 1}` };
  }
  async prompt(input: {
    sessionId: string;
    directory: string;
    text: string;
    model: OpenCodeModel;
  }) {
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
    return this.judgeResult;
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
  assert.equal(observations[0]?.artifactProgress, true);
  assert.equal(observations[1]?.artifactProgress, false);
  assert.equal(observations[1]?.artifactRepeatCount, 1);
});

test('observer does not sleep after the final bounded observation', async () => {
  const evidence = new FakeEvidence([
    { tail: [tail('m1', 'first')], status: 'running' },
    { tail: [tail('m2', 'second')], status: 'running' },
  ]);
  let sleeps = 0;
  const observations = await new SddEvalObserver(evidence, {
    everyMs: 300_000,
    stuckAfter: 10,
    tailLimit: 1,
    clock: { now: () => 0, sleep: async () => void sleeps++ },
  }).collect('ses_budget', 2);
  assert.equal(observations.length, 2);
  assert.equal(sleeps, 1);
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

test('runner aborts changing activity when the hard observation budget is exhausted', async () => {
  const runtime = new FakeRuntime();
  const evidence = new FakeEvidence([
    { tail: [tail('m1', 'search one')], status: 'running' },
    { tail: [tail('m2', 'search two')], status: 'running' },
  ]);
  const result = await new SddEvalRunner(runtime, evidence, {
    observeEveryMs: 0,
    stuckAfter: 10,
    maxObservations: 2,
  }).runScenario({
    id: 'busy-loop',
    phase: 'spec-authoring',
    mode: 'full-spec-to-approval-1',
    intent: 'finish the specification',
    directory: '/tmp/isolated-busy-loop',
  });
  assert.deepEqual(runtime.aborts, ['ses_1']);
  assert.equal(result.worker.observations.at(-1)?.stuck, true);
  assert.deepEqual(result.worker.observations.at(-1)?.errors, ['observation budget exceeded']);
});

test('CLI rejects invalid observation controls before provisioning or SDK access', async () => {
  await assert.rejects(
    execFileAsync('node', ['--import', 'tsx', 'ai/flow-eval/cli.ts', '--observe-every-ms', '-1'], {
      cwd: resolve(import.meta.dirname, '../../..'),
    }),
    /observe-every-ms must be >= 0/
  );
  await assert.rejects(
    execFileAsync('node', ['--import', 'tsx', 'ai/flow-eval/cli.ts', '--max-observations', '0'], {
      cwd: resolve(import.meta.dirname, '../../..'),
    }),
    /max-observations/
  );
});

test(
  'provisioner gives fixture scenarios unique isolated directories',
  { timeout: 300_000 },
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
      for (const scenario of scenarios) {
        assert.equal(scenario.directory, await realpath(scenario.directory));
      }
      assert.ok(existsSync(`${scenarios[0]?.directory}/ai/skills/sdd/SKILL.md`));
      assert.ok(existsSync(`${scenarios[0]?.directory}/ai/directives/sdd-v2/router.directive.xml`));
      assert.ok(existsSync(`${scenarios[0]?.directory}/ai/directives/testing/node-test.xml`));
      assert.ok(existsSync(`${scenarios[0]?.directory}/.claude/skills/sdd-execute`));
      assert.ok(existsSync(`${scenarios[0]?.directory}/specs/README.md`));
      assert.match(
        await readFile(join(scenarios[0]?.directory ?? '', 'specs/README.md'), 'utf8'),
        /\| Scope \| Type \| Spec \| Description \|/
      );
      assert.match(
        await readFile(join(scenarios[0]?.directory ?? '', 'inputs/brief.md'), 'utf8'),
        /Reject negative, non-integer, and greater-than-77 inputs/
      );
      const sourceRoot = resolve(import.meta.dirname, '../../..');
      const sandboxPackage = join(scenarios[0]?.directory ?? '', 'node_modules/gennady');
      assert.notEqual(await realpath(sandboxPackage), await realpath(sourceRoot));
      assert.ok(existsSync(join(scenarios[0]?.directory ?? '', 'node_modules/tree-sitter')));
      assert.ok(
        existsSync(join(scenarios[0]?.directory ?? '', 'node_modules/tree-sitter-typescript'))
      );
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
      const gitStatus = await execFileAsync('git', ['status', '--short'], {
        cwd: scenarios[0]?.directory,
      });
      assert.equal(gitStatus.stdout, '');
      const gitBaseline = await execFileAsync('git', ['log', '-1', '--format=%s'], {
        cwd: scenarios[0]?.directory,
      });
      assert.equal(gitBaseline.stdout.trim(), 'chore: initialize eval fixture');
      assert.match(
        await readFile(join(scenarios[0]?.directory ?? '', '.gitignore'), 'utf8'),
        /^coverage\/$/m
      );
      const cliCheck = await execFileAsync('npx', ['--no-install', 'gennady', 'sdd-state'], {
        cwd: scenarios[0]?.directory,
        env: { ...process.env, NO_COLOR: '1' },
      });
      assert.doesNotMatch(
        `${cliCheck.stdout}\n${cliCheck.stderr}`,
        /command not found|not recognized/i
      );
      assert.match(cliCheck.stdout, /READINESS=ready/);
      assert.match(cliCheck.stdout, /AUTHORING_READY=no/);
      assert.match(cliCheck.stdout, /EXECUTION_READY=yes/);
      assert.match(cliCheck.stdout, /Следующий шаг: написать и approve скоуп-спеку/);

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
      const executionEnv = { ...process.env, NO_COLOR: '1' };
      delete executionEnv.NODE_TEST_CONTEXT;
      delete executionEnv.NODE_V8_COVERAGE;
      assert.ok(existsSync(join(executeDirectory ?? '', 'node_modules/typescript')));
      assert.ok(existsSync(join(executeDirectory ?? '', 'node_modules/prettier')));
      assert.ok(existsSync(join(executeDirectory ?? '', 'node_modules/c8')));
      assert.ok(existsSync(join(executeDirectory ?? '', 'node_modules/@types/node')));
      const fixturePackage = JSON.parse(
        await readFile(join(executeDirectory ?? '', 'package.json'), 'utf8')
      ) as { scripts: Record<string, string> };
      assert.equal(fixturePackage.scripts['type-check'], 'tsc --noEmit');
      assert.equal(fixturePackage.scripts.test, 'node scripts/test.mjs');
      assert.ok(existsSync(join(executeDirectory ?? '', 'scripts/test.mjs')));
      assert.equal(fixturePackage.scripts['test:coverage'], 'node scripts/test-coverage.mjs');
      assert.ok(existsSync(join(executeDirectory ?? '', 'scripts/test-coverage.mjs')));
      assert.match(fixturePackage.scripts.format ?? '', /prettier --check/);
      await execFileAsync('npm', ['run', 'type-check'], { cwd: executeDirectory });
      await execFileAsync(
        'npx',
        ['--no-install', 'prettier', '--check', 'tsconfig.json', 'package.json'],
        {
          cwd: executeDirectory,
        }
      );
      await execFileAsync('npm', ['run', 'format:fix', '--', 'src/slugify.ts', 'tsconfig.json'], {
        cwd: executeDirectory,
      });
      await execFileAsync('npm', ['run', 'format'], { cwd: executeDirectory });
      const executionMap = await execFileAsync('npx', ['--no-install', 'gennady', 'sdd-task'], {
        cwd: executeDirectory,
        env: { ...process.env, NO_COLOR: '1' },
      });
      assert.match(executionMap.stdout, /SLG-slug/);
      const executionTicket = await readFile(
        join(executeDirectory ?? '', 'specs/slugify/core/core.task.SLG-slug.md'),
        'utf8'
      );
      const executionModule = await readFile(
        join(executeDirectory ?? '', 'specs/slugify/core/core.spec.md'),
        'utf8'
      );
      const executionScope = await readFile(
        join(executeDirectory ?? '', 'specs/slugify/slugify.spec.md'),
        'utf8'
      );
      assert.doesNotMatch(
        executionModule,
        /\[(?:One-line human summary|All publicly observable|Library wrap patterns)/
      );
      assert.doesNotMatch(executionScope, /game rules|winner detection|global board/i);
      assert.match(
        executionTicket,
        /P1 — impl[\s\S]*\[typescript-rules\]\(\.\.\/\.\.\/\.\.\/ai\/directives\/coding\/typescript-rules\.xml\)/
      );
      assert.match(executionTicket, /^# Task: SLG-slug — Normalize URL slug$/m);
      assert.match(executionTicket, /- \*\*Runtime Backing:\*\* real-runtime/);
      assert.match(
        executionTicket,
        /P2 — test[\s\S]*\[testing-common\]\(\.\.\/\.\.\/\.\.\/ai\/directives\/testing\/common\.xml\)[\s\S]*\[node-test\]\(\.\.\/\.\.\/\.\.\/ai\/directives\/testing\/node-test\.xml\)/
      );
      assert.match(
        executionTicket,
        /### Round 1[\s\S]*#### P1[\s\S]*#### P2[\s\S]*#### Round close/
      );
      assert.match(executionTicket, /<!--PHASE_RECEIPTS:v1-->/);
      assert.match(executionTicket, /<!--COVERAGE_POLICY:v1-->/);
      assert.match(
        executionTicket,
        /npx gennady testcov --min=80 src\/slugify\.ts` \| node-test \| coverage/
      );
      assert.doesNotMatch(executionTicket, /`npm run test:coverage` \| node-test \| coverage/);
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
      await writeFile(
        join(executeDirectory ?? '', 'src/slugify.ts'),
        [
          '// @file: Deterministic slug normalization rule for the fixture.',
          '// @consumers: fixture consumer',
          '',
          '/**',
          ' * @purpose Normalize input into a lowercase hyphen-separated slug.',
          ' * @invariant Deterministic; input is never mutated; repeated separators collapse.',
          ' * @param value Input text to normalize.',
          ' * @throws {TypeError} When runtime input is not a string.',
          ' * @returns Lowercase slug joined by single hyphens.',
          ' */',
          'export function slugify(value: unknown): string {',
          '  if (typeof value !== "string") {',
          '    throw new TypeError("[slugify] Input must be a string");',
          '  }',
          '  return value.toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");',
          '}',
          '',
        ].join('\n'),
        'utf8'
      );
      await execFileAsync('npm', ['test'], { cwd: executeDirectory });
      assert.equal(
        existsSync(join(executeDirectory ?? '', 'coverage')),
        false,
        'ordinary test gate must not invoke the coverage producer'
      );
      const p1Verify = await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-verify',
          '--task',
          'specs/slugify/core/core.task.SLG-slug.md',
          '--phase',
          'P1',
        ],
        { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      assert.match(p1Verify.stdout, /ALL PASS/);
      assert.match(
        await readFile(
          join(executeDirectory ?? '', 'specs/slugify/core/core.task.SLG-slug.md'),
          'utf8'
        ),
        /<!--SDD_PHASE_RECEIPT:P1-->/
      );
      const p1PreClose = await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-check',
          '--task',
          'specs/slugify/core/core.task.SLG-slug.md',
        ],
        { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      assert.match(p1PreClose.stdout, /✅ clean/);
      await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-log',
          'specs/slugify/core/core.task.SLG-slug.md',
          'complete',
          'artifacts: [src/slugify.ts]; decisions: [deterministic normalization]; open: []; deviations: []',
          '--phase',
          'P1',
        ],
        { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      const p2Context = await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-task',
          'specs/slugify/core/core.task.SLG-slug.md',
          '--phase',
          'P2',
        ],
        { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      assert.match(p2Context.stdout, /READ ticket: PHASE_P2, BDD, VERIFICATION, TEST_COVERAGE/);
      assert.match(p2Context.stdout, /npx gennady testcov --min=80 src\/slugify\.ts/);

      const slugifyTest = join(executeDirectory ?? '', 'src/slugify.test.ts');
      await writeFile(
        slugifyTest,
        [
          '// @file: Contract tests for the slugify fixture.',
          '// @consumers: fixture consumer',
          '// @tasks: SLG-slug',
          '',
          "import assert from 'node:assert/strict';",
          "import { test } from 'node:test';",
          "import { slugify } from './slugify.ts';",
          '',
          "test('slugify contract', () => assert.equal(typeof slugify('Hello'), 'string'));",
          "test('normal text', () => assert.equal(slugify('Hello World'), 'hello-world'));",
          "test('repeated separators', () => assert.equal(slugify('Hello...World'), 'hello-world'));",
          "test('rejects invalid input', () => assert.throws(() => slugify(42), /\\[slugify\\]/));",
          '',
        ].join('\n'),
        'utf8'
      );
      await assert.rejects(async () => {
        try {
          await execFileAsync(
            'npx',
            [
              '--no-install',
              'gennady',
              'sdd-check',
              '--task',
              'specs/slugify/core/core.task.SLG-slug.md',
            ],
            { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
          );
        } catch (error) {
          const output = `${(error as { stdout?: string }).stdout ?? ''}\n${(error as { stderr?: string }).stderr ?? ''}`;
          assert.match(output, /SDD_BDD_SCENARIO_UNTESTED/);
          throw error;
        }
      });
      await writeFile(
        slugifyTest,
        [
          '// @file: Contract tests for the slugify fixture.',
          '// @consumers: fixture consumer',
          '// @tasks: SLG-slug',
          '',
          "import assert from 'node:assert/strict';",
          "import { test } from 'node:test';",
          "import { slugify } from './slugify.ts';",
          '',
          "test('[COR-REQ-1] slugify contract', () => assert.equal(typeof slugify('Hello'), 'string'));",
          "test('[COR-REQ-1] normal text', () => assert.equal(slugify('Hello World'), 'hello-world'));",
          "test('[COR-REQ-2] repeated separators', () => assert.equal(slugify('Hello...World'), 'hello-world'));",
          "test('[COR-REQ-3] rejects invalid input', () => assert.throws(() => slugify(42), /\\[slugify\\]/));",
          '',
        ].join('\n'),
        'utf8'
      );
      const p2Verify = await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-verify',
          '--task',
          'specs/slugify/core/core.task.SLG-slug.md',
          '--phase',
          'P2',
        ],
        { cwd: executeDirectory, env: executionEnv }
      );
      assert.match(p2Verify.stdout, /ALL PASS/);
      const p2PreClose = await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-check',
          '--task',
          'specs/slugify/core/core.task.SLG-slug.md',
        ],
        { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      assert.match(p2PreClose.stdout, /✅ clean/);
      await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-log',
          'specs/slugify/core/core.task.SLG-slug.md',
          'complete',
          'artifacts: [src/slugify.test.ts]; decisions: [canonical BDD case names]; open: []; deviations: []',
          '--phase',
          'P2',
        ],
        { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      const finalTaskCheck = await execFileAsync(
        'npx',
        [
          '--no-install',
          'gennady',
          'sdd-check',
          '--task',
          'specs/slugify/core/core.task.SLG-slug.md',
        ],
        { cwd: executeDirectory, env: { ...process.env, NO_COLOR: '1' } }
      );
      assert.match(finalTaskCheck.stdout, /✅ clean/);
      assert.match(
        await readFile(
          join(executeDirectory ?? '', 'specs/slugify/core/core.task.SLG-slug.md'),
          'utf8'
        ),
        /<!--SDD_PHASE_RECEIPT:P2-->/
      );
      const coverageSelection = selectCoverageAdapter(executeDirectory ?? '');
      assert.equal(coverageSelection.kind, 'selected');
      if (coverageSelection.kind !== 'selected') throw new Error('coverage adapter not selected');
      const coverageBoundary = createCoverageArtifactBoundary(
        executeDirectory ?? '',
        coverageSelection.adapter
      );
      assert.equal(coverageBoundary.ok, true);
      if (!coverageBoundary.ok) throw new Error(coverageBoundary.detail);
      const coverageReport = coverageBoundary.boundary.readReport();
      assert.equal(coverageReport.ok, true);
      if (!coverageReport.ok) throw new Error(coverageReport.detail);
      assert.ok(coverageReport.content.includes('src/slugify.ts'));
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

test('observer aborts immediately when a worker reads installed Gennady bundles', async () => {
  const evidence = new FakeEvidence([
    {
      tail: [
        tail('bundle-read', '', [
          {
            callId: 'call-1',
            tool: 'bash',
            status: 'running',
            inputSummary: '{"command":"cat node_modules/gennady/ai/flow-eval/runner.ts"}',
          },
        ]),
      ],
      status: 'running',
    },
  ]);
  const aborted: string[] = [];
  const observer = new SddEvalObserver(evidence, {
    everyMs: 0,
    stuckAfter: 2,
    tailLimit: 5,
    abort: async (sessionId) => {
      aborted.push(sessionId);
    },
  });
  const observations = await observer.collect('ses_policy', 5);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.stuck, true);
  assert.match(observations[0]?.errors.join('\n') ?? '', /forbidden implementation archaeology/);
  assert.deepEqual(aborted, ['ses_policy']);
});

test('observer aborts an SDD CLI probe wrapped in stderr redirection', async () => {
  const evidence = new FakeEvidence([
    {
      tail: [
        tail('redirected-cli', '', [
          {
            callId: 'call-redirect',
            tool: 'bash',
            status: 'running',
            inputSummary: '{"command":"npx gennady --version 2>/dev/null"}',
          },
        ]),
      ],
      status: 'running',
    },
  ]);
  const aborted: string[] = [];
  const observer = new SddEvalObserver(evidence, {
    everyMs: 0,
    stuckAfter: 2,
    tailLimit: 5,
    abort: async (sessionId) => {
      aborted.push(sessionId);
    },
  });
  const observations = await observer.collect('ses_redirect', 5);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.stuck, true);
  assert.match(observations[0]?.errors.join('\n') ?? '', /forbidden CLI shell redirection/);
  assert.deepEqual(aborted, ['ses_redirect']);
});

test(
  'one checker output filter does not make an otherwise progressing worker terminally stuck',
  { todo: 'P9.3: the symptom policy currently turns one formatting redirect into stuck=true' },
  async () => {
    const fixture = JSON.parse(
      await readFile(join(import.meta.dirname, 'fixtures', 'p9-misunderstood-cases.json'), 'utf8')
    ) as { checkerShellFilter: { inputSummary: string } };
    const evidence = new FakeEvidence([
      {
        tail: [
          tail('checker-filter', '', [
            {
              callId: 'call-checker-filter',
              tool: 'bash',
              status: 'completed',
              inputSummary: fixture.checkerShellFilter.inputSummary,
            },
          ]),
        ],
        status: 'running',
      },
    ]);
    const observation = await new SddEvalObserver(evidence, {
      everyMs: 0,
      stuckAfter: 2,
      tailLimit: 5,
    }).observe('ses_checker_filter');
    assert.equal(observation.stuck, false);
  }
);

test('records the nine repeated full spec writes as a calibration metric', async () => {
  const fixture = JSON.parse(
    await readFile(join(import.meta.dirname, 'fixtures', 'p9-misunderstood-cases.json'), 'utf8')
  ) as { repeatedSpecWrites: { observedCount: number; calls: string[] } };
  const writes = fixture.repeatedSpecWrites.calls.filter((call) => call.startsWith('write:specs/'));
  assert.equal(writes.length, fixture.repeatedSpecWrites.observedCount);
  assert.equal(writes.length, 9);
  assert.ok(new Set(writes).size < writes.length, 'the metric must retain repeated target writes');
});

test('judge receives bounded intent, state, diff, events and tail evidence', async () => {
  const runtime = new FakeRuntime();
  await new SddEvalJudge(runtime, { providerID: 'test', modelID: 'judge' }).evaluate(
    'case',
    '/tmp/project',
    {
      intent: 'add a parser',
      acceptance: 'reject empty input with PAR-REQ-2',
      state: { status: 'completed', stuck: false, waiting: false, errors: [] },
      diff: 'diff --git ...',
      events: [{ type: 'session.idle' }],
      tail: [tail('1', 'done')],
    }
  );
  const prompt = runtime.judgePrompts.at(-1) ?? '';
  assert.match(prompt, /INTENT/);
  assert.match(prompt, /ACCEPTANCE/);
  assert.match(prompt, /PAR-REQ-2/);
  assert.match(prompt, /STATE/);
  assert.match(prompt, /DIFF/);
  assert.match(prompt, /EVENTS/);
  assert.match(prompt, /BOUNDED_TAIL/);
  assert.doesNotMatch(prompt, /workerPrompt|full transcript|TRACE/);
});

test('phase prompt selects the installed SDD flow and approval boundary', () => {
  const authoring = composeSddPhasePrompt({
    phase: 'spec-authoring',
    mode: 'full-spec-to-approval-1',
    scale: 'function',
    intent: 'author spec',
    directory: '/tmp/authoring-sandbox',
  });
  const scaffold = composeSddPhasePrompt({
    phase: 'scaffold',
    mode: 'actual-tickets-to-approval-2',
    intent: 'derive tickets',
    directory: '/tmp/scaffold-sandbox',
  });
  const execute = composeSddPhasePrompt({
    phase: 'execute',
    mode: 'canonical-execute',
    intent: 'execute tickets',
    directory: '/tmp/execute-sandbox',
  });
  assert.match(authoring, /Approval #1/);
  assert.match(scaffold, /actual implementation tickets|Approval #2/);
  assert.match(execute, /canonical specification and tickets/);
  assert.match(authoring, /Do not implement product code/); // authoring explicitly forbids coding
  assert.match(authoring, /Do not call an interactive question\/approval tool/);
  assert.match(authoring, /Never waive a failed gate, accept a risk/);
  assert.match(authoring, /selected phase and mode are authoritative test inputs/);
  assert.match(authoring, /Synthetic operator-confirmed SCALE: function/);
  assert.match(authoring, /Do not reassess or debate SCALE/);
  assert.match(authoring, /Read an unchanged directive or artifact once/);
  assert.match(authoring, /never probe --help\/--version/);
  assert.match(authoring, /Do not narrate or pause at intermediate checkpoints/);
  assert.match(authoring, /leave Approval #1 pending/);
  assert.match(authoring, /overwrite it with exactly one Write/);
  assert.match(authoring, /Edit\/Patch and sectional writes are forbidden/);
  assert.match(authoring, /^WORKING_DIR=\/tmp\/authoring-sandbox$/m);
  assert.match(authoring, /^TMP_DIR=\/tmp\/authoring-sandbox\/\.tmp$/m);
  assert.match(authoring, /читать\/писать вне WORKING_DIR и TMP_DIR запрещено/);
  assert.doesNotMatch(authoring, /messenger-mr241-negative|sdd-flow-eval-root/);
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
    intent: 'do thing',
    state: { status: 'completed', stuck: false, waiting: false, errors: [] },
    diff: 'diff',
    events: [],
    tail: [],
  });
  assert.equal(result.model.modelID, 'gpt-5.6-sol');
  assert.equal(result.verdict, 'pass');
});

test('judge parser does not turn an explicit FAIL rationale containing pass into success', async () => {
  const runtime = new FakeRuntime();
  runtime.judgeResult = '**FAIL**\nThe stuck worker cannot pass this scenario.';
  const result = await new SddEvalJudge(runtime, {
    providerID: 'test',
    modelID: 'judge',
  }).evaluate('case', '/tmp/project', {
    intent: 'reach approval boundary',
    state: { status: 'unknown', stuck: true, waiting: false, errors: [] },
    diff: '',
    events: [],
    tail: [],
  });
  assert.equal(result.verdict, 'fail');
});

test('judge parser accepts a labelled bold PASS even when rationale mentions an earlier FAIL', async () => {
  const runtime = new FakeRuntime();
  runtime.judgeResult =
    '**Verdict: PASS**\nAn earlier audit returned FAIL, then the finding was fixed and rechecked.';
  const result = await new SddEvalJudge(runtime, {
    providerID: 'test',
    modelID: 'judge',
  }).evaluate('case', '/tmp/project', {
    intent: 'complete the ticket',
    state: { status: 'completed', stuck: false, waiting: false, errors: [] },
    diff: '',
    events: [],
    tail: [],
  });
  assert.equal(result.verdict, 'pass');
});

test('every SDK session call preserves its sandbox cwd and rejects a cross-sandbox prompt', async () => {
  const registry = new SddEvalSessionDirectoryMap();
  const calls: Array<{ operation: string; directory?: string }> = [];
  const sdk = {
    session: {
      create: async ({ query }: { query: { directory: string } }) => {
        calls.push({ operation: 'create', directory: query.directory });
        const id = `ses_${calls.filter((call) => call.operation === 'create').length}`;
        return { data: { id } };
      },
      promptAsync: async ({ query }: { query: { directory: string } }) => {
        calls.push({ operation: 'promptAsync', directory: query.directory });
        return { data: undefined };
      },
      prompt: async ({ query }: { query: { directory: string } }) => {
        calls.push({ operation: 'prompt', directory: query.directory });
        return { data: { parts: [{ type: 'text', text: 'pass' }] } };
      },
      abort: async ({ query }: { query: { directory?: string } }) => {
        calls.push({ operation: 'abort', directory: query.directory });
        return { data: true };
      },
      children: async ({ query }: { query: { directory?: string } }) => {
        calls.push({ operation: 'children', directory: query.directory });
        return { data: [] };
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
        return { data: {} };
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
  await assert.rejects(
    runtime.prompt({
      sessionId: 'ses_1',
      directory: '/tmp/outside-case-a',
      text: 'must not run',
      model: { providerID: 'test', modelID: 'test' },
    }),
    /is bound to \/tmp\/sdd-case-a, not requested directory \/tmp\/outside-case-a/
  );
  for (const [id, directory] of [
    ['ses_1', '/tmp/sdd-case-a'],
    ['ses_2', '/tmp/sdd-case-b'],
  ] as const) {
    await runtime.prompt({
      sessionId: id,
      directory,
      text: 'work only here',
      model: { providerID: 'test', modelID: 'test' },
    });
    await evidence.readTail(id, 2);
    assert.equal(await evidence.readStatus(id), 'completed');
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
            call.operation === 'abort' ||
            call.operation === 'promptAsync') &&
          call.directory === directory
      ).length >= 4
    );
  }
  await runtime.judge({
    directory: '/tmp/sdd-judge',
    prompt: 'judge bounded evidence',
    model: { providerID: 'test', modelID: 'judge' },
  });
  assert.ok(
    calls.some((call) => call.operation === 'prompt' && call.directory === '/tmp/sdd-judge')
  );
});

test('SDK evidence includes bounded untracked artifacts omitted by OpenCode session.diff', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sdd-evidence-untracked-'));
  try {
    await execFileAsync('git', ['init', '--quiet'], { cwd: root });
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'new.spec.md'), '# New\nNEW-REQ-1\n', 'utf8');
    const sdk = {
      session: {
        diff: async () => ({ data: [] }),
      },
    };
    const evidence = new SddEvalOpenCodeEvidenceSource({
      client: sdk as never,
      directory: root,
    });
    const diff = await evidence.readDiff('ses_untracked');
    assert.match(diff, /FILE specs\/new\.spec\.md \(untracked\)/);
    assert.match(diff, /AFTER\n# New\nNEW-REQ-1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SDK evidence includes bounded child-worker progress in the parent fingerprint', async () => {
  let childText = 'audit step 1';
  const sdk = {
    session: {
      children: async () => ({ data: [{ id: 'child-1', title: 'independent-auditor' }] }),
      messages: async ({ path }: { path: { id: string } }) => ({
        data:
          path.id === 'child-1'
            ? [
                {
                  info: { id: 'child-message', role: 'assistant', time: { created: 2 } },
                  parts: [{ type: 'text', text: childText }],
                },
              ]
            : [
                {
                  info: { id: 'parent-message', role: 'assistant', time: { created: 1 } },
                  parts: [
                    {
                      type: 'tool',
                      callID: 'task-1',
                      tool: 'task',
                      state: { status: 'running', input: { description: 'audit' } },
                    },
                  ],
                },
              ],
      }),
    },
  };
  const registry = new SddEvalSessionDirectoryMap();
  registry.set('parent-1', '/tmp/parent-1');
  const evidence = new SddEvalOpenCodeEvidenceSource({ client: sdk as never, registry });
  const first = await evidence.readTail('parent-1', 4);
  childText = 'audit step 2';
  const second = await evidence.readTail('parent-1', 4);
  assert.ok(first.some((entry) => entry.role.startsWith('child:independent-auditor')));
  assert.notEqual(fingerprintTail(first), fingerprintTail(second));
});
