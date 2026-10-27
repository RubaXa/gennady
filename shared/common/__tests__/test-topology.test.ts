// @file: Black-box contracts for exhaustive v2-gate topology and hermetic runner boundaries.
// @spec: SHARED
// @consumers: test:coverage, test-topology runner

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { availableParallelism, tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '../../..');
const RUNNER = join(ROOT, 'scripts/test-topology.ts');
const TEST_LAYERS = ['unit', 'contract', 'local', 'external', 'experimental'] as const;
const SDD_COMMAND_NAVIGATION_TEST = 'cli/__tests__/sdd-command-navigation.test.ts';
const YAGNI_SOURCE_POLICY_TEST = 'shared/common/__tests__/yagni-source-policy.test.ts';
// D-60: agent-inbox/agent-mon test surface — independent mirror of the runner's own
// `EXPERIMENTAL_ROOTS`. Kept as a separate constant (not imported) so this black-box contract can
// catch drift between the runner and this test, same as EXCLUDED_NAMES/OPT_IN_KEYS below.
// GAP-2: `test/agent-inbox/` joined this list alongside the runner's own change — same product
// (services/agent-inbox), just staged under a top-level `test/` tree instead of a co-located
// `__tests__/`.
const EXPERIMENTAL_ROOTS = [
  'services/agent-inbox/',
  'services/agent-mon/',
  'cli/cmd/inbox/',
  'cli/cmd/inbox-context/',
  'cli/cmd/inbox-eval/',
  'cli/cmd/inbox-review-plan/',
  'cli/cmd/agent-mon/',
  'test/agent-inbox/',
] as const;
// GAP-2: independent mirror of the runner's `EXPLICITLY_EXCLUDED_TEST_FILES` — every test-shaped file
// that stays outside every classified layer on purpose, with its owner and reason. Kept separate (not
// imported) for the same drift-catching reason as EXPERIMENTAL_ROOTS above.
const EXPLICITLY_EXCLUDED_TEST_FILES = [
  'ai/flow-eval/scripts/require-developer-repo.test.sh',
  'ai/flow-eval/__tests__/harness.test.ts',
  'services/mr-stats/__tests__/mr-stats.integration.test.ts',
  'e2e/inbox-serve/helpers/__tests__/aria-snapshot.helper.test.ts',
  'e2e/inbox-serve/helpers/__tests__/layout.helper.test.ts',
] as const;
// GAP-2: repo-wide scan mirroring the runner's `discoverAllRepoTestFiles()` — deliberately NOT
// anchored to TEST_ROOTS, so it can catch a test file landing in a root the runner doesn't scan yet
// (the exact bug this task fixes for `test/` and `utils/`).
const REPO_SCAN_EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage']);
const REPO_TEST_FILE = /\.test\.(?:ts|js|mjs|cjs|sh)$/;

function discoverAllRepoTestFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (REPO_SCAN_EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path);
      } else if (REPO_TEST_FILE.test(entry.name)) {
        files.push(relative(root, path).split(sep).join('/'));
      }
    }
  };
  walk(root);
  return files.sort();
}
const INCIDENT_TEST_LAYERS = {
  unit: [
    'shared/sdd/__tests__/spec-schema.test.ts',
    'shared/sdd/__tests__/task-authoring-literals.test.ts',
  ],
  contract: [
    'ai/kit/__tests__/audit-halt-activation.test.ts',
    'ai/kit/__tests__/stateless-sdd-flow-contract.test.ts',
  ],
  local: [
    'ai/skills/session-context-recover/scripts/session-recover.test.mjs',
    'cli/__tests__/tool-behavior/clean-repo-composition.test.ts',
    'cli/__tests__/tool-behavior/sdd-verify-repair-adapters.test.ts',
    // GAP-2: real child_process (git-fixture) / setupMockAgent (mock-http) boundary signals put
    // both previously-unowned utils/test/__tests__ files in `local`, same heuristic as everything
    // else in this layer.
    'utils/test/__tests__/git-fixture.test.ts',
    'utils/test/__tests__/mock-http.test.ts',
  ],
  experimental: [
    'cli/cmd/inbox-review-plan/inbox-review-plan.test.ts',
    'services/agent-inbox/modules/inbox-core/__tests__/state-store.test.ts',
    'services/agent-mon/monitor/__tests__/agent-monitor.test.ts',
    // GAP-2: test/agent-inbox/ folds into the D-60 carve-out (see EXPERIMENTAL_ROOTS above).
    'test/agent-inbox/inbox-queue/review-automation-policy.test.ts',
    'test/agent-inbox/inbox-pipeline/review-types.contract.test.ts',
  ],
} as const;
const EXCLUDED_NAMES = new Set([
  'http-server.test.ts',
  'eval-driver.test.ts',
  'reviewer.e2e.test.ts',
  'full-flow.blackbox.test.ts',
  'run-mode.test.ts',
  'harness.test.ts',
]);
const OPT_IN_KEYS = ['GENNADY_E2E', 'GENNADY_OPENCODE_INTEGRATION'] as const;
const CREDENTIAL_KEYS = [
  'GITLAB_PERSONAL_TOKEN',
  'GITHUB_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AZURE_CLIENT_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
] as const;
const NETWORK_MARKER = 'ERR_TEST_UNEXPECTED_NETWORK';
const COVERAGE_CHILD_ENV_GUARD_MARKER = "process.env.NODE_V8_COVERAGE%20%3D%20''";
const BOUNDED_OUTER_CONCURRENCY = `--test-concurrency=${Math.min(10, Math.max(6, availableParallelism()))}`;
// REL-7: `deterministic` runs `local` as its own partition at a reduced, fixed concurrency —
// independent of `availableParallelism()` — to cut IPC pressure from local's subprocess-heavy
// suites (see R-REL-15.md / V-BATCH-03.md finding F6).
const LOCAL_PARTITION_CONCURRENCY = '--test-concurrency=2';
const OWNED_FILE_TIMEOUTS: Readonly<Record<string, string>> = {
  'ai/flow-eval/__tests__/execution-autonomy-audit.test.ts': '--test-timeout=120000',
  'ai/flow-eval/__tests__/execution-autonomy-fixture.test.ts': '--test-timeout=120000',
  'scripts/__tests__/declared-exports.test.ts': '--test-timeout=360000',
  'scripts/__tests__/release-boundary.test.ts': '--test-timeout=120000',
  'scripts/__tests__/main-carry-disposition.test.ts': '--test-timeout=120000',
  'ai/flow-eval/scripts/__tests__/release-migration-scopes.test.ts': '--test-timeout=120000',
  'plugins/swift/__tests__/swift-hardening.test.ts': '--test-timeout=120000',
};

