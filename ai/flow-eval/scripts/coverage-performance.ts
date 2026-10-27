// @file: Read-only real-repository metadata and pure-core scaling benchmark, separate from CLI or model evaluation.
// @spec: AI-SKILLS
// @consumers: SDD-COVERAGE-PLAN, SC1 performance qualification

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { inspectRepoPath } from '../../../shared/common/repo-path.ts';
import { resolveSddCoverage } from '../../../shared/sdd/coverage.ts';
import type { CoverageInput } from '../../../shared/sdd/coverage.types.ts';
import { extractHeader } from '../../../cli/cmd/orient/core/extract-header.ts';

function measure(input: CoverageInput) {
  for (let i = 0; i < 3; i++) resolveSddCoverage(input);
  const durations: number[] = [];
  let result = resolveSddCoverage(input);
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    result = resolveSddCoverage(input);
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return {
    repetitions: durations.length,
    medianMs: durations[4],
    maxMs: durations[8],
    declaredFiles: input.specs.reduce((count, spec) => count + spec.files.length, 0),
    observedFiles: input.observations.length,
    rows: result.rows.length,
    complete: result.complete,
    canProceed: result.canProceed,
  };
}

function run(): void {
  const args = process.argv.slice(2);
  assert.equal(args.length, 4, 'usage: coverage-performance.ts --repo PATH --out NEW_FILE');
  assert.equal(args[0], '--repo');
  assert.equal(args[2], '--out');
  const root = resolve(args[1] as string);
  const output = resolve(args[3] as string);
  assert.equal(existsSync(output), false, 'refuse to overwrite an earlier performance record');
  const git = (...command: string[]) =>
    execFileSync(
      'git',
      ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...command],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    );
  const before = git('status', '--porcelain', '--untracked-files=all');
  const start = performance.now();
  const paths = git('ls-files', '-z').split('\0').filter(Boolean);
  const inventoryMs = performance.now() - start;
  const source = paths.filter((path) => /\.(?:[cm]?[jt]sx?|swift|go|kt|java)$/.test(path));
  assert.ok(source.length > 0, 'benchmark needs existing source files');
  const target = source[0] as string;
  const inspected = inspectRepoPath(root, target, 'file');
  assert.ok(inspected.ok, 'selected tracked file must be a safe regular file');
  const readStart = performance.now();
  const bytes = readFileSync(inspected.absolute);
  const header = extractHeader(bytes.toString('utf8'));
  const observationMs = performance.now() - readStart;
  const base: CoverageInput = {
    stage: 'preflight',
    selection: { kind: 'project' },
    specs: [],
    targets: [],
    observations: [],
  };
  const module: CoverageInput = {
    ...base,
    selection: { kind: 'phase', task: 'CORE-work', phase: 'P1' },
    specs: [{ id: 'CORE', path: 'specs/core/core.spec.md', children: [], files: source }],
    targets: [{ task: 'CORE-work', phase: 'P1', specId: 'CORE', path: target, operation: 'write' }],
    observations: [
      {
        path: target,
        state: 'file',
        specIds: Array.from({ length: header.specCount ?? 0 }, () => header.spec ?? ''),
      },
    ],
  };
  const scaled = [1000, 10000, 50000].map((count) => {
    const files = Array.from({ length: count }, (_, index) => `src/file-${index}.ts`);
    return {
      size: count,
      ...measure({
        ...base,
        stage: 'audit',
        specs: [{ id: 'CORE', path: 'specs/core.spec.md', children: [], files }],
        observations: files.map((path) => ({ path, state: 'file', specIds: ['CORE'] })),
      }),
    };
  });
  const ownRoot = resolve(import.meta.dirname, '../../..');
  const report = {
    schema: 'sdd-coverage-core-performance.1',
    modelCalls: 0,
    node: process.version,
    measuredAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ownRoot,
      encoding: 'utf8',
    }).trim(),
    sourceHashes: [
      'shared/sdd/coverage.ts',
      'shared/sdd/coverage.types.ts',
      'ai/flow-eval/scripts/coverage-performance.ts',
    ].map((path) => ({
      path,
      sha256: createHash('sha256')
        .update(readFileSync(resolve(ownRoot, path)))
        .digest('hex'),
    })),
    sourceOverlay: true,
    externalCommit: git('rev-parse', 'HEAD').trim(),
    trackedPaths: paths.length,
    codePaths: source.length,
    inventoryMs,
    externalSourceReads: 1,
    externalBytesRead: bytes.length,
    observationMs,
    cases: {
      noSdd: measure(base),
      portalOnly: measure({
        ...base,
        specs: [{ id: 'PORTAL', path: 'specs/portal.spec.md', children: [], files: [] }],
      }),
      moduleAndPhase: measure(module),
    },
    scaled,
    peakRssKiB: process.resourceUsage().maxRSS,
    externalWorktreeUnchanged: before === git('status', '--porcelain', '--untracked-files=all'),
    limits:
      'SC1 measures Git path inventory, one actual source observation and pure projection over path-derived declarations. It does not install a portal, run the integrated CLI, prove model behavior, or isolate machine load. RSS is whole benchmark high-water mark.',
  };
  assert.equal(report.externalWorktreeUnchanged, true);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
