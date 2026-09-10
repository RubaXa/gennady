// @file: Executable runner for hermetic unit and deterministic coverage test layers, plus the
//   temporary `experimental` layer (agent-inbox, agent-mon) carved out by decision D-60. That
//   layer is excluded from `npm test` / `npm run test:coverage` / pre-commit — it runs only via
//   `npm run test:experimental` — because those two products are not release-ready for v2. This is
//   a scoping decision, not a perf one: revert it after the v2 release (2.0.0-draft) by folding
//   `experimental` back into the regular layers (see D-60).
// @consumers: package.json test scripts
// @tasks: N/A

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const TEST_LAYERS = ['unit', 'contract', 'local', 'external', 'experimental'] as const;
type TestLayer = (typeof TEST_LAYERS)[number];
type TestTopology = Record<TestLayer, string[]>;
type TestPartition = {
  name: 'observed' | 'black-box' | 'local' | 'rest';
  coverage: boolean;
  concurrency: number;
  layers: readonly TestLayer[];
  files: string[];
};
const TEST_ROOTS = ['ai', 'cli', 'plugins', 'services', 'shared'] as const;
const TEST_FILE = /\.test\.ts$/;
// D-60: agent-inbox, agent-mon are experimental products not shipping in v2 yet. Their whole test
// surface is carved into its own topology layer — still discovered and classified (so the
// exhaustiveness contract holds), but excluded from `deterministic`/`coverage` and run only via
// `npm run test:experimental`. Path-prefix match (not name-based) so it also catches the files that
// `V2_GATE_EXCLUDED_NAMES` / the integration-name filters below used to blanket-exclude from the
// corpus entirely. Revert after v2 release (2.0.0-draft): fold these roots back into their natural
// unit/contract/local/external classification and delete this layer.
const EXPERIMENTAL_ROOTS = [
  'services/agent-inbox/',
  'services/agent-mon/',
  'cli/cmd/inbox/',
  'cli/cmd/inbox-context/',
  'cli/cmd/inbox-eval/',
  'cli/cmd/inbox-review-plan/',
  'cli/cmd/agent-mon/',
] as const;
// Several local suites launch real CLI/npm/git subprocesses, and sdd-verify already overlaps four
// fixture CLIs internally, so the outer pool stays bounded rather than tracking the host's CPU
// count. Ten (capped by available parallelism) keeps the heaviest-layer-first wave resident in one
// pass without letting the inner fan-out oversubscribe the machine.
const OUTER_TEST_CONCURRENCY = Math.min(10, Math.max(6, availableParallelism()));
// REL-7 (V-BATCH-03 finding F6): the `local` layer's subprocess-heavy suites (real `git`/CLI
// children via `execFileSync`/`spawnSync`) put the most IPC pressure on `node --test`'s parent<->
// child structured-clone pipe, which manifests under load either as an `uncaughtException`
// ("Unable to deserialize cloned data...") or as a `testTimeoutFailure` cascade — see R-REL-15.md
// and V-BATCH-03.md §5/§6. Running `local` as its own partition at a lower concurrency (variant
// (б), not a blanket `=1`) cuts that pressure precisely where it originates while leaving
// contract/external/unit — which carry no comparable subprocess fan-out — at the existing bounded
// concurrency. 4 matches the archived precedent (`51195c48`, `--test-concurrency=4`) and keeps
// wall time close to the pre-PR#36 baseline instead of paying the ×4.4–8.0 cost of `=1` everywhere.
const LOCAL_PARTITION_CONCURRENCY = 4;
const V2_GATE_EXCLUDED_NAMES = new Set([
  'http-server.test.ts',
  'eval-driver.test.ts',
  'reviewer.e2e.test.ts',
  'full-flow.blackbox.test.ts',
  'run-mode.test.ts',
  // Heavy integration test: provisions three fixture sandboxes and spawns the eval CLI + type-check
  // in each (its own `{ timeout: 300_000 }`). Under c8 coverage instrumentation this deterministically
  // exceeds the offline commit gate's per-test budget and cancels — not a real failure. It keeps its
  // home in `npm run test:sdd-flow-eval` (own glob runner); like the other heavy integration tests
  // above it must not block the offline gate.
  //
  // NOTE: this name also matches `services/agent-inbox/modules/inbox-eval/__tests__/harness.test.ts`,
  // but that file is now claimed by `EXPERIMENTAL_ROOTS` first (checked before this set), so only the
  // `ai/flow-eval/` one is actually excluded here — see `discoverTests`.
  'harness.test.ts',
]);
const UNIT_ROOTS = [
  'ai/flow-eval/',
  'ai/inspector/',
  'cli/',
  'plugins/',
  'services/',
  'shared/',
  'utils/',
] as const;
const EXTERNAL_TEST_OPT_IN_ENV_KEYS = ['GENNADY_E2E', 'GENNADY_OPENCODE_INTEGRATION'] as const;
const SENSITIVE_TEST_ENV_KEYS = [
  'GITLAB_PERSONAL_TOKEN',
  'GITLAB_TOKEN',
  'GITLAB_OAUTH_TOKEN',
  'GLAB_TOKEN',
  'GITHUB_PERSONAL_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_APP_PRIVATE_KEY',
  'GH_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'MISTRAL_API_KEY',
  'COHERE_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_PROFILE',
  'AWS_DEFAULT_PROFILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_CONFIG_FILE',
  'AZURE_OPENAI_API_KEY',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CLOUDSDK_CONFIG',
  'OPENCODE_SERVER_USERNAME',
  'OPENCODE_SERVER_PASSWORD',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
  'NPM_CONFIG_USERCONFIG',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
] as const;
const CREDENTIAL_ENV_KEY =
  /(?:^|_)(?:API_KEY|ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|TOKEN|PASSWORD|PRIVATE_KEY|CLIENT_SECRET|AUTH_TOKEN)$/i;