type Layer = (typeof TEST_LAYERS)[number];
type RunnerProbe = { args: string[]; env: NodeJS.ProcessEnv };

function discoverUnder(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...discoverUnder(path));
    else if (/\.test\.(?:ts|mjs)$/.test(entry.name))
      files.push(relative(ROOT, path).split(sep).join('/'));
  }
  return files;
}

function isExperimental(file: string): boolean {
  return EXPERIMENTAL_ROOTS.some((root) => file.startsWith(root));
}

// The full topology SSOT: every test file the runner is expected to discover and classify,
// including the D-60 `experimental` layer (which used to be silently dropped by
// `/agent-inbox/`/name-based exclusions — now it must land in `experimental` instead).
function legacyGateCorpus(): string[] {
  // GAP-2: 'test' and 'utils' joined this list alongside the runner's own TEST_ROOTS — see that
  // const's comment for the 25 previously-unowned files (test/agent-inbox/ + utils/test/__tests__/)
  // this makes visible.
  return ['ai', 'cli', 'plugins', 'scripts', 'shared', 'services', 'test', 'utils']
    .flatMap((root) => discoverUnder(join(ROOT, root)))
    .filter((file) => {
      if (isExperimental(file)) return true;
      return (
        !file.includes('/serve/__tests__/') &&
        !file.includes('.integration.test.') &&
        !file.includes('.real-integration.test.') &&
        !EXCLUDED_NAMES.has(basename(file))
      );
    })
    .sort();
}

// The subset that `deterministic`/`coverage` actually process — the full corpus minus the D-60
// experimental layer, which those two modes must never touch (see requirement (б) in the brief).
function deterministicGateCorpus(): string[] {
  return legacyGateCorpus().filter((file) => !isExperimental(file));
}

function runRunner(command: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', RUNNER, command], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 5_000,
  });
}

function listedTopology(): Record<Layer, string[]> {
  const result = runRunner('list');
  assert.strictEqual(result.status, 0, result.stderr);
  const topology: Record<Layer, string[]> = {
    unit: [],
    contract: [],
    local: [],
    external: [],
    experimental: [],
  };
  for (const line of result.stdout.trim().split('\n')) {
    const [layer, file, extra] = line.split('\t');
    assert.ok(TEST_LAYERS.includes(layer as Layer), line);
    assert.ok(file && !extra, line);
    topology[layer as Layer].push(file);
  }
  return topology;
}

