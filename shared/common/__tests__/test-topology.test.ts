// @file: Black-box contracts for exhaustive v2-gate topology and hermetic runner boundaries.
// @consumers: test:coverage, test-topology runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../../..');
const RUNNER = join(ROOT, 'scripts/test-topology.ts');
const TEST_LAYERS = ['unit', 'contract', 'local', 'external'] as const;
const V2_GATE_CORPUS_SIZE = 285;
const SDD_COMMAND_NAVIGATION_TEST = 'cli/__tests__/sdd-command-navigation.test.ts';
const YAGNI_SOURCE_POLICY_TEST = 'shared/common/__tests__/yagni-source-policy.test.ts';
const INCIDENT_TEST_LAYERS = {
  unit: [
    'shared/sdd/__tests__/spec-schema.test.ts',
    'shared/sdd/__tests__/task-authoring-literals.test.ts',
  ],
  contract: [
    'ai/kit/__tests__/audit-halt-activation.test.ts',
    'ai/kit/__tests__/execute-selection-barrier-contract.test.ts',
    'ai/kit/__tests__/scaffold-feasibility-contract.test.ts',
    'ai/kit/__tests__/scaffold-nested-correction-regression.test.ts',
  ],
  local: [
    'cli/__tests__/tool-behavior/clean-repo-composition.test.ts',
    'cli/__tests__/tool-behavior/scaffold-feasibility.test.ts',
    'cli/__tests__/tool-behavior/sdd-verify-repair-adapters.test.ts',
  ],
} as const;
const EXCLUDED_NAMES = new Set([
  'http-server.test.ts',
  'eval-driver.test.ts',
  'reviewer.e2e.test.ts',
  'full-flow.blackbox.test.ts',
  'run-mode.test.ts',
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
const BOUNDED_OUTER_CONCURRENCY = '--test-concurrency=6';

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

function legacyGateCorpus(): string[] {
  return ['ai', 'cli', 'shared', 'services']
    .flatMap((root) => discoverUnder(join(ROOT, root)))
    .filter(
      (file) =>
        !file.includes('/agent-inbox/') &&
        !file.includes('/serve/__tests__/') &&
        !file.includes('.integration.test.') &&
        !file.includes('.real-integration.test.') &&
        !EXCLUDED_NAMES.has(basename(file))
    )
    .sort();
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
  const topology: Record<Layer, string[]> = { unit: [], contract: [], local: [], external: [] };
  for (const line of result.stdout.trim().split('\n')) {
    const [layer, file, extra] = line.split('\t');
    assert.ok(TEST_LAYERS.includes(layer as Layer), line);
    assert.ok(file && !extra, line);
    topology[layer as Layer].push(file);
  }
  return topology;
}

function probeSpawns(mode: 'unit' | 'deterministic' | 'coverage'): RunnerProbe[] {
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

    assert.strictEqual(expected.length, V2_GATE_CORPUS_SIZE);
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

  it('deterministic and partitioned coverage each own the complete corpus exactly once', () => {
    const expected = legacyGateCorpus();
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

    assert.deepStrictEqual(deterministic, expected);
    assert.deepStrictEqual([...coverage].sort(), expected);
    assert.strictEqual(new Set(coverage).size, coverage.length);
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
  });

  it('pins one bounded outer concurrency for every runner mode', () => {
    for (const mode of ['unit', 'deterministic', 'coverage'] as const) {
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

  it('preserves intentional external and agent-inbox exclusions', () => {
    const files = TEST_LAYERS.flatMap((layer) => listedTopology()[layer]);
    assert.ok(files.every((file) => !file.includes('/agent-inbox/')));
    assert.ok(files.every((file) => !file.includes('/serve/__tests__/')));
    assert.ok(files.every((file) => !file.includes('.integration.test.')));
    assert.ok(files.every((file) => !file.includes('.real-integration.test.')));
    for (const name of EXCLUDED_NAMES) assert.ok(files.every((file) => !file.endsWith(`/${name}`)));
  });

  it('help and unknown command keep a compact public interface', () => {
    const help = runRunner('--help');
    assert.strictEqual(help.status, 0);
    assert.match(help.stdout, /unit[\s\S]*deterministic[\s\S]*coverage[\s\S]*check[\s\S]*list/);
    assert.match(help.stdout, /npm test=deterministic/);
    assert.match(help.stdout, /bounded outer concurrency=6/);
    const unknown = runRunner('not-a-command');
    assert.strictEqual(unknown.status, 2);
    assert.match(unknown.stderr, /unknown command: not-a-command/);
  });

  it('every child mode drops opt-ins and credentials while preserving runtime env', () => {
    for (const mode of ['unit', 'deterministic', 'coverage'] as const) {
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