const NPM_AUTH_ENV_KEY = /^NPM_CONFIG_.*(?:AUTH|AUTH_TOKEN|AUTHTOKEN)$/i;
const UNEXPECTED_UNIT_NETWORK_MARKER = 'ERR_TEST_UNEXPECTED_NETWORK';
const unitNetworkGuardSource = `
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
const marker = ${JSON.stringify(UNEXPECTED_UNIT_NETWORK_MARKER)};
const reject = (kind, target) => {
  throw new Error(marker + ' ' + kind + ' ' + String(target ?? 'unknown'));
};
globalThis.fetch = async (input) => reject('fetch', input);
if (typeof globalThis.WebSocket === 'function') {
  globalThis.WebSocket = class TestNetworkBlockedWebSocket {
    constructor(target) { reject('WebSocket', target); }
  };
}
http.request = (...args) => reject('http.request', args[0]);
http.get = (...args) => reject('http.get', args[0]);
https.request = (...args) => reject('https.request', args[0]);
https.get = (...args) => reject('https.get', args[0]);
net.connect = (...args) => reject('net.connect', args[0]);
net.createConnection = (...args) => reject('net.createConnection', args[0]);
net.Socket.prototype.connect = function (...args) { return reject('net.Socket.connect', args[0]); };
tls.connect = (...args) => reject('tls.connect', args[0]);
dgram.createSocket = (...args) => reject('dgram.createSocket', args[0]);
`;
const UNIT_NETWORK_GUARD_IMPORT = `data:text/javascript,${encodeURIComponent(
  unitNetworkGuardSource
)}`;
const coverageChildEnvironmentGuardSource = `
// V8 reads NODE_V8_COVERAGE before imports. Clearing it here keeps this already-instrumented test
// runner observable while preventing its later CLI/git/npm children from emitting irrelevant raw
// profiles for processes that the parent c8 instance cannot attribute as in-process production.
process.env.NODE_V8_COVERAGE = '';
`;
const COVERAGE_CHILD_ENV_GUARD_IMPORT = `data:text/javascript,${encodeURIComponent(
  coverageChildEnvironmentGuardSource
)}`;
const runtimeImportSignal = (modules: string): RegExp =>
  new RegExp(
    String.raw`(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\bfrom\s*)?['"](?:node:)?(?:${modules})['"]|\b(?:import|require)\s*\(\s*['"](?:node:)?(?:${modules})['"]\s*\)`,
    'm'
  );
