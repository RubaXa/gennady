// @file: Real-repository compiled CLI coverage benchmark with isolated checkout and mandatory cleanup.
// @spec: AI-SKILLS
// @consumers: SDD coverage SC2 qualification

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import type { CoverageDocument } from '../../../shared/sdd/coverage-repository.ts';

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const ownRoot = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
assert.equal(args.length, 4, 'usage: coverage-cli-performance.ts --repo PATH --out NEW_FILE');
assert.equal(args[0], '--repo');
assert.equal(args[2], '--out');
const source = resolve(args[1]!);
const output = resolve(args[3]!);
assert.equal(existsSync(output), false, 'never overwrite prior measurements');
assert.equal(process.platform, 'darwin', 'this metric parser requires macOS /usr/bin/time -l');
const git = (cwd: string, ...command: string[]) =>
  execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...command], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
const before = git(source, 'status', '--porcelain', '--untracked-files=all');
assert.equal(before, '', 'benchmark starts from a clean real repository');
const revision = git(source, 'rev-parse', 'HEAD').trim();
const paths = git(source, 'ls-files', '-z').split('\0').filter(Boolean);
assert.equal(
  paths.some((path) => path.startsWith('specs/')),
  false,
  'variants start without tracked SDD metadata'
);
const sources = paths.filter((path) => /\.(?:[cm]?[jt]sx?|swift|go|kt|java)$/.test(path));
assert.ok(sources.length > 1000);
const target = sources[0]!;
const holder = mkdtempSync(join(tmpdir(), 'gennady-coverage-cli-perf-'));
const checkout = join(holder, 'repo');
const section = (name: string, text: string) =>
  `<!--SECTION:${name}-->\n${text}\n<!--/SECTION:${name}-->\n`;
