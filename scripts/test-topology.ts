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
// GAP-2: `test/` and `utils/` each hold real, currently-unowned `*.test.ts` suites (`test/agent-inbox/`
// — 23 files — and `utils/test/__tests__/` — 2 files) that predate this fix and were invisible to
// `discoverTests()` below (and therefore absent from `npm test`, `test:coverage`, and pre-commit)
// simply because their root wasn't listed here. Adding them makes the runner see and classify every
// test file those two roots contain; see EXPERIMENTAL_ROOTS and UNIT_ROOTS below for where each lands.
const TEST_ROOTS = ['ai', 'cli', 'plugins', 'services', 'shared', 'test', 'utils'] as const;
const TEST_FILE = /\.test\.ts$/;
// D-60: agent-inbox, agent-mon are experimental products not shipping in v2 yet. Their whole test
// surface is carved into its own topology layer — still discovered and classified (so the
// exhaustiveness contract holds), but excluded from `deterministic`/`coverage` and run only via
// `npm run test:experimental`. Path-prefix match (not name-based) so it also catches the files that
// `V2_GATE_EXCLUDED_NAMES` / the integration-name filters below used to blanket-exclude from the
// corpus entirely. Revert after v2 release (2.0.0-draft): fold these roots back into their natural
// unit/contract/local/external classification and delete this layer.
// GAP-2: `test/agent-inbox/` (23 files, TSK-176/TSK-177) exercises `services/agent-inbox` modules
// exactly like the roots below — it's the same product, just staged in a top-level `test/` tree
// instead of a co-located `__tests__/`. Folding it into the D-60 carve-out keeps one rule ("agent-inbox
// test surface is experimental, not release-ready for v2") instead of inventing a second one; it is
// discovered/classified like every other root here (exhaustiveness) and runs only via
// `npm run test:experimental`.
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
// GAP-2: every test-shaped file in the repo that `assertTopology()`'s classified layers deliberately
// never contain — whether because it's not a `node --test` target at all (the `.sh` self-test below),
// or because `discoverTests()` filters it out by name/`.integration.test.` pattern before
// `classifyTest()` ever runs on it (the two pre-existing entries below), or because it's a real,
// currently-unowned test outside GAP-2's declared 25-file scope (the e2e/ pair). Each entry names who
// owns the file and why it stays outside every layer, so `assertExhaustiveOwnership()` can tell "known
// and deliberately excluded" apart from "orphaned" instead of only ever seeing silence either way.
const EXPLICITLY_EXCLUDED_TEST_FILES: ReadonlyArray<{
  readonly file: string;
  readonly owner: string;
  readonly reason: string;
}> = [
  {
    file: 'ai/flow-eval/scripts/require-developer-repo.test.sh',
    owner: 'ai/flow-eval (coordinate with GAP-E-4: this file also sits in the pre-commit gate)',
    reason:
      "bash self-test for require-developer-repo.sh; its own header says 'Bash self-test, outside " +
      "`npm run check`; run directly' — not a `.test.ts` file, so `classifyTest()`/`node --test` " +
      'never touch it. Run manually: `bash ai/flow-eval/scripts/require-developer-repo.test.sh`.',
  },
  {
    file: 'ai/flow-eval/__tests__/harness.test.ts',
    owner: 'ai/flow-eval',
    reason:
      "name-excluded by V2_GATE_EXCLUDED_NAMES (see that const's comment): a heavy integration test " +
      '(three fixture sandboxes + eval CLI + type-check, its own 300s timeout) that deterministically ' +
      "exceeds the offline gate's per-test budget under c8. Lives in `npm run test:sdd-flow-eval` " +
      'instead — a real, intentionally-dropped node:test file, not a silent gap.',
  },
  {
    file: 'services/mr-stats/__tests__/mr-stats.integration.test.ts',
    owner: 'services/mr-stats',
    reason:
      'name-matches `.integration.test.` — discoverTests() drops every such file from the classified ' +
      'topology on purpose (real network/CLI integration probe, not part of the offline v2 gate). ' +
      'Run via its own script, not `npm test`.',
  },
  {
    file: 'e2e/inbox-serve/helpers/__tests__/aria-snapshot.helper.test.ts',
    owner: 'unowned — needs its own follow-up task, not silently folded into GAP-2',
    reason:
      'real `node:test` unit test for a Playwright helper (mocked Locator, no browser), but `e2e/` is ' +
      "outside GAP-2's declared scope (the 25 orphaned files are exactly test/ + utils/). Recorded " +
      'here instead of left silent; a follow-up should decide whether `e2e/` joins TEST_ROOTS or gets ' +
      'its own runner entry.',
  },
  {
    file: 'e2e/inbox-serve/helpers/__tests__/layout.helper.test.ts',
    owner: 'unowned — needs its own follow-up task, not silently folded into GAP-2',
    reason: 'same as aria-snapshot.helper.test.ts above.',
  },
] as const;
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