function probeSpawns(mode: 'unit' | 'deterministic' | 'coverage' | 'experimental'): RunnerProbe[] {
  const probeMarker = '__TEST_TOPOLOGY_PROBE__';
  const source = `
import { mock } from 'node:test';
import { writeFileSync } from 'node:fs';
const calls = [];
mock.module('node:child_process', {
  namedExports: {
    spawnSync: (...args) => {
      calls.push(args);
      const reporter = args[1].find((value) => value.startsWith('--test-reporter-destination=') && value !== '--test-reporter-destination=stdout');
      if (reporter) writeFileSync(reporter.slice('--test-reporter-destination='.length), '# tests 1\\n# pass 1\\n# fail 0\\n# skipped 0\\n# todo 0\\n# cancelled 0\\n');
      return { status: 0 };
    },
  },
});
process.argv = [process.execPath, ${JSON.stringify(RUNNER)}, ${JSON.stringify(mode)}];
await import(${JSON.stringify(`${pathToFileURL(RUNNER).href}?boundary-probe-${mode}`)});
process.stdout.write(${JSON.stringify(probeMarker)} + JSON.stringify(calls.map(([, args, options]) => ({ args, env: options.env }))) + '\\n');
`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SAFE_TEST_SETTING: 'preserved',
    UNLISTED_PROVIDER_API_KEY: 'secret-dynamic-provider',
    NPM_CONFIG_REGISTRY_AUTHTOKEN: 'secret-npm',
  };
  for (const key of OPT_IN_KEYS) env[key] = '1';
  for (const key of CREDENTIAL_KEYS) env[key] = `secret-${key}`;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--experimental-test-module-mocks',
      '--input-type=module',
      '--eval',
      source,
    ],
    { cwd: ROOT, encoding: 'utf8', env, timeout: 5_000 }
  );
  assert.strictEqual(result.status, 0, result.stderr);
  const encoded = result.stdout.split('\n').find((line) => line.startsWith(probeMarker));
  assert.ok(encoded, result.stdout);
  return JSON.parse(encoded.slice(probeMarker.length)) as RunnerProbe[];
}

