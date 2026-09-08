// @file: Black-box contracts for exhaustive v2-gate topology and hermetic runner boundaries.
// @consumers: test:coverage, test-topology runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { availableParallelism } from 'node:os';

const ROOT = resolve(import.meta.dirname, '../../..');
const RUNNER = join(ROOT, 'scripts/test-topology.ts');
const TEST_LAYERS = ['unit', 'contract', 'local', 'external', 'experimental'] as const;
const SDD_COMMAND_NAVIGATION_TEST = 'cli/__tests__/sdd-command-navigation.test.ts';
const YAGNI_SOURCE_POLICY_TEST = 'shared/common/__tests__/yagni-source-policy.test.ts';
// D-60: agent-inbox/agent-mon test surface — independent mirror of the runner's own
// `EXPERIMENTAL_ROOTS`. Kept as a separate constant (not imported) so this black-box contract can
// catch drift between the runner and this test, same as EXCLUDED_NAMES/OPT_IN_KEYS below.
const EXPERIMENTAL_ROOTS = [
  'services/agent-inbox/',
  'services/agent-mon/',
  'cli/cmd/inbox/',
  'cli/cmd/inbox-context/',
  'cli/cmd/inbox-eval/',
  'cli/cmd/inbox-review-plan/',
  'cli/cmd/agent-mon/',
] as const;
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
    'cli/__tests__/tool-behavior/clean-repo-composition.test.ts',
    'cli/__tests__/tool-behavior/sdd-verify-repair-adapters.test.ts',
  ],
  experimental: [
    'cli/cmd/inbox-review-plan/inbox-review-plan.test.ts',
    'services/agent-inbox/modules/inbox-core/__tests__/state-store.test.ts',
    'services/agent-mon/monitor/__tests__/agent-monitor.test.ts',
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

type Layer = (typeof TEST_LAYERS)[number];
type RunnerProbe = { args: string[]; env: NodeJS.ProcessEnv };

function discoverUnder(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...discoverUnder(path));
    else if (/\.test\.ts$/.test(entry.name)) files.push(relative(ROOT, path).split(sep).join('/'));
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
  return ['ai', 'cli', 'shared', 'services']
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
const calls = [];
mock.module('node:child_process', {
  namedExports: {
    spawnSync: (...args) => {
      calls.push(args);
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

describe('test topology contract', () => {
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
  });

  it('deterministic and partitioned coverage each own the complete corpus exactly once (minus D-60 experimental)', () => {
    const expected = deterministicGateCorpus();
    const topology = listedTopology();
    const deterministic = probeSpawns('deterministic')[0].args.filter((arg) =>
      /\.test\.ts$/.test(arg)
    );
    const coverageSpawns = probeSpawns('coverage');
    const coverage = coverageSpawns.flatMap(({ args }) =>
      args.filter((arg) => /\.test\.ts$/.test(arg))
    );
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    // Order-insensitive on purpose: the runner dispatches heaviest-layer-first for makespan.
    // Set identity + exactly-once are still asserted below and by the sorted comparison here.
    assert.deepStrictEqual([...deterministic].sort(), expected);
    assert.strictEqual(new Set(deterministic).size, deterministic.length);
    assert.deepStrictEqual([...coverage].sort(), expected);
    assert.strictEqual(new Set(coverage).size, coverage.length);
    // D-60: neither mode may ever touch the experimental layer.
    assert.ok(topology.experimental.length > 0);
    assert.ok(!deterministic.some((file) => topology.experimental.includes(file)));
    assert.ok(!coverage.some((file) => topology.experimental.includes(file)));
    assert.strictEqual(coverageSpawns.length, 2);
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
    assert.ok(!coverageSpawns[1].args.some((arg) => arg.endsWith('/c8/bin/c8.js')));
    assert.ok(
      !coverageSpawns[1].args.some(
        (arg) => arg.startsWith('data:text/javascript,') && arg.includes('NODE_V8_COVERAGE')
      )
    );
    assert.deepStrictEqual(
      coverageSpawns[1].args.filter((arg) => /\.test\.ts$/.test(arg)),
      [...topology.local, ...topology.external].sort()
    );
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

  it('pins one bounded outer concurrency for every runner mode', () => {
    for (const mode of ['unit', 'deterministic', 'coverage', 'experimental'] as const) {
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
