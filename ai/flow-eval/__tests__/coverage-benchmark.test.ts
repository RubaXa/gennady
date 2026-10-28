// @file: SC4 fixture and public-evidence privacy controls; no external source or model calls.
// @spec: AI-SKILLS
// @consumers: deterministic eval qualification

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COVERAGE_BENCHMARK_CASES,
  COVERAGE_BENCHMARK_SOURCE,
  COVERAGE_BENCHMARK_TASK,
  coverageBenchmarkFiles,
  coverageBenchmarkPrompt,
  publicCoverageEvent,
} from '../coverage-benchmark.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parsePhaseDetail } from '../../../shared/sdd/ticket.ts';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createExecutionShellCarrier } from '../scripts/execution-autonomy-shell-carrier.ts';

test('four finite cases share one exact phase and never authorize real project writes', () => {
  assert.equal(COVERAGE_BENCHMARK_CASES.length * 2, 8);
  for (const id of COVERAGE_BENCHMARK_CASES) {
    const files = coverageBenchmarkFiles(id, ['private/project.ts']);
    const section = extractSection(files[COVERAGE_BENCHMARK_TASK]!, 'PHASE_P1');
    assert.equal(section.status, 'ok');
    if (section.status !== 'ok') throw new Error('phase missing');
    const detail = parsePhaseDetail(section.content);
    assert.deepEqual(detail.targetFiles, [COVERAGE_BENCHMARK_SOURCE]);
    assert.equal(detail.pathIssues, undefined);
    assert.deepEqual(detail.deletedFiles, id === 'paths' ? ['sc4-work/old.cjs'] : []);
    assert.equal(Object.keys(files).includes('private/project.ts'), false);
    assert.match(coverageBenchmarkPrompt(id), /host orchestrator, not you/);
    assert.match(coverageBenchmarkPrompt(id), /do not inspect node_modules\/gennady/i);
  }
});

test('large uses real declared path identities without creating synthetic source fillers', () => {
  const names = Array.from({ length: 3007 }, (_, i) => `actual/${i}.ts`);
  const files = coverageBenchmarkFiles('large', names);
  assert.equal((files['specs/sc4/sc4.spec.md']!.match(/actual\//g) ?? []).length, 3007);
  assert.equal(Object.keys(files).filter((path) => path.startsWith('actual/')).length, 0);
});

test('foreign preserves an unauthorized claim; paths combines missing create, exact delete and future phase', () => {
  assert.match(
    coverageBenchmarkFiles('foreign', [])[COVERAGE_BENCHMARK_SOURCE]!,
    /^\/\/ @spec: OTHER/
  );
  const files = coverageBenchmarkFiles('paths', []);
  assert.equal(files[COVERAGE_BENCHMARK_SOURCE], undefined);
  assert.ok(files['sc4-work/old.cjs']);
  assert.equal(files['sc4-work/future.cjs'], undefined);
  assert.match(files[COVERAGE_BENCHMARK_TASK]!, /PHASE_P2/);
});

test('public trajectory cannot serialize private code, arguments, diagnostics, paths or model prose', () => {
  const secret = 'confidential_octavius_source_and_credential_canary';
  const projected = publicCoverageEvent({
    type: 'tool',
    i: 1,
    tool: 'read',
    arg: secret,
    callId: secret,
    status: 'completed',
    diagnostic: secret,
    error: secret,
    observation: { outputPreview: secret } as never,
  });
  assert.equal(JSON.stringify(projected).includes(secret), false);
  assert.equal(projected.category, 'project-read');
  assert.equal(projected.argumentSha256.length, 64);
});

test('unsafe metadata paths cannot enter the generated mapping', () => {
  for (const path of ['../escape.ts', '/absolute.ts', 'x`injected.ts', 'x\nfield.ts'])
    assert.throws(() => coverageBenchmarkFiles('large', [path]), /Unsafe/);
});

test(
  'private-repository shell permits its checkout but denies unrelated temporary contents',
  { skip: process.platform !== 'darwin' },
  async () => {
    const own = realpathSync(mkdtempSync(join(tmpdir(), 'sc4-private-control-')));
    try {
      const workspaceRoot = join(own, 'workspaces');
      const cwd = join(workspaceRoot, 'sdd-flow-eval-phase');
      mkdirSync(cwd, { recursive: true });
      const outside = join(own, 'outside.txt');
      writeFileSync(outside, 'FAKE_CREDENTIAL_CANARY_ONLY');
      writeFileSync(join(cwd, 'inside.txt'), 'allowed fixture');
      const carrier = createExecutionShellCarrier({
        directory: join(own, 'carrier'),
        hostHome: homedir(),
        allowedReadRoots: [],
        privateRoots: [],
        workspaceRoot,
        path: '/usr/bin:/bin',
        restrictReadsToWorkspace: true,
      });
      const plugin = await import(pathToFileURL(carrier.plugin).href);
      const hooks = await plugin.CleanExecutionEnvironment();
      const output: { env: NodeJS.ProcessEnv } = { env: {} };
      await hooks['shell.env']({ cwd }, output);
      const allowed = spawnSync(carrier.shell, ['-c', 'cat inside.txt'], {
        cwd,
        env: output.env,
        encoding: 'utf8',
      });
      assert.equal(
        allowed.status,
        0,
        JSON.stringify({
          stderr: allowed.stderr,
          error: allowed.error?.message,
          signal: allowed.signal,
        })
      );
      assert.equal(allowed.stdout, 'allowed fixture');
      const denied = spawnSync(carrier.shell, ['-c', `cat '${outside}'`], {
        cwd,
        env: output.env,
        encoding: 'utf8',
      });
      assert.notEqual(denied.status, 0);
      assert.equal(denied.stdout.includes('FAKE_CREDENTIAL_CANARY_ONLY'), false);
    } finally {
      rmSync(own, { recursive: true, force: true });
    }
  }
);
