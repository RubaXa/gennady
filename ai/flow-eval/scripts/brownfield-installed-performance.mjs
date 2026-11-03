// @file: Packed baseline/candidate coverage CLI performance with isolated real-project scope and cleanup.
// @spec: AI-SKILLS
// @consumers: brownfield BF3 installed-package qualification
// Run with --source PATH --runtime-root PATH --out NEW_FILE; dependencies use
// GENNADY_BF3_DEPENDENCIES or this checkout's node_modules. Never runs a model.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  lstatSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadavg } from 'node:os';
const args = process.argv.slice(2);
assert.deepEqual([args[0], args[2], args[4]], ['--source', '--runtime-root', '--out']);
assert.equal(args.length, 6);
const source = resolve(args[1]),
  runtimeRoot = resolve(args[3]),
  output = resolve(args[5]);
assert.equal(existsSync(output), false, 'never overwrite a prior measurement');
assert.equal(process.platform, 'darwin');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (cwd, ...argv) =>
  execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...argv], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
const before = git(source, 'status', '--porcelain', '--untracked-files=all');
assert.equal(before, '');
const revision = git(source, 'rev-parse', 'HEAD').trim();
const tracked = git(source, 'ls-files', '-z').split('\0').filter(Boolean);
assert.equal(
  tracked.some((p) => p.startsWith('specs/')),
  false
);
const sources = tracked.filter((p) => /\.(?:[cm]?[jt]sx?|swift|go|kt|java)$/.test(p));
assert.ok(sources.length > 1000, 'performance fixture requires more than 1000 real source paths');
const manifest = JSON.parse(readFileSync(join(runtimeRoot, 'manifest.json'), 'utf8'));
const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const configuredDependencies = process.env.GENNADY_BF3_DEPENDENCIES;
assert.ok(
  configuredDependencies === undefined || configuredDependencies.trim().length > 0,
  'GENNADY_BF3_DEPENDENCIES must be nonempty when set'
);
const dependencyStore = realpathSync(
  resolve(configuredDependencies ?? join(ownRoot, 'node_modules'))
);
assert.ok(existsSync(join(dependencyStore, 'tree-sitter-typescript/package.json')));
const runtimes = {};
for (const arm of ['baseline', 'candidate']) {
  const root = join(runtimeRoot, arm, 'package'),
    entry = join(root, 'dist/gennady.js');
  assert.equal(sha(readFileSync(entry)), manifest[arm].entrySha256);
  assert.equal(
    existsSync(join(root, 'node_modules')),
    false,
    'never add dependencies inside packed runtime'
  );
  const deps = join(runtimeRoot, arm, 'node_modules');
  if (existsSync(deps)) assert.equal(readlinkSync(deps), dependencyStore);
  else symlinkSync(dependencyStore, deps);
  const hashes = Object.fromEntries(
    readdirSync(join(root, 'dist'), { recursive: true })
      .filter((p) => p.endsWith('.js'))
      .sort()
      .map((p) => [p, sha(readFileSync(join(root, 'dist', p)))])
  );
  runtimes[arm] = {
    entry,
    public: {
      commit: manifest[arm].commit,
      sourceOverlay: manifest[arm].sourceOverlay,
      tarballSha256: manifest[arm].tarballSha256,
      entrySha256: manifest[arm].entrySha256,
      compiledJavaScriptHashes: hashes,
    },
  };
}
const holder = mkdtempSync('/private/tmp/gennady-bf3-installed-perf-');
const checkout = join(holder, 'repo');
writeFileSync(
  join(holder, 'owner.json'),
  JSON.stringify({ owner: 'gennady-bf3-installed-perf', pid: process.pid })
);
const section = (name, text) => `<!--SECTION:${name}-->\n${text}\n<!--/SECTION:${name}-->\n`;
const cases = [];
let cleanup, failure;
const bytes = (path) => {
  const s = lstatSync(path);
  return s.isDirectory()
    ? readdirSync(path).reduce((n, p) => n + bytes(join(path, p)), s.blocks * 512)
    : s.blocks * 512;
};
const env = {
  ...process.env,
  HOME: join(holder, 'home'),
  GENNADY_NO_UPDATE_CHECK: '1',
  NODE_V8_COVERAGE: '',
};
for (const key of Object.keys(env))
  if (key.startsWith('GIT_') || key.startsWith('NODE_TEST') || key === 'NODE_OPTIONS')
    delete env[key];