const LOCAL_BOUNDARY_SIGNALS: ReadonlyArray<readonly [RegExp, string]> = [
  [runtimeImportSignal('child_process'), 'real child_process import'],
  [runtimeImportSignal('http|https|net|tls|dgram|undici'), 'network module import'],
  [/\bcreateServer\s*\(|\.listen\s*\(/, 'loopback server'],
  [/\bsetupMockAgent\b/, 'intercepted HTTP boundary'],
  [/https?:\/\/(?:127\.0\.0\.1|localhost)(?=[:/'"])/, 'loopback client'],
  [/\bcreateGitFixture\b/, 'real git fixture'],
  [/@file:\s+Integration tests?\b/i, 'declared integration test'],
];

function testId(path: string): string {
  return relative(PROJECT_ROOT, path).split(sep).join('/');
}

function discoverUnder(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...discoverUnder(path));
    else if (TEST_FILE.test(entry.name)) files.push(testId(path));
  }
  return files;
}

function isExperimental(file: string): boolean {
  return EXPERIMENTAL_ROOTS.some((root) => file.startsWith(root));
}

function discoverTests(): string[] {
  return TEST_ROOTS.flatMap((root) => discoverUnder(join(PROJECT_ROOT, root)))
    .filter((file) => {
      // D-60: the experimental contour is discovered and classified unconditionally — none of the
      // legacy name/path exclusions below apply to it, since it must land in `experimental` rather
      // than being silently dropped from the topology (exhaustiveness).
      if (isExperimental(file)) return true;
      return (
        !file.includes('/serve/__tests__/') &&
        !file.includes('.integration.test.') &&
        !file.includes('.real-integration.test.') &&
        !V2_GATE_EXCLUDED_NAMES.has(basename(file))
      );
    })
    .sort();
}

function localBoundaryReasons(source: string): string[] {
  return LOCAL_BOUNDARY_SIGNALS.filter(([pattern]) => pattern.test(source)).map(
    ([, reason]) => reason
  );
}

function classifyTest(file: string): TestLayer[] {
  // D-60: the experimental contour (agent-inbox, agent-mon) is classified first and exclusively —
  // it never falls through to contract/local/unit even when a file also matches those signals
  // (e.g. `*.contract.test.ts`, `*.integration.test.ts` names inside these roots).
  if (isExperimental(file)) return ['experimental'];
  const source = readFileSync(join(PROJECT_ROOT, file), 'utf8');
  if (file.includes('/e2e/') || file.includes('.e2e.test.')) return ['external'];
  if (
    (file.startsWith('ai/kit/__tests__/') && !file.includes('.e2e.test.')) ||
    file.includes('/directive-tool-contract/') ||
    basename(file).includes('contract') ||
    file === 'shared/common/__tests__/test-topology.test.ts'
  )
    return ['contract'];
  if (
    file.includes('/tool-behavior/') ||
    file.startsWith('services/remote-console/') ||
    /\.(?:integration|blackbox|observation)\.test\./.test(file) ||
    localBoundaryReasons(source).length > 0
  )
    return ['local'];
  if (UNIT_ROOTS.some((root) => file.startsWith(root))) return ['unit'];
  return [];
}

function assertTopology(): TestTopology {
  const topology: TestTopology = {
    unit: [],
    contract: [],
    local: [],
    external: [],
    experimental: [],
  };
  const issues: string[] = [];
  for (const file of discoverTests()) {
    const layers = classifyTest(file);
    if (layers.length !== 1) {
      issues.push(
        `${file}: ${layers.length === 0 ? 'unclassified' : `overlap ${layers.join(', ')}`}`
      );
      continue;
    }
    topology[layers[0]].push(file);
  }
  if (issues.length > 0)
    throw new Error(`[test-topology] invalid classification:\n${issues.join('\n')}`);
  for (const layer of TEST_LAYERS) topology[layer].sort();
  return topology;
}

// Makespan ordering: node --test dispatches files in argument order under a fixed worker pool, so
// the alphabetical union parked the corpus's heaviest suites (local: 51 files, ~50% of total work)
// behind hundreds of sub-second unit files and left a long single-file tail. Longest-layer-first
// keeps every worker busy to the end. Set membership is unchanged — only dispatch order.
// `experimental` is deliberately absent (D-60): it never runs as part of `deterministic`/`coverage`.
const DETERMINISTIC_LAYER_ORDER = ['local', 'contract', 'external', 'unit'] as const;

function unitTargets(topology: TestTopology): string[] {
  return [...topology.unit];
}

function coveragePartitions(topology: TestTopology): TestPartition[] {
  return [
    {
      name: 'observed',
      coverage: true,
      concurrency: OUTER_TEST_CONCURRENCY,
      layers: ['unit', 'contract'],
      files: [...topology.unit, ...topology.contract].sort(),
    },
    {
      name: 'black-box',
      coverage: false,
      concurrency: OUTER_TEST_CONCURRENCY,
      layers: ['local', 'external'],
      files: [...topology.local, ...topology.external].sort(),
    },
  ];
}

// REL-7: `deterministic` splits into two sequential partitions, the same pattern already used by
// `coveragePartitions()` above — `local` runs alone at the reduced `LOCAL_PARTITION_CONCURRENCY`,
// then the rest of `DETERMINISTIC_LAYER_ORDER` (contract, external, unit — order unchanged) runs at
// the existing `OUTER_TEST_CONCURRENCY`. Local-first dispatch (the PR #36 makespan win) is
// preserved since `local` is now the first partition to run, not merely first in a single list.
function deterministicPartitions(topology: TestTopology): TestPartition[] {
  const restLayers = DETERMINISTIC_LAYER_ORDER.filter((layer) => layer !== 'local');
  return [
    {
      name: 'local',
      coverage: false,
      concurrency: LOCAL_PARTITION_CONCURRENCY,
      layers: ['local'],
      files: [...topology.local],
    },
    {
      name: 'rest',
      coverage: false,
      concurrency: OUTER_TEST_CONCURRENCY,
      layers: restLayers,
      files: restLayers.flatMap((layer) => topology[layer]),
    },
  ];
}

function createTestEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    GENNADY_NO_UPDATE_CHECK: '1',
  };
  const removed = new Set(
    [...EXTERNAL_TEST_OPT_IN_ENV_KEYS, ...SENSITIVE_TEST_ENV_KEYS].map((key) => key.toUpperCase())
  );
  for (const key of Object.keys(env)) {
    if (
      removed.has(key.toUpperCase()) ||
      CREDENTIAL_ENV_KEY.test(key) ||
      NPM_AUTH_ENV_KEY.test(key)
    )
      delete env[key];
  }
  return env;
}

function runNodeTests(
  files: string[],
  options: { coverage: boolean; networkGuard: boolean; concurrency: number }
): number {
  const nodeArgs = [
    '--test',
    `--test-concurrency=${options.concurrency}`,
    '--import',
    'tsx',
    ...(options.coverage ? ['--import', COVERAGE_CHILD_ENV_GUARD_IMPORT] : []),
    ...(options.networkGuard ? ['--import', UNIT_NETWORK_GUARD_IMPORT] : []),
    '--experimental-test-module-mocks',
    '--test-timeout=30000',
    ...files,
  ];
  const args = options.coverage
    ? [
        join(PROJECT_ROOT, 'node_modules/c8/bin/c8.js'),
        '--reporter=json',
        '--reporter=text-summary',
        process.execPath,
        ...nodeArgs,
      ]
    : nodeArgs;
  const result = spawnSync(process.execPath, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: createTestEnvironment(),
  });
  if (result.error) {
    process.stderr.write(`[test-topology] cannot start test runner: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

function help(): string {
  return [
    'Usage: node --import tsx scripts/test-topology.ts <command>',
    '',
    'Commands:',
    '  unit      Run the fast hermetic unit layer.',
    '  deterministic  Run the complete deterministic v2 gate corpus.',
    '  coverage  Run the complete corpus once: unit+contract under c8; black-box local+external without c8.',
    '  experimental  Run the D-60 experimental layer (agent-inbox, agent-mon). Excluded from',
    '                deterministic/coverage/pre-commit until the v2 release (revert after 2.0.0-draft).',
    '  check     Validate disjoint and exhaustive classification.',
    '  list      Print each classified test path.',
    '  Package aliases: npm test=deterministic; npm run test:coverage=coverage; npm run test:topology=check;',
    '  npm run test:experimental=experimental.',
    `  unit/coverage/experimental use bounded outer concurrency=${OUTER_TEST_CONCURRENCY}.`,
    `  deterministic runs local as its own partition at concurrency=${LOCAL_PARTITION_CONCURRENCY} (REL-7),`,
    `  then contract+external+unit at bounded outer concurrency=${OUTER_TEST_CONCURRENCY}. Subprocess-heavy suites own inner bounds.`,
    '  --help    Show this help.',
  ].join('\n');
}

function main(argv: string[]): number {
  const command = argv[0] ?? '--help';
  if (command === '--help' || command === '-h') {
    process.stdout.write(`${help()}\n`);
    return 0;
  }
  const topology = assertTopology();
  if (command === 'check') {
    const partitions = coveragePartitions(topology);
    process.stdout.write(
      `${TEST_LAYERS.map((layer) => `${layer}=${topology[layer].length}`).join(' ')}\n` +
        `coverage observed=${partitions[0].files.length}[${partitions[0].layers.join('+')}] ` +
        `black-box=${partitions[1].files.length}[${partitions[1].layers.join('+')}]\n`
    );
    return 0;
  }
  if (command === 'list') {
    for (const layer of TEST_LAYERS) {
      for (const file of topology[layer]) process.stdout.write(`${layer}\t${file}\n`);
    }
    return 0;
  }
  if (command === 'unit') {
    const targets = unitTargets(topology);
    process.stdout.write(`[test-topology] unit: ${targets.length} files\n`);
    return runNodeTests(targets, {
      coverage: false,
      networkGuard: true,
      concurrency: OUTER_TEST_CONCURRENCY,
    });
  }
  if (command === 'deterministic') {
    // REL-7: run as two sequential partitions — `local` alone at the reduced concurrency, then the
    // rest at the existing bounded concurrency — instead of one spawn over the whole corpus.
    const partitions = deterministicPartitions(topology);
    process.stdout.write(
      `[test-topology] deterministic: ${partitions.reduce((sum, part) => sum + part.files.length, 0)} files\n`
    );
    for (const partition of partitions) {
      process.stdout.write(
        `[test-topology] ${partition.name}: ${partition.files.length} files ` +
          `(${partition.layers.join('+')}; concurrency=${partition.concurrency})\n`
      );
      const status = runNodeTests(partition.files, {
        coverage: false,
        networkGuard: false,
        concurrency: partition.concurrency,
      });
      if (status !== 0) return status;
    }
    return 0;
  }
  if (command === 'experimental') {
    // D-60: agent-inbox/agent-mon — never part of npm test/test:coverage/pre-commit. No c8, no
    // network guard: this layer's own suites (e2e/opencode/real-integration) need real subprocess
    // and network access, same as `local`/`external` under `coverage`.
    const targets = topology.experimental;
    process.stdout.write(`[test-topology] experimental: ${targets.length} files\n`);
    return runNodeTests(targets, {
      coverage: false,
      networkGuard: false,
      concurrency: OUTER_TEST_CONCURRENCY,
    });
  }
  if (command === 'coverage') {
    const partitions = coveragePartitions(topology);
    process.stdout.write(
      `[test-topology] coverage: ${partitions.reduce((sum, part) => sum + part.files.length, 0)} files exactly once\n`
    );
    for (const partition of partitions) {
      process.stdout.write(
        `[test-topology] ${partition.name}: ${partition.files.length} files ` +
          `(${partition.layers.join('+')}; ${partition.coverage ? 'c8 observes production code' : 'no c8: subprocess boundary'})\n`
      );
      const status = runNodeTests(partition.files, {
        coverage: partition.coverage,
        networkGuard: false,
        concurrency: partition.concurrency,
      });
      if (status !== 0) return status;
    }
    return 0;
  }
  process.stderr.write(`[test-topology] unknown command: ${command}\n${help()}\n`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