// GAP-2 lock: a repo-wide scan of anything shaped like a test file (`*.test.ts/js/mjs/cjs/sh`),
// deliberately NOT anchored to TEST_ROOTS — that anchor is exactly what let `test/` and `utils/` go
// unowned for so long. `.spec.ts` (Playwright, under e2e/) is out of scope on purpose: that's a
// separate runner/track, not a node:test topology gap.
const REPO_SCAN_EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage']);
const REPO_TEST_FILE = /\.test\.(?:ts|js|mjs|cjs|sh)$/;

function discoverAllRepoTestFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (REPO_SCAN_EXCLUDED_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (REPO_TEST_FILE.test(entry.name)) {
        files.push(testId(join(dir, entry.name)));
      }
    }
  };
  walk(PROJECT_ROOT);
  return files.sort();
}

// GAP-2: "topology sees all test files" as an executable contract, not just a discovery-root list —
// every file the independent repo-wide scan above finds must be either (a) in the classified
// topology, or (b) named in EXPLICITLY_EXCLUDED_TEST_FILES with an owner and a reason. Anything else is
// an orphan: a test file nobody's runner, gate, or exclusion list has ever heard of. Runs before every
// command (see `main`), same fail-fast placement as `assertTopology()`.
function assertExhaustiveOwnership(topology: TestTopology): {
  readonly scanned: readonly string[];
  readonly excluded: readonly string[];
} {
  const classified = new Set(TEST_LAYERS.flatMap((layer) => topology[layer]));
  const excluded = EXPLICITLY_EXCLUDED_TEST_FILES.map((entry) => entry.file);
  const excludedSet = new Set(excluded);
  const scanned = discoverAllRepoTestFiles();
  const orphans = scanned.filter((file) => !classified.has(file) && !excludedSet.has(file));
  if (orphans.length > 0) {
    throw new Error(
      '[test-topology] orphaned test file(s) — neither classified by the runner nor named in ' +
        `EXPLICITLY_EXCLUDED_TEST_FILES:\n${orphans.join('\n')}\n` +
        'Either bring the file(s) under TEST_ROOTS + classifyTest(), or add an explicit ' +
        'EXPLICITLY_EXCLUDED_TEST_FILES entry with an owner and a reason — never leave a test file silent.'
    );
  }
  return { scanned, excluded };
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
    '  check     Validate disjoint and exhaustive classification, plus the GAP-2 ownership lock',
    '            (every *.test.ts/js/mjs/cjs/sh file in the repo is classified or explicitly excluded).',
    '  list      Print each classified test path.',
    '  excluded  Print each EXPLICITLY_EXCLUDED_TEST_FILES entry (file, owner, reason) — GAP-2.',
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
  // GAP-2: enforced before every command dispatches (same fail-fast placement as assertTopology()
  // above) — a repo test file nobody classified or explicitly excluded must stop every mode, not just
  // `check`.
  const ownership = assertExhaustiveOwnership(topology);
  if (command === 'check') {
    const partitions = coveragePartitions(topology);
    process.stdout.write(
      `${TEST_LAYERS.map((layer) => `${layer}=${topology[layer].length}`).join(' ')}\n` +
        `coverage observed=${partitions[0].files.length}[${partitions[0].layers.join('+')}] ` +
        `black-box=${partitions[1].files.length}[${partitions[1].layers.join('+')}]\n` +
        `excluded=${ownership.excluded.length} (external/non-node, outside npm test; ` +
        `see EXPLICITLY_EXCLUDED_TEST_FILES / \`excluded\` command)\n`
    );
    return 0;
  }
  if (command === 'list') {
    for (const layer of TEST_LAYERS) {
      for (const file of topology[layer]) process.stdout.write(`${layer}\t${file}\n`);
    }
    return 0;
  }
  if (command === 'excluded') {
    for (const entry of EXPLICITLY_EXCLUDED_TEST_FILES) {
      process.stdout.write(`${entry.file}\t${entry.owner}\t${entry.reason}\n`);
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