mkdirSync(env.HOME, { recursive: true });
const startedAt = new Date().toISOString(),
  start = performance.now(),
  initialLoad = loadavg();
try {
  execFileSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', 'clone', '--shared', '--quiet', source, checkout],
    { stdio: 'pipe', env }
  );
  assert.equal(git(checkout, 'rev-parse', 'HEAD').trim(), revision);
  const put = (path, content) => {
    mkdirSync(dirname(join(checkout, path)), { recursive: true });
    writeFileSync(join(checkout, path), content);
  };
  const target = sources[0],
    initialTarget = sha(readFileSync(join(checkout, target)));
  const metadataSnapshot = () =>
    readdirSync(join(checkout, 'specs'), { recursive: true })
      .filter((p) => lstatSync(join(checkout, 'specs', p)).isFile())
      .sort()
      .map((p) => [p, sha(readFileSync(join(checkout, 'specs', p)))]);
  const invoke = (arm, query) => {
    const t = performance.now();
    const result = spawnSync(
      '/usr/bin/time',
      ['-l', process.execPath, runtimes[arm].entry, 'orient', '--coverage', ...query, '--json'],
      { cwd: checkout, env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 }
    );
    assert.ifError(result.error);
    assert.equal(
      result.status,
      0,
      `CLI exit ${result.status}; outputSha256=${sha(result.stdout)}; stderrSha256=${sha(result.stderr)}`
    );
    const doc = JSON.parse(result.stdout),
      rss = /(\d+)\s+maximum resident set size/.exec(result.stderr),
      cpu = /([\d.]+)\s+user\s+([\d.]+)\s+sys/.exec(result.stderr);
    assert.ok(rss && cpu, 'observable macOS time -l CPU/RSS required');
    assert.equal(doc.coverage.canProceed, true, 'coverage preflight/query must remain valid');
    return {
      elapsedMs: performance.now() - t,
      userSeconds: Number(cpu[1]),
      systemSeconds: Number(cpu[2]),
      peakRssBytes: Number(rss[1]),
      reads: doc.reads,
      rows: doc.coverage.rows.length,
      complete: doc.coverage.complete,
      canProceed: doc.coverage.canProceed,
      findings: doc.coverage.findings.map((x) => x.code),
    };
  };
  const measure = (name, query, expectedReads, expectedRows, index) => {
    const snapshot = existsSync(join(checkout, 'specs')) ? metadataSnapshot() : [];
    const order = index % 2 === 0 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    const measured = { baseline: { warmProcesses: [] }, candidate: { warmProcesses: [] } };
    const sample = (arm) => {
      const r = invoke(arm, query);
      assert.equal(r.reads.sourceReads, expectedReads);
      assert.equal(r.rows, expectedRows);
      return r;
    };
    for (const arm of order) measured[arm].firstProcess = sample(arm);
    for (let round = 0; round < 5; round++)
      for (const arm of round % 2 === 0 ? order : [...order].reverse())
        measured[arm].warmProcesses.push(sample(arm));
    for (const arm of ['baseline', 'candidate']) {
      const s = measured[arm].warmProcesses;
      measured[arm].medianWarmElapsedMs = s.map((x) => x.elapsedMs).sort((a, b) => a - b)[2];
      measured[arm].medianWarmPeakRssBytes = s.map((x) => x.peakRssBytes).sort((a, b) => a - b)[2];
    }
    assert.equal(
      sha(readFileSync(join(checkout, target))),
      initialTarget,
      'queried source unchanged'
    );
    assert.deepEqual(
      existsSync(join(checkout, 'specs')) ? metadataSnapshot() : [],
      snapshot,
      'SDD metadata unchanged'
    );
    assert.equal(git(checkout, 'diff', '--name-only'), '', 'tracked checkout unchanged');
    cases.push({
      name,
      expectedSourceReads: expectedReads,
      expectedRows,
      order,
      arms: measured,
      medianElapsedDeltaPercent:
        100 * (measured.candidate.medianWarmElapsedMs / measured.baseline.medianWarmElapsedMs - 1),
    });
    console.log(
      JSON.stringify({
        case: name,
        baselineMs: measured.baseline.medianWarmElapsedMs,
        candidateMs: measured.candidate.medianWarmElapsedMs,
      })
    );
  };
  measure('no-sdd', [], 0, 0, 0);
  put('specs/README.md', '# Existing project\n## Scopes\n\n## Decision Log\n');
  measure('portal-only', ['--spec', 'specs/README.md'], 0, 0, 1);
  const mapping = (paths) =>
    section('SPEC_ID', 'BENCH') +
    section(
      'FILE_STRUCTURE',
      '**File Mapping:**\n' + paths.map((path) => `- \`${path}\`: implementation`).join('\n')
    );
  put('specs/bench/bench.spec.md', mapping(sources));
  put(
    'specs/bench/bench.task.work.md',
    section(
      'META',
      '- **Task-ID:** BENCH-work\n- **Status:** [ ] TODO\n- **Owning Spec:** [owner](./bench.spec.md)'
    ) +
      section(
        'PHASES_OVERVIEW',
        '| Phase | Kind | Deps | Status |\n|---|---|---|---|\n| P1 | impl | — | [ ] |'
      ) +
      section('PHASE_P1', `- **Target Files:**\n  - \`${target}\`\n- **Deleted Files:**\n`)
  );
  const query = ['--task', 'BENCH-work', '--phase', 'P1', '--stage', 'preflight'];
  measure(`real-${sources.length}-mapping-one-phase`, query, 1, 1, 2);
  for (const [i, size] of [1000, 10000, 50000].entries()) {
    put(
      'specs/bench/bench.spec.md',
      mapping([target, ...Array.from({ length: size - 1 }, (_, n) => `src/synthetic-${n}.ts`)])
    );
    measure(`synthetic-${size}-mapping-one-real-target`, query, 1, 1, 3 + i);
  }
  assert.equal(git(source, 'status', '--porcelain', '--untracked-files=all'), before);
} catch (error) {
  failure = { name: error.name, code: error.code ?? null, messageSha256: sha(error.message) };
} finally {
  // All children are synchronous and have returned before this owned holder is removed.
  const freedAllocatedBytes = bytes(holder);
  const owner = JSON.parse(readFileSync(join(holder, 'owner.json'), 'utf8'));
  assert.equal(owner.pid, process.pid);
  assert.equal(owner.owner, 'gennady-bf3-installed-perf');
  rmSync(holder, { recursive: true, force: true });
  cleanup = {
    safeCleanup: !existsSync(holder),
    rootRemoved: !existsSync(holder),
    freedAllocatedBytes,
    childrenActive: false,
  };
}
const report = {
  schema: 'brownfield-installed-cli-performance/1',
  startedAt,
  completedAt: new Date().toISOString(),
  elapsedMs: performance.now() - start,
  helperSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  runtimeManifestSha256: sha(readFileSync(join(runtimeRoot, 'manifest.json'))),
  runtimes: Object.fromEntries(Object.entries(runtimes).map(([arm, value]) => [arm, value.public])),
  realRepositoryCommit: revision,
  trackedPaths: tracked.length,
  sourcePaths: sources.length,
  trackedPathManifestSha256: sha(tracked.join('\0')),
  modelCalls: 0,
  samplesPerArmPerCase: { firstProcess: 1, warmProcesses: 5 },
  firstProcessIsNotOsColdCache: true,
  independentProcessPerSample: true,
  peakRssScope: 'entire CLI process as reported by macOS time -l',
  readCountersScope: 'explicit coverage adapter reads, not kernel syscalls',
  phaseProjectionNotFullRepositoryAudit: true,
  claim:
    'descriptive installed query performance; no model, no universal speed win or statistical non-inferiority',
  initialHostLoad: initialLoad,
  finalHostLoad: loadavg(),
  originalCheckoutUnchanged:
    git(source, 'status', '--porcelain', '--untracked-files=all') === before,
  dependencyCopies: 0,
  sharedDependenciesUntouched: true,
  cleanup,
  cases,
  ...(failure ? { failure } : {}),
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
assert.equal(cleanup.safeCleanup, true);
assert.equal(failure, undefined, JSON.stringify(failure));
console.log(
  JSON.stringify({
    complete: true,
    cases: cases.length,
    samples: cases.length * 12,
    rootRemoved: cleanup.rootRemoved,
    freedAllocatedBytes: cleanup.freedAllocatedBytes,
  })
);
