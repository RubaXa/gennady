// @file: Optional offline qualification against an explicitly supplied installed Vitest, with isolated cache and mandatory cleanup.
// @spec: AI-SKILLS
// @consumers: brownfield Verify protocol acceptance

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { executeLocalStep } from '../../../shared/verify/execution/local.executor.ts';
import { acquireWorkspaceGuard } from '../../../shared/verify/execution/workspace-guard.ts';
import type { PlannedVerifyStep } from '../../../shared/verify/model/verify-step.type.ts';

const args = process.argv.slice(2);
assert.equal(
  args.length,
  4,
  'usage: qualify-vitest-stream.ts --vitest PACKAGE_DIRECTORY --out NEW_JSON'
);
assert.equal(args[0], '--vitest');
assert.equal(args[2], '--out');
const vitestRoot = realpathSync(resolve(args[1]!));
const output = resolve(args[3]!);
assert.equal(existsSync(output), false, 'never overwrite prior qualification');
const pkg = JSON.parse(readFileSync(join(vitestRoot, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};
assert.equal(pkg.name, 'vitest');
const entry = join(vitestRoot, 'vitest.mjs');
assert.ok(
  existsSync(entry),
  'explicit installed Vitest CLI is required; no package install/network'
);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'gennady-real-vitest-')));
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const rows: object[] = [];
let largeBytes = 0;
try {
  symlinkSync(dirname(vitestRoot), join(root, 'node_modules'), 'dir');
  writeFileSync(join(root, '.gitignore'), 'node_modules\n.cache\n');
  writeFileSync(join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  writeFileSync(
    join(root, 'vitest.config.mjs'),
    "export default {cacheDir:'.cache',test:{cache:false,pool:'forks',maxWorkers:1,fileParallelism:false}};\n"
  );
  const source =
    "import {test,expect} from 'vitest';\ntest('large-'.repeat(260000),()=>expect(true).toBe(true));\n";
  writeFileSync(join(root, 'value.test.js'), source);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_V8_COVERAGE: '' };
  for (const key of Object.keys(env)) if (/^(?:GIT_|NODE_TEST)/.test(key)) delete env[key];
  for (const argv of [
    ['init', '-q'],
    ['add', '.'],
    ['commit', '-qm', 'synthetic runner input'],
  ])
    execFileSync(
      'git',
      ['-c', 'user.name=qualification', '-c', 'user.email=qualification@example.invalid', ...argv],
      { cwd: root, env, stdio: 'pipe' }
    );
  const command = [process.execPath, entry, 'run', '--reporter=json', '--configLoader', 'native'];
  const reference = spawnSync(command[0]!, command.slice(1), {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.ifError(reference.error);
  assert.equal(reference.status, 0, reference.stderr.slice(0, 1500));
  largeBytes = Buffer.byteLength(reference.stdout);
  assert.ok(largeBytes > 1024 * 1024, `real reporter must exceed policy cap: ${largeBytes}`);
  const counters = JSON.parse(reference.stdout) as {
    numTotalTests: number;
    numPassedTests: number;
  };
  assert.equal(counters.numTotalTests, 1);
  assert.equal(counters.numPassedTests, 1);
  for (const broken of [false, true]) {
    writeFileSync(
      join(root, 'value.test.js'),
      broken ? source.replace('toBe(true)', 'toBe(false)') : source
    );
    const acquired = acquireWorkspaceGuard(root, { signalHandlers: false });
    assert.equal(acquired.kind, 'guard');
    if (acquired.kind !== 'guard') throw new Error('workspace guard unavailable');
    try {
      const step: PlannedVerifyStep = {
        id: 'node:unit',
        plugin: 'node',
        tags: ['unit'],
        needs: [],
        executor: 'local',
        effect: 'observe',
        command: {
          argv: command,
          cwd: root,
          env: { NODE_TEST_CONTEXT: '', NODE_V8_COVERAGE: '' },
          timeoutMs: 30_000,
        },
        requires: [],
        timeoutMs: 30_000,
        onFailure: 'stop-phase',
        testStats: {
          policy: 'required',
          protocol: 'vitest-json-v1',
          runner: 'vitest',
          source: 'host:explicit-installed-vitest',
        },
      };
      const result = await executeLocalStep(step, acquired.guard);
      assert.equal(result.verdict, broken ? 'fail' : 'pass', JSON.stringify(result.problem));
      assert.equal(result.result?.testStats?.executed, 1);
      assert.equal(result.result?.testStats?.failed, broken ? 1 : 0);
      rows.push({
        broken,
        verdict: result.verdict,
        durationMs: result.result?.durationMs,
        stats: result.result?.testStats,
      });
    } finally {
      assert.equal(acquired.guard.release().kind, 'released');
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
const report = {
  schema: 'installed-vitest-stream-qualification/1',
  modelCalls: 0,
  installedVitestVersion: pkg.version,
  runnerEntrypointSha256: sha(readFileSync(entry)),
  observedReferenceStdoutBytes: largeBytes,
  policyLimitUnchanged: 1024 * 1024,
  statsSource: 'declared runner stdout only; not stderr or a stale report file',
  rows,
  rootRemoved: !existsSync(root),
  sharedDependencyEntryStillExists: existsSync(join(vitestRoot, 'package.json')),
  sourceSha256: sha(readFileSync(new URL(import.meta.url))),
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