const cases: unknown[] = [];
let cleaned = false;
try {
  execFileSync('git', ['clone', '--shared', '--quiet', source, checkout], { stdio: 'pipe' });
  assert.equal(git(checkout, 'rev-parse', 'HEAD').trim(), revision);
  const put = (path: string, content: string) => {
    mkdirSync(dirname(join(checkout, path)), { recursive: true });
    writeFileSync(join(checkout, path), content);
  };
  const invoke = (query: string[]) => {
    const started = performance.now();
    const result = spawnSync(
      '/usr/bin/time',
      [
        '-l',
        process.execPath,
        join(ownRoot, 'dist/gennady.js'),
        'orient',
        '--coverage',
        ...query,
        '--json',
      ],
      {
        cwd: checkout,
        env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
    const document = JSON.parse(result.stdout) as CoverageDocument;
    const rss = /([\d]+)\s+maximum resident set size/.exec(result.stderr);
    const cpu = /([\d.]+)\s+user\s+([\d.]+)\s+sys/.exec(result.stderr);
    assert.ok(rss && cpu, 'elapsed/CPU/RSS evidence must be observable');
    return {
      elapsedMs: performance.now() - started,
      userSeconds: Number(cpu[1]),
      systemSeconds: Number(cpu[2]),
      peakRssBytes: Number(rss[1]),
      reads: document.reads,
      rows: document.coverage.rows.length,
      complete: document.coverage.complete,
      canProceed: document.coverage.canProceed,
      findings: document.coverage.findings.map((finding) => finding.code),
    };
  };
  const measure = (name: string, query: string[], expectedReads: number, expectedRows: number) => {
    const first = invoke(query);
    assert.equal(first.reads.sourceReads, expectedReads);
    assert.equal(first.rows, expectedRows);
    const warm = Array.from({ length: 5 }, () => invoke(query));
    const durations = warm.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
    cases.push({
      name,
      firstProcess: first,
      warmProcesses: warm,
      medianWarmElapsedMs: durations[2],
    });
  };
  measure('no-sdd', [], 0, 0);
  put('specs/README.md', '# Existing project\n## Scopes\n\n## Decision Log\n');
  measure('portal-only', ['--spec', 'specs/README.md'], 0, 0);
  const metadata =
    section('SPEC_ID', 'BENCH') +
    section(
      'FILE_STRUCTURE',
      '**File Mapping:**\n' +
        sources.map((path) => `- \`${path}\`: existing implementation`).join('\n')
    );
  put('specs/bench/bench.spec.md', metadata);
  const task =
    section(
      'META',
      '- **Task-ID:** BENCH-work\n- **Status:** [ ] TODO\n- **Owning Spec:** [owner](./bench.spec.md)'
    ) +
    section(
      'PHASES_OVERVIEW',
      '| Phase | Kind | Deps | Status |\n|---|---|---|---|\n| P1 | impl | — | [ ] |'
    ) +
    section('PHASE_P1', '- **Target Files:**\n  - `' + target + '`\n- **Deleted Files:**\n');
  put('specs/bench/bench.task.work.md', task);
  const phaseQuery = ['--task', 'BENCH-work', '--phase', 'P1', '--stage', 'preflight'];
  measure('large-mapping-one-phase', phaseQuery, 1, 1);
  for (const size of [1000, 10000, 50000]) {
    const declarations = [
      target,
      ...Array.from({ length: size - 1 }, (_, index) => `src/synthetic-${index}.ts`),
    ];
    put(
      'specs/bench/bench.spec.md',
      section('SPEC_ID', 'BENCH') +
        section(
          'FILE_STRUCTURE',
          '**File Mapping:**\n' +
            declarations.map((path) => `- \`${path}\`: implementation`).join('\n')
        )
    );
    measure(`synthetic-${size}-mapping-one-real-target`, phaseQuery, 1, 1);
  }
  assert.equal(git(source, 'status', '--porcelain', '--untracked-files=all'), before);
} finally {
  // Every child is synchronous and finished before removal; dependencies were never copied/installed.
  rmSync(holder, { recursive: true, force: true });
  cleaned = !existsSync(holder);
}
assert.equal(cleaned, true);
const sourceFiles = [
  'shared/sdd/coverage-repository.ts',
  'cli/cmd/_shared/sdd-coverage-query.ts',
  'shared/sdd/coverage.ts',
  'shared/sdd/coverage.types.ts',
  'shared/sdd/ticket.ts',
  'shared/sdd/source-extensions.ts',
  'shared/sdd/source-ownership-header.ts',
  'shared/common/repo-path.ts',
  'shared/common/repo-file-identity.ts',
  'ai/flow-eval/scripts/coverage-cli-performance.ts',
  'cli/cmd/orient/orient.cmd.ts',
  'cli/cmd/sdd-check/sdd-check.cmd.ts',
];
const report = {
  schema: 'sdd-coverage-cli-performance/1',
  sourceCommit: git(ownRoot, 'rev-parse', 'HEAD').trim(),
  sourceOverlay: true,
  sourceHashes: Object.fromEntries(
    sourceFiles.map((path) => [path, sha(readFileSync(join(ownRoot, path)))])
  ),
  compiledEntrypointSha256: sha(readFileSync(join(ownRoot, 'dist/gennady.js'))),
  compiledJavaScriptHashes: Object.fromEntries(
    readdirSync(join(ownRoot, 'dist'), { recursive: true })
      .filter((path): path is string => typeof path === 'string' && path.endsWith('.js'))
      .sort()
      .map((path) => [path, sha(readFileSync(join(ownRoot, 'dist', path)))])
  ),
  realRepositoryCommit: revision,
  trackedPaths: paths.length,
  sourcePaths: sources.length,
  modelCalls: 0,
  firstProcessIsNotOsColdCache: true,
  countersScope: 'explicit adapter reads; Git batch bytes separately; not host syscall accounting',
  originalCheckoutUnchanged: true,
  sharedDependenciesUntouched: true,
  safeCleanup: cleaned,
  cases,
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, cases: cases.length, safeCleanup: cleaned }));