function probeFailingCommand(
  mode: 'unit' | 'deterministic' | 'coverage' | 'experimental',
  failure: 'assertion' | 'cancelled' | 'missing' | 'incoherent' | 'unaccounted-exit' = 'assertion',
  contradictoryExit = false
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const source = `
import { mock } from 'node:test';
import { writeFileSync } from 'node:fs';
let call = 0;
mock.module('node:child_process', {
  namedExports: {
    spawnSync: (_command, args) => {
      call += 1;
      const reporter = args.find((value) => value.startsWith('--test-reporter-destination=') && value !== '--test-reporter-destination=stdout');
      const failing = ${JSON.stringify(mode === 'deterministic' || mode === 'coverage')} ? call === 2 : true;
      const kind = ${JSON.stringify(failure)};
      const reports = {
        assertion: '# tests 3\\n# pass 2\\n# fail 1\\n# skipped 0\\n# todo 0\\n# cancelled 0\\n',
        cancelled: 'not ok 3 - timed out\\n  ---\\n  failureType: testTimeoutFailure\\n  ...\\n# tests 3\\n# pass 2\\n# fail 0\\n# skipped 0\\n# todo 0\\n# cancelled 1\\n',
        incoherent: '# tests 3\\n# pass 2\\n# fail 0\\n# skipped 0\\n# todo 0\\n# cancelled 0\\n',
        'unaccounted-exit': '# tests 3\\n# pass 3\\n# fail 0\\n# skipped 0\\n# todo 0\\n# cancelled 0\\n',
      };
      if (reporter && !(failing && kind === 'missing'))
        writeFileSync(reporter.slice('--test-reporter-destination='.length), failing
          ? reports[kind]
          : '# tests 2\\n# pass 2\\n# fail 0\\n# skipped 0\\n# todo 0\\n# cancelled 0\\n');
      return { status: failing && !${JSON.stringify(contradictoryExit)} ? 1 : 0 };
    },
  },
});
process.argv = [process.execPath, ${JSON.stringify(RUNNER)}, ${JSON.stringify(mode)}];
await import(${JSON.stringify(`${pathToFileURL(RUNNER).href}?failure-proof-${mode}`)});
`;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--experimental-test-module-mocks',
      '--input-type=module',
      '--eval',
      source,
    ],
    { cwd: ROOT, encoding: 'utf8', timeout: 5_000 }
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('test topology contract', () => {
  it('keeps default deadlines at 30s and scopes every larger budget to its exact owned file', () => {
    for (const mode of ['unit', 'deterministic', 'coverage', 'experimental'] as const) {
      for (const { args } of probeSpawns(mode)) {
        const deadlines = args.filter((arg) => arg.startsWith('--test-timeout='));
        assert.equal(deadlines.length, 1, mode);
        for (const file of args.filter((arg) => /\.test\.(?:ts|mjs)$/.test(arg)))
          assert.equal(deadlines[0], OWNED_FILE_TIMEOUTS[file] ?? '--test-timeout=30000', file);
      }
    }
  });

  it('enforces a real whole-file timeout while allowing the same work under its owned budget', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gennady-topology-budget-'));
    try {
      const slow = join(directory, 'slow.test.mjs');
      writeFileSync(
        slow,
        "import test from 'node:test'; test('bounded work', async () => { await new Promise(done => setTimeout(done, 600)); });\n"
      );
      const marker = '__REAL_BUDGET_STATS__';
      const source = `
import { mock } from 'node:test';
import { spawnSync as invoke } from 'node:child_process';
const observed = [];
mock.module('node:child_process', { namedExports: { spawnSync: (command, args, options) => {
  observed.push(args.find(arg => arg.startsWith('--test-timeout=')));
  // Scale only the wall-clock for this causal probe; execute the real node:test process/reporters.
  return invoke(command, args.map(arg => arg === '--test-timeout=30000' ? '--test-timeout=300'
    : arg === '--test-timeout=120000' ? '--test-timeout=2000'
    : arg === 'plugins/swift/__tests__/swift-hardening.test.ts' ? ${JSON.stringify(slow)} : arg), options);
} } });
const { runNodeTests } = await import(${JSON.stringify(pathToFileURL(RUNNER).href)});
const options = { coverage: false, networkGuard: false, concurrency: 1 };
const start = Date.now();
const ordinary = runNodeTests([${JSON.stringify(slow)}], options);
const owned = runNodeTests(['plugins/swift/__tests__/swift-hardening.test.ts'], options);
process.stdout.write(${JSON.stringify(marker)} + JSON.stringify({ ordinary, owned, observed, elapsed: Date.now() - start }) + '\\n');
`;
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const helper = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--experimental-test-module-mocks',
          '--input-type=module',
          '--eval',
          source,
        ],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env,
          timeout: 6_000,
        }
      );
      assert.equal(helper.status, 0, helper.stderr);
      const encoded = helper.stdout.split('\n').find((line) => line.startsWith(marker));
      assert.ok(encoded, helper.stdout);
      const result = JSON.parse(encoded.slice(marker.length));
      assert.equal(result.ordinary.status, 1);
      assert.ok(result.ordinary.stats === undefined || result.ordinary.stats.failed > 0);
      assert.equal(result.owned.status, 0);
      assert.deepEqual(result.owned.stats, { executed: 1, passed: 1, failed: 0, skipped: 0 });
      assert.deepEqual(result.observed, ['--test-timeout=30000', '--test-timeout=120000']);
      assert.ok(result.elapsed >= 600 && result.elapsed < 5_000, JSON.stringify(result));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('retains normalized statistics from a real nonzero node:test run', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gennady-topology-failure-'));
    try {
      const failingTest = join(directory, 'failure.test.mjs');
      writeFileSync(
        failingTest,
        `import test from 'node:test'; import assert from 'node:assert/strict'; test('fails', () => assert.fail('expected probe failure --token=diagnostic-private-value ' + 'Ошибка '.repeat(3000)));\n`
      );
      const marker = '__REAL_FAILURE_STATS__';
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const helper = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '--eval',
          `import { runNodeTests } from ${JSON.stringify(pathToFileURL(RUNNER).href)}; const result = runNodeTests([${JSON.stringify(failingTest)}], { coverage: false, networkGuard: false, concurrency: 1 }); process.stdout.write(${JSON.stringify(marker)} + JSON.stringify(result) + '\\n');`,
        ],
        { cwd: ROOT, encoding: 'utf8', env, timeout: 5_000 }
      );
      assert.equal(helper.status, 0, helper.stderr);
      assert.match(helper.stderr, /not ok.*fails/);
      assert.match(helper.stderr, /expected probe failure/);
      assert.doesNotMatch(helper.stderr, /diagnostic-private-value/);
      assert.ok(
        Buffer.byteLength(helper.stderr) <= 8192,
        `diagnostic bytes=${Buffer.byteLength(helper.stderr)}`
      );
      const encoded = helper.stdout.split('\n').find((line) => line.startsWith(marker));
      assert.ok(encoded, helper.stdout);
      assert.deepEqual(JSON.parse(encoded.slice(marker.length)), {
        status: 1,
        stats: { executed: 1, passed: 0, failed: 1, skipped: 0 },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('emits completed and failing partition statistics before every nonzero command return', () => {
    for (const mode of ['unit', 'deterministic', 'coverage', 'experimental'] as const) {
      const result = probeFailingCommand(mode);
      assert.equal(result.status, 1, `${mode}: ${result.stderr}`);
      const expected = mode === 'deterministic' || mode === 'coverage' ? 5 : 3;
      assert.match(
        result.stdout,
        new RegExp(
          `\\[gennady-test-topology-stats\\] \\{"executed":${expected},"passed":${expected - 1},"failed":1,"skipped":0\\}`
        ),
        mode
      );
    }
  });

  it('counts cancelled/time-limited tests as unsuccessful, never as intentional skips', () => {
    for (const mode of ['unit', 'deterministic', 'coverage', 'experimental'] as const) {
      const result = probeFailingCommand(mode, 'cancelled');
      assert.equal(result.status, 1, `${mode}: ${result.stderr}`);
      const expected = mode === 'deterministic' || mode === 'coverage' ? 5 : 3;
      assert.match(
        result.stdout,
        new RegExp(`"executed":${expected},"passed":${expected - 1},"failed":1,"skipped":0`)
      );
      assert.match(result.stderr, /testTimeoutFailure/);
    }
  });

  it('never emits earlier passing-group totals as complete stats when the failing reporter is unusable', () => {
    for (const mode of ['unit', 'deterministic', 'coverage', 'experimental'] as const) {
      for (const failure of ['missing', 'incoherent', 'unaccounted-exit'] as const) {
        const result = probeFailingCommand(mode, failure);
        assert.equal(result.status, 1, `${mode}/${failure}: ${result.stderr}`);
        assert.doesNotMatch(result.stdout, /\[gennady-test-topology-stats\]/, `${mode}/${failure}`);
        assert.match(result.stderr, /reporter|statistics|unaccounted/, `${mode}/${failure}`);
      }
    }
  });

  it('a zero process exit cannot turn failed/cancelled TAP facts into a passing command', () => {
    for (const failure of ['assertion', 'cancelled'] as const) {
      const result = probeFailingCommand('unit', failure, true);
      assert.equal(result.status, 1, failure);
      assert.match(result.stdout, /"failed":1/);
    }
  });

  it('list is disjoint, exhaustive, and exactly matches the legacy v2 gate corpus', () => {
    const topology = listedTopology();
    const classified = TEST_LAYERS.flatMap((layer) => topology[layer]);
    const expected = legacyGateCorpus();

    assert.strictEqual(
      expected.length,
      classified.length,
      'independent corpus discovery must match the executable topology SSOT count'
    );
    assert.strictEqual(new Set(classified).size, classified.length);
    assert.deepStrictEqual([...classified].sort(), expected);
    assert.ok(
      topology.unit.includes(SDD_COMMAND_NAVIGATION_TEST),
      'navigation-source consistency is a hermetic unit contract'
    );
    assert.ok(
      topology.unit.includes(YAGNI_SOURCE_POLICY_TEST),
      'the pure YAGNI source-selection policy belongs to the hermetic unit layer'
    );
    for (const [layer, files] of Object.entries(INCIDENT_TEST_LAYERS) as [
      keyof typeof INCIDENT_TEST_LAYERS,
      readonly string[],
    ][]) {
      for (const file of files) {
        assert.ok(topology[layer].includes(file), `${file} belongs to the ${layer} layer`);
      }
    }
  });

  it('check reports the exact list counts', () => {
    const topology = listedTopology();
    const result = runRunner('check');
    assert.strictEqual(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split('\n');
    assert.strictEqual(
      lines[0],
      TEST_LAYERS.map((layer) => `${layer}=${topology[layer].length}`).join(' ')
    );
    assert.strictEqual(
      lines[1],
      `coverage observed=${topology.unit.length + topology.contract.length}[unit+contract] ` +
        `black-box=${topology.local.length + topology.external.length}[local+external]`
    );
    // GAP-2: check also reports the explicit-exclusion count — never silent about what's left out.
    assert.strictEqual(
      lines[2],
      `excluded=${EXPLICITLY_EXCLUDED_TEST_FILES.length} (external/non-node, outside npm test; ` +
        'see EXPLICITLY_EXCLUDED_TEST_FILES / `excluded` command)'
    );
  });

  it('GAP-2: excluded prints every explicit exclusion with an owner and a reason', () => {
    const result = runRunner('excluded');
    assert.strictEqual(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split('\n');
    assert.strictEqual(lines.length, EXPLICITLY_EXCLUDED_TEST_FILES.length);
    const files = lines.map((line) => line.split('\t')[0]);
    assert.deepStrictEqual([...files].sort(), [...EXPLICITLY_EXCLUDED_TEST_FILES].sort());
    for (const line of lines) {
      const [file, owner, reason] = line.split('\t');
      assert.ok(file && owner && reason, line);
    }
    // None of these ever leak into a classified layer — that's the whole point of the list.
    const topology = listedTopology();
    const classified = new Set(TEST_LAYERS.flatMap((layer) => topology[layer]));
    for (const file of EXPLICITLY_EXCLUDED_TEST_FILES) assert.ok(!classified.has(file), file);
  });

  it('GAP-2 lock: every test-shaped file in the repo is classified or explicitly excluded, and an unlisted one turns check red', () => {
    // Non-mutated: today's real repo already satisfies the invariant.
    const topology = listedTopology();
    const classified = new Set(TEST_LAYERS.flatMap((layer) => topology[layer]));
    const excluded = new Set(EXPLICITLY_EXCLUDED_TEST_FILES);
    const scanned = discoverAllRepoTestFiles(ROOT);
    const orphans = scanned.filter((file) => !classified.has(file) && !excluded.has(file));
    assert.deepStrictEqual(orphans, []);
    assert.strictEqual(runRunner('check').status, 0);

    // Mutation: drop a new test file in a directory TEST_ROOTS has never heard of — the exact shape
    // of bug this task fixes for `test/`/`utils/`. The independent scan above must catch it too, and
    // the runner's own `check` must turn red rather than silently ignoring it.
    const fixtureDir = join(ROOT, '__gap2_lock_fixture__');
    const fixtureFile = join(fixtureDir, 'x.test.ts');
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      fixtureFile,
      "import { it } from 'node:test';\nit('gap2 lock fixture noop', () => {});\n"
    );
    try {
      const mutatedScan = discoverAllRepoTestFiles(ROOT);
      assert.ok(mutatedScan.includes('__gap2_lock_fixture__/x.test.ts'));
      const mutatedResult = runRunner('check');
      assert.notStrictEqual(
        mutatedResult.status,
        0,
        'an unclassified, unexcluded test file must turn check red'
      );
      assert.match(mutatedResult.stderr, /__gap2_lock_fixture__\/x\.test\.ts/);
      assert.match(mutatedResult.stderr, /orphaned test file/);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
    // Cleaned up: back to green.
    assert.strictEqual(runRunner('check').status, 0);
  });

  it('deterministic and partitioned coverage each own the complete corpus exactly once (minus D-60 experimental)', () => {
    const expected = deterministicGateCorpus();
    const topology = listedTopology();
    const deterministicSpawns = probeSpawns('deterministic');
    const deterministic = deterministicSpawns.flatMap(({ args }) =>
      args.filter((arg) => /\.test\.(?:ts|mjs)$/.test(arg))
    );
    const coverageSpawns = probeSpawns('coverage');
    const coverage = coverageSpawns.flatMap(({ args }) =>
      args.filter((arg) => /\.test\.(?:ts|mjs)$/.test(arg))
    );
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    // Order-insensitive on purpose: the runner dispatches heaviest-layer-first for makespan.
    // Set identity + exactly-once are still asserted below and by the sorted comparison here.
    assert.deepStrictEqual([...deterministic].sort(), expected);
    assert.strictEqual(new Set(deterministic).size, deterministic.length);
    // REL-7 local partition keeps its concurrency, subdivided only by explicit owned file deadline.
    assert.strictEqual(deterministicSpawns.length, 4, 'three local budget groups + rest partition');
    assert.deepStrictEqual(
      deterministicSpawns[0].args.filter((arg) => /\.test\.(?:ts|mjs)$/.test(arg)),
      topology.local.filter((file) => !OWNED_FILE_TIMEOUTS[file])
    );
    assert.ok(deterministicSpawns[0].args.includes(LOCAL_PARTITION_CONCURRENCY));
    assert.deepStrictEqual(
      deterministicSpawns[3].args.filter((arg) => /\.test\.(?:ts|mjs)$/.test(arg)),
      [...topology.contract, ...topology.external, ...topology.unit]
    );
    assert.ok(deterministicSpawns[3].args.includes(BOUNDED_OUTER_CONCURRENCY));
    assert.deepStrictEqual([...coverage].sort(), expected);
    assert.strictEqual(new Set(coverage).size, coverage.length);
    // D-60: neither mode may ever touch the experimental layer.
    assert.ok(topology.experimental.length > 0);
    assert.ok(!deterministic.some((file) => topology.experimental.includes(file)));
    assert.ok(!coverage.some((file) => topology.experimental.includes(file)));
    assert.strictEqual(coverageSpawns.length, 4);
    assert.strictEqual(
      coverageSpawns.filter(({ args }) => args.some((arg) => arg.endsWith('/c8/bin/c8.js'))).length,
      1,
      'observed coverage must never be overwritten by a second c8 invocation'
    );
    assert.ok(coverageSpawns[0].args.some((arg) => arg.endsWith('/c8/bin/c8.js')));
    assert.ok(
      coverageSpawns[0].args.some(
        (arg) =>
          arg.startsWith('data:text/javascript,') && arg.includes(COVERAGE_CHILD_ENV_GUARD_MARKER)
      )
    );
    assert.ok(coverageSpawns[0].args.includes(topology.unit[0]));
    assert.ok(coverageSpawns[0].args.includes(topology.contract[0]));
    assert.ok(!coverageSpawns[0].args.some((arg) => topology.local.includes(arg)));
    assert.ok(!coverageSpawns[0].args.some((arg) => topology.external.includes(arg)));
    for (const spawn of coverageSpawns.slice(1)) {
      assert.ok(!spawn.args.some((arg) => arg.endsWith('/c8/bin/c8.js')));
      assert.ok(
        !spawn.args.some(
          (arg) => arg.startsWith('data:text/javascript,') && arg.includes('NODE_V8_COVERAGE')
        )
      );
      const owned = spawn.args.some((arg) => OWNED_FILE_TIMEOUTS[arg]);
      assert.ok(spawn.args.includes(owned ? '--test-concurrency=1' : LOCAL_PARTITION_CONCURRENCY));
    }
    assert.deepStrictEqual(
      coverageSpawns[1].args.filter((arg) => /\.test\.(?:ts|mjs)$/.test(arg)),
      [...topology.local, ...topology.external].sort().filter((file) => !OWNED_FILE_TIMEOUTS[file])
    );
    assert.ok(coverageSpawns[0].args.includes(BOUNDED_OUTER_CONCURRENCY));
    for (const mode of [deterministicSpawns, coverageSpawns]) {
      for (const [file, timeout] of Object.entries(OWNED_FILE_TIMEOUTS)) {
        assert.ok(topology.local.includes(file), `owned heavy test stays mandatory local: ${file}`);
        const [spawn] = mode.filter(({ args }) => args.includes(file));
        assert.ok(spawn.args.includes(timeout), `${file}: ${timeout}`);
        assert.ok(
          spawn.args.includes('--test-concurrency=1'),
          `${file}: heavy fixtures are serial`
        );
      }
    }
    assert.strictEqual(
      pkg.scripts.test,
      'node --import tsx scripts/test-topology.ts deterministic'
    );
    assert.strictEqual(
      pkg.scripts['test:coverage'],
      'node --import tsx scripts/test-topology.ts coverage'
    );
    assert.strictEqual(
      pkg.scripts['test:topology'],
      'node --import tsx scripts/test-topology.ts check'
    );
    assert.strictEqual(
      pkg.scripts['test:experimental'],
      'node --import tsx scripts/test-topology.ts experimental'
    );
  });

  it('experimental owns exactly the D-60 layer, run in isolation with no coverage/network guard', () => {
    const topology = listedTopology();
    const [{ args }] = probeSpawns('experimental');
    const files = args.filter((arg) => /\.test\.ts$/.test(arg));

    assert.deepStrictEqual([...files].sort(), [...topology.experimental].sort());
    assert.strictEqual(new Set(files).size, files.length);
    assert.ok(!args.some((arg) => arg.endsWith('/c8/bin/c8.js')));
    assert.ok(
      !args.some(
        (arg) => arg.startsWith('data:text/javascript,') && arg.includes('NODE_V8_COVERAGE')
      )
    );
  });

  it('pins one bounded outer concurrency for every unpartitioned runner mode', () => {
    // REL-7: `deterministic` and `coverage` are deliberately excluded here — their partitions run
    // at different concurrencies, locked by the exact partition assertions above and below.
    for (const mode of ['unit', 'experimental'] as const) {
      for (const { args } of probeSpawns(mode)) {
        assert.strictEqual(
          args.filter((arg) => arg.startsWith('--test-concurrency=')).length,
          1,
          mode
        );
        assert.ok(args.includes(BOUNDED_OUTER_CONCURRENCY), `${mode}: ${JSON.stringify(args)}`);
      }
    }
  });

  it('deterministic bounds local subprocesses at two and serializes owned heavy fixtures, the rest unchanged', () => {
    const spawns = probeSpawns('deterministic');
    assert.strictEqual(spawns.length, 4, 'three local budget groups + rest partition');
    for (const { args } of spawns) {
      assert.strictEqual(
        args.filter((arg) => arg.startsWith('--test-concurrency=')).length,
        1,
        JSON.stringify(args)
      );
    }
    for (const { args } of spawns.slice(0, 3)) {
      const owned = args.some((arg) => OWNED_FILE_TIMEOUTS[arg]);
      assert.ok(
        args.includes(owned ? '--test-concurrency=1' : LOCAL_PARTITION_CONCURRENCY),
        `local partition: ${JSON.stringify(args)}`
      );
      assert.ok(
        !args.includes(BOUNDED_OUTER_CONCURRENCY),
        'local partition must not carry unpartitioned concurrency'
      );
    }
    assert.ok(
      spawns[3].args.includes(BOUNDED_OUTER_CONCURRENCY),
      `rest partition: ${JSON.stringify(spawns[3].args)}`
    );
  });

  it('unit is a strict hermetic subset with no declared local boundary', () => {
    const topology = listedTopology();
    const all = TEST_LAYERS.flatMap((layer) => topology[layer]);
    const boundary =
      /(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\bfrom\s*)?['"](?:node:)?(?:child_process|http|https|net|tls|dgram|undici)['"]|\b(?:import|require)\s*\(\s*['"](?:node:)?(?:child_process|http|https|net|tls|dgram|undici)['"]\s*\)|\bcreateServer\s*\(|\.listen\s*\(|\bsetupMockAgent\b|https?:\/\/(?:127\.0\.0\.1|localhost)(?=[:/'"])|\bcreateGitFixture\b|@file:\s+Integration tests?\b/im;
    const violations = topology.unit.filter((file) =>
      boundary.test(readFileSync(join(ROOT, file), 'utf8'))
    );

    assert.ok(topology.unit.length > 0 && topology.unit.length < all.length);
    assert.deepStrictEqual(violations, []);
    assert.ok(topology.unit.every((file) => !file.startsWith('ai/kit/')));
    assert.ok(topology.unit.every((file) => !file.includes('/tool-behavior/')));
  });

  it('preserves intentional external exclusions outside the D-60 experimental contour', () => {
    // The D-60 experimental roots (agent-inbox, agent-mon) are excluded from `EXCLUDED_NAMES`/
    // serve-tests/integration-name filtering everywhere: their files are meant to surface, just in
    // the `experimental` layer (checked separately below). Everything else keeps the old behavior —
    // these test files never appear in ANY layer, D-60 or not.
    const files = TEST_LAYERS.flatMap((layer) => listedTopology()[layer]);
    const nonExperimental = files.filter((file) => !isExperimental(file));
    assert.ok(nonExperimental.every((file) => !file.includes('/agent-inbox/')));
    assert.ok(nonExperimental.every((file) => !file.includes('/serve/__tests__/')));
    assert.ok(nonExperimental.every((file) => !file.includes('.integration.test.')));
    assert.ok(nonExperimental.every((file) => !file.includes('.real-integration.test.')));
    for (const name of EXCLUDED_NAMES)
      assert.ok(nonExperimental.every((file) => !file.endsWith(`/${name}`)));
    // Genuinely unrelated exclusions (not D-60) must still vanish from every layer, experimental
    // included — the flow-eval harness and the mr-stats integration probe are not agent-inbox/mon.
    assert.ok(files.every((file) => file !== 'ai/flow-eval/__tests__/harness.test.ts'));
    assert.ok(
      files.every((file) => file !== 'services/mr-stats/__tests__/mr-stats.integration.test.ts')
    );
  });

  it('D-60: experimental captures the agent-inbox/agent-mon contour instead of dropping it', () => {
    const topology = listedTopology();
    const experimental = topology.experimental;

    assert.ok(experimental.length > 0);
    assert.ok(experimental.every((file) => isExperimental(file)));
    for (const layer of ['unit', 'contract', 'local', 'external'] as const) {
      assert.ok(topology[layer].every((file) => !isExperimental(file)));
    }
    // Spot-check the files that used to be silently dropped entirely (agent-inbox path filter, or
    // the name-based/serve/integration exclusions) — they must now surface here, unmodified.
    for (const file of [
      'services/agent-inbox/modules/inbox-api/__tests__/http-server.test.ts',
      'services/agent-inbox/modules/inbox-eval/__tests__/eval-driver.test.ts',
      'services/agent-inbox/modules/inbox-eval/__tests__/harness.test.ts',
      'services/agent-inbox/modules/inbox-roles/__tests__/reviewer.e2e.test.ts',
      'services/agent-inbox/serve/__tests__/full-flow.blackbox.test.ts',
      'services/agent-inbox/serve/__tests__/run-mode.test.ts',
      'services/agent-inbox/modules/inbox-vcs/__tests__/vcs-effects.integration.test.ts',
      'services/agent-inbox/modules/inbox-vcs/__tests__/vcs-effects.real-integration.test.ts',
    ]) {
      assert.ok(experimental.includes(file), file);
    }
  });

  it('help and unknown command keep a compact public interface', () => {
    const help = runRunner('--help');
    assert.strictEqual(help.status, 0);
    assert.match(help.stdout, /unit[\s\S]*deterministic[\s\S]*coverage[\s\S]*check[\s\S]*list/);
    assert.match(help.stdout, /npm test=deterministic/);
    assert.match(help.stdout, /bounded outer concurrency=\d+/);
    assert.match(help.stdout, /experimental/);
    assert.match(help.stdout, /D-60/);
    const unknown = runRunner('not-a-command');
    assert.strictEqual(unknown.status, 2);
    assert.match(unknown.stderr, /unknown command: not-a-command/);
  });

  it('every child mode drops opt-ins and credentials while preserving runtime env', () => {
    for (const mode of ['unit', 'deterministic', 'coverage', 'experimental'] as const) {
      for (const { env } of probeSpawns(mode)) {
        for (const key of OPT_IN_KEYS) assert.strictEqual(env[key], undefined, `${mode}:${key}`);
        for (const key of CREDENTIAL_KEYS)
          assert.strictEqual(env[key], undefined, `${mode}:${key}`);
        assert.strictEqual(env.UNLISTED_PROVIDER_API_KEY, undefined);
        assert.strictEqual(env.NPM_CONFIG_REGISTRY_AUTHTOKEN, undefined);
        assert.strictEqual(env.SAFE_TEST_SETTING, 'preserved');
        assert.strictEqual(env.NODE_ENV, 'test');
        assert.strictEqual(env.GENNADY_NO_UPDATE_CHECK, '1');
      }
    }
  });

  it('unit child preload blocks outbound before DNS or connect', () => {
    const [{ args, env }] = probeSpawns('unit');
    const guard = args.find((arg) => arg.startsWith('data:text/javascript,'));
    assert.ok(guard, JSON.stringify(args));
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        guard,
        '--input-type=module',
        '--eval',
        "await fetch('https://must-not-resolve.invalid/unit-boundary')",
      ],
      { encoding: 'utf8', env, timeout: 5_000 }
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(NETWORK_MARKER));
    assert.doesNotMatch(result.stderr, /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/);
  });
});
