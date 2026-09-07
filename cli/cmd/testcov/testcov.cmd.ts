// @file: testcov command — visual test coverage tree for vitest / jest / node:test projects.
// @consumers: gennady.ts
// @tasks: TSK-66

/**
 * npx gennady testcov              dirs only (default)
 * npx gennady testcov --files      dirs + source files
 * npx gennady testcov --run        detect runner → run tests with coverage → show tree
 * npx gennady testcov --check      diagnose config without running tests (exit 0/1)
 * npx gennady testcov --check --json  same, machine-readable JSON
 * npx gennady testcov --min=80         coverage gate: exit 1 if line coverage < 80%
 * npx gennady testcov --run --min=80   run tests, then gate on the resulting coverage
 * npx gennady testcov --flat       flat list of dirs
 * npx gennady testcov --flat --files  flat list of source files
 * npx gennady testcov --flat --json   JSON array {path, lines, branches, functions}
 * npx gennady testcov <path>       target specific folder
 *
 * Legend: ✅ ≥75%   🟢 ≥50%   🟡 ≥25%   🟠 >0%   🔴 0%   ⚫ not instrumented
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, lstatSync } from 'node:fs';
import { join, resolve, basename, relative } from 'node:path';
import type { Dirent } from 'node:fs';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { aggregateLineCoverage, describeCoverageGate } from './coverage-threshold.ts';
import { selectCoverageAdapter } from './coverage-adapter-registry.ts';
import type {
  CoverageFileDetail,
  CoverageLineDetail,
  CoverageMetrics,
  CoveragePresentationResult,
  CoverageProducer,
  CoverageReport,
} from './coverage-adapter.types.ts';
import { createCoverageArtifactBoundary } from './coverage-artifact.ts';
import { inspectRepoPath } from '../../../shared/common/repo-path.ts';
import { CoverageTraversalError, readCoverageDirectory } from './coverage-traversal.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = resolve(process.cwd());

// ─── Argument parsing ─────────────────────────────────────────────────────────

const USAGE = [
  'usage: gennady testcov [path] [options]',
  '       gennady testcov --min=<pct> [path...]',
].join('\n');

/** @purpose Stop before coverage I/O when argv does not match the public testcov grammar. */
function badInvocation(problem: string): never {
  console.error(
    [`[testcov] ERR_CLI_TESTCOV_BAD_INVOCATION`, `  problem: ${problem}`, `  ${USAGE}`].join('\n')
  );
  process.exit(4);
}

let args: Record<string, unknown> & { _: string[] };
try {
  args = parseArgs(
    process.argv,
    {
      files: ['files'],
      run: ['run'],
      check: ['check'],
      json: ['json'],
      flat: ['flat'],
      help: ['help', 'h'],
      context: { aliases: ['context', 'c'], takesValue: true },
      color: ['color'],
      // Public grammar is intentionally equals-only: --min=<pct>.
      min: ['min'],
    },
    { strict: true }
  );
} catch (cause) {
  badInvocation(cause instanceof Error ? cause.message : String(cause));
}

const booleanOptions = [
  ['--files', args.files],
  ['--run', args.run],
  ['--check', args.check],
  ['--json', args.json],
  ['--flat', args.flat],
  ['--help', args.help],
  ['--color', args.color],
] as const;
const invalidBoolean = booleanOptions.find(([, value]) => value !== undefined && value !== true);
if (invalidBoolean) badInvocation(`${invalidBoolean[0]} does not take a value or repeat`);

if (
  args.context !== undefined &&
  (typeof args.context !== 'string' || args.context.trim().length === 0)
) {
  badInvocation('--context/-c requires exactly one value');
}
const contextValue = typeof args.context === 'string' ? Number(args.context) : 2;
if (!Number.isFinite(contextValue) || !Number.isInteger(contextValue) || contextValue < 0) {
  badInvocation(`--context/-c must be a finite nonnegative integer, got "${String(args.context)}"`);
}

if (args.min !== undefined && (typeof args.min !== 'string' || args.min.trim().length === 0)) {
  badInvocation('--min requires exactly one value in the form --min=<pct>');
}
const minValue = typeof args.min === 'string' ? Number(args.min) : undefined;
if (minValue !== undefined && (!Number.isFinite(minValue) || minValue < 0 || minValue > 100)) {
  badInvocation(`--min must be a finite number from 0 to 100, got "${String(args.min)}"`);
}

const RUN_TESTS = args.run === true;
const CHECK_ONLY = args.check === true;
const SHOW_FILES = args.files === true;
const FLAT = args.flat === true;
const JSON_OUT = args.json === true;
const HELP = args.help === true;
const CONTEXT = contextValue;
const COLOR = args.color === true;
const MIN_COVERAGE = minValue;

// Positional args: skip only the router's leading "testcov" command token. The threshold gate
// aggregates every remaining target (a task usually has several Target Files); interactive views
// accept one target and reject extras above, rather than silently rendering only the first.
const parsedPositionals = args._ as string[];
const positional =
  parsedPositionals[0] === 'testcov' ? parsedPositionals.slice(1) : parsedPositionals;
const TARGETS = positional;
const TARGET = positional.length > 0 ? positional[0] : undefined;

if (CHECK_ONLY && TARGETS.length > 0) {
  badInvocation(`--check does not take positional target(s): ${TARGETS.join(' ')}`);
}
if (MIN_COVERAGE === undefined && TARGETS.length > 1) {
  badInvocation(`unexpected positional argument(s): ${TARGETS.slice(1).join(' ')}`);
}

if (HELP) {
  const { printHelp } = await import('./help.ts');
  printHelp();
  process.exit(0);
}

/** @purpose Reject an unsafe scoped coverage target before adapter detection or report identity work. */
function coverageTargetFailure(target: string, detail: string): never {
  console.error(
    [
      '[testcov] ERR_CLI_TESTCOV_TARGET_PATH',
      `  problem: target \`${target}\` is not safe coverage evidence: ${detail}`,
      '  fix: pass an exact repo-relative regular file or directory below the current project; absolute, outside, missing, special, and symlink paths are rejected.',
    ].join('\n')
  );
  process.exit(1);
}

const INSPECTED_GATE_TARGETS =
  MIN_COVERAGE !== undefined
    ? TARGETS.map((target) => {
        const inspected = inspectRepoPath(ROOT, target, 'potential');
        if (!inspected.ok) coverageTargetFailure(target, inspected.detail);
        let stat;
        try {
          stat = lstatSync(inspected.absolute);
        } catch (cause) {
          coverageTargetFailure(
            target,
            `path cannot be inspected: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`
          );
        }
        if (!stat.isFile() && !stat.isDirectory()) {
          coverageTargetFailure(target, 'path is neither a regular file nor a directory');
        }
        return inspected.absolute;
      })
    : [];

const adapterSelection = selectCoverageAdapter(ROOT);
if (adapterSelection.kind !== 'selected') {
  const code =
    adapterSelection.kind === 'unsupported'
      ? 'ERR_CLI_TESTCOV_ADAPTER_NOT_FOUND'
      : 'ERR_CLI_TESTCOV_ADAPTER_AMBIGUOUS';
  const problem =
    adapterSelection.kind === 'unsupported'
      ? 'no coverage platform/report adapter matches this project'
      : `several coverage adapters match: ${adapterSelection.matches
          .map(({ id, evidence }) => `${id} (${evidence.join(', ') || 'unspecified evidence'})`)
          .join('; ')}`;
  const fix =
    adapterSelection.kind === 'unsupported'
      ? `configure a supported coverage report adapter (available: ${adapterSelection.available.join(', ') || 'none registered'}); iOS, Android, and Go are not supported yet`
      : 'remove the conflicting report/platform evidence; testcov refuses to guess which adapter owns the gate';
  if (CHECK_ONLY && JSON_OUT) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        adapter: null,
        diagnostics: [{ level: 'error', code, message: problem, fix }],
      })}\n`
    );
  } else {
    process.stderr.write(`[testcov] ${code}\n  problem: ${problem}\n  fix: ${fix}\n`);
  }
  process.exit(1);
}
const coverageAdapter = adapterSelection.adapter;
const coverageBoundaryResult = createCoverageArtifactBoundary(ROOT, coverageAdapter);
if (!coverageBoundaryResult.ok) {
  const message = `selected adapter ${coverageAdapter.id} declared an unsafe artifact: ${coverageBoundaryResult.detail}`;
  const fix =
    'repair the repository path (no symlink components) or the adapter registration; no producer was run and no artifact was read or removed';
  if (CHECK_ONLY && JSON_OUT) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        adapter: coverageAdapter.id,
        diagnostics: [{ level: 'error', code: 'ERR_CLI_TESTCOV_ARTIFACT_PATH', message, fix }],
      })}\n`
    );
  } else {
    process.stderr.write(
      `[testcov] ERR_CLI_TESTCOV_ARTIFACT_PATH\n  problem: ${message}\n  fix: ${fix}.\n`
    );
  }
  process.exit(1);
}
const coverageBoundary = coverageBoundaryResult.boundary;
const COVERAGE_FILE = coverageBoundary.reportAbsolute;
const RESULTS_TMP = coverageBoundary.testResultsAbsolute;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  /** Human-readable description of what is wrong. */
  message: string;
  /** What the tool expects in order to work. */
  expect: string;
  /** Concrete action the user (or agent) should take. */
  fix: string;
}

function renderInvocation(invocation: { command: string; args: string[] }): string {
  return [invocation.command, ...invocation.args].join(' ');
}

type PkgJson = {
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  jest?: { coverageReporters?: string[] };
};

type FileCovRaw = CoverageMetrics;

interface DirStats extends FileCovRaw {
  cases: number;
}

interface FlatEntry {
  path: string;
  lines: number | null;
  branches: number | null;
  functions: number | null;
  tests?: number;
}

// ─── Runner detection ─────────────────────────────────────────────────────────

/** @purpose Parse package.json with error handling; returns null on missing or malformed file. */
function readPkg(): PkgJson | null {
  const pkgPath = join(ROOT, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')) as PkgJson;
  } catch {
    return null;
  }
}

/** @purpose Reads package.json deps+scripts to detect which test runner(s) are installed; priority: vitest > jest > node:test. */
function detectRunners(): CoverageProducer[] {
  const capability = coverageAdapter.producerCapability(ROOT);
  return capability.kind === 'available' ? capability.producers : [];
}

/**
 * @purpose Isolate a nested producer from its caller's Node test and V8 coverage control plane
 *   without dropping ordinary runtime environment.
 * @returns Inherited environment with nested-process control variables cleared.
 */
function producerEnvironment(): NodeJS.ProcessEnv {
  // Node re-injects its active NODE_V8_COVERAGE into spawn children when the key is absent. An
  // explicit empty value is the supported opt-out for this child boundary; deleting alone leaks it.
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_V8_COVERAGE: '' };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST_')) delete env[key];
  }
  return env;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

/** @purpose Collects all configuration/environment diagnostics without side effects; used by --check and on any fatal error. */
function runDiagnostics(): Diagnostic[] {
  const diags: Diagnostic[] = [];

  // #region START_DIAG_RUNNER — selected adapter owns platform manifest and producer capability
  // The adapter owns its platform manifest. Istanbul reports NO_PACKAGE_JSON itself; a future
  // Go/iOS/Android adapter is not forced through a JavaScript package.json precondition here.
  const producerCapability = coverageAdapter.producerCapability(ROOT);
  if (producerCapability.kind === 'unsupported') {
    diags.push({
      level: 'error',
      code: producerCapability.code,
      message: producerCapability.message,
      expect: producerCapability.expect,
      fix: producerCapability.fix,
    });
    return diags;
  }
  const runners = producerCapability.producers;
  // #endregion END_DIAG_RUNNER

  const primary = runners[0]!;

  // #region START_DIAG_COVERAGE_FILE — coverage file must exist
  const reportRead = coverageBoundary.readReport();
  if (!reportRead.ok) {
    // node:test has no fixed command — the real one is whichever npm script detectRunners() found
    // wrapped in c8; a hardcoded "npm test" would suggest a script that may not exist or lack coverage.
    const runHint =
      primary.name === 'vitest'
        ? 'npx vitest run --coverage'
        : primary.name === 'jest'
          ? 'npx jest --coverage'
          : renderInvocation(primary.invocation(RESULTS_TMP));
    diags.push({
      level: 'error',
      code: 'NO_COVERAGE_FILE',
      message: `${coverageBoundary.reportRelative} not found or unavailable as safe coverage evidence: ${reportRead.detail}; the selected producer did not produce a readable current report`,
      expect: `${coverageAdapter.reportFormat} regular non-symlink report at: ${COVERAGE_FILE}`,
      fix: `Option A: npx gennady testcov --run\nOption B: ${runHint}  (then re-run without --run)`,
    });
  }
  // #endregion END_DIAG_COVERAGE_FILE

  // #region START_DIAG_RUNNER_CONFIG — runner-specific config validation
  if (primary.name === 'vitest') {
    collectVitestDiags(diags);
  } else if (primary.name === 'jest') {
    collectJestDiags(diags, readPkg() ?? {});
  }
  // node:test: c8 works without extra config — no validation needed.
  // #endregion END_DIAG_RUNNER_CONFIG

  return diags;
}

function collectVitestDiags(diags: Diagnostic[]): void {
  // Vitest is legitimately configured either in its own vitest.config.* or in a `test:` block
  // inside vite.config.* (https://vitest.dev/config/#configuring-vitest) — vite.config.* candidates
  // come after so a dedicated vitest.config.* still wins when both exist.
  const cfgCandidates = [
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mts',
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mts',
  ];
  const cfgFile = cfgCandidates.find((f) => existsSync(join(ROOT, f)));

  if (!cfgFile) {
    diags.push({
      level: 'warning',
      code: 'NO_RUNNER_CONFIG',
      message:
        'No vitest config found (checked vitest.config.* and vite.config.* for a test block)',
      expect:
        'vitest.config.ts at project root (or a `test:` block in vite.config.ts) with coverage.reporter and coverage.reportOnFailure',
      fix: 'Create vitest.config.ts — see: https://vitest.dev/config/#coverage',
    });
    return;
  }

  const cfgText = readFileSync(join(ROOT, cfgFile), 'utf8');

  // Check that coverage.reporter array contains 'json'.
  const hasJsonReporter = /reporter\s*:\s*\[[^\]]*['"]json['"]/s.test(cfgText);
  if (!hasJsonReporter) {
    diags.push({
      level: 'error',
      code: 'MISSING_JSON_REPORTER',
      message: `${cfgFile}: coverage.reporter is missing 'json'`,
      expect: `coverage: { reporter: ['json', 'text', ...] }`,
      fix: `Add 'json' to coverage.reporter in ${cfgFile} — without it, coverage-final.json is never written`,
    });
  }

  // Check reportOnFailure: distinguish missing vs explicit false.
  if (/\breportOnFailure\s*:\s*false\b/.test(cfgText)) {
    diags.push({
      level: 'error',
      code: 'REPORT_ON_FAILURE_DISABLED',
      message: `${cfgFile}: reportOnFailure is explicitly set to false`,
      expect: `coverage: { reportOnFailure: true }`,
      fix: `Change reportOnFailure: false → true in ${cfgFile} — when false, coverage is skipped whenever any test fails`,
    });
  } else if (!/\breportOnFailure\s*:\s*true\b/.test(cfgText)) {
    diags.push({
      level: 'warning',
      code: 'MISSING_REPORT_ON_FAILURE',
      message: `${cfgFile}: coverage.reportOnFailure is not set`,
      expect: `coverage: { reportOnFailure: true }`,
      fix: `Add reportOnFailure: true to the coverage block — without it, coverage is skipped when any test fails (e.g. browser-only tests)`,
    });
  }
}

function collectJestDiags(diags: Diagnostic[], pkg: PkgJson): void {
  const jestCfgCandidates = [
    'jest.config.ts',
    'jest.config.js',
    'jest.config.mjs',
    'jest.config.cjs',
  ];
  const jestCfg = jestCfgCandidates.find((f) => existsSync(join(ROOT, f)));

  let hasJsonReporter = false;

  if (jestCfg) {
    const cfgText = readFileSync(join(ROOT, jestCfg), 'utf8');
    // Look for 'json' or "json" in coverageReporters array
    hasJsonReporter = /coverageReporters\s*:\s*\[[^\]]*['"]json['"]/s.test(cfgText);
  } else if (pkg.jest?.coverageReporters) {
    hasJsonReporter = pkg.jest.coverageReporters.includes('json');
  }

  if (!hasJsonReporter) {
    const target = jestCfg ?? 'package.json (jest.coverageReporters)';
    diags.push({
      level: 'error',
      code: 'MISSING_JSON_REPORTER',
      message: `jest config missing coverageReporters: ['json', ...]`,
      expect: `coverageReporters: ['json', 'text', ...] in ${target}`,
      fix: `Add 'json' to coverageReporters — without it, coverage-final.json is never written`,
    });
  }
}

/** @purpose Formats diagnostics for human or machine consumption; all output goes to stderr to avoid polluting tree stdout. */
function printDiagnostics(diags: Diagnostic[], asJson: boolean): void {
  if (asJson) {
    const runners = detectRunners();
    process.stdout.write(
      JSON.stringify(
        {
          ok: diags.every((d) => d.level !== 'error'),
          adapter: coverageAdapter.id,
          runner: runners[0]?.name ?? null,
          coverageFile: COVERAGE_FILE,
          diagnostics: diags,
        },
        null,
        2
      ) + '\n'
    );
    return;
  }

  if (diags.length === 0) {
    process.stderr.write('testcov: ✅ configuration OK\n');
    return;
  }

  const errors = diags.filter((d) => d.level === 'error');
  const warnings = diags.filter((d) => d.level === 'warning');
  const parts = [
    errors.length > 0 ? `${errors.length} error(s)` : '',
    warnings.length > 0 ? `${warnings.length} warning(s)` : '',
  ]
    .filter(Boolean)
    .join(', ');

  process.stderr.write(`testcov: ${parts}\n\n`);
  for (const d of diags) {
    const sym = d.level === 'error' ? '✗' : '⚠';
    process.stderr.write(`  ${sym} [${d.code}] ${d.message}\n`);
    process.stderr.write(`     Expect: ${d.expect}\n`);
    process.stderr.write(`     Fix:    ${d.fix}\n\n`);
  }
}

// ─── --check mode ─────────────────────────────────────────────────────────────

if (CHECK_ONLY) {
  const diags = runDiagnostics();
  printDiagnostics(diags, JSON_OUT);
  process.exit(diags.some((d) => d.level === 'error') ? 1 : 0);
}

// ─── --run mode ───────────────────────────────────────────────────────────────

let runnerExitCode: number | null = null;
if (RUN_TESTS) {
  const runners = detectRunners();
  const runner = runners[0];
  if (!runner) {
    printDiagnostics(runDiagnostics(), false);
    process.exit(1);
  }
  process.stderr.write(`testcov: running ${runner.name} with coverage...\n`);
  const cleared = coverageBoundary.clearProducerArtifacts();
  if (!cleared.ok) {
    process.stderr.write(
      `[testcov] ERR_CLI_TESTCOV_ARTIFACT_PATH\n  problem: cannot safely clear prior ${coverageBoundary.reportRelative}: ${cleared.detail}\n  fix: replace symlink/special/unreadable artifact components with a normal repo-local directory and retry; the producer was not started.\n`
    );
    process.exit(1);
  }
  const invocation = runner.invocation(RESULTS_TMP);
  const result = spawnSync(invocation.command, invocation.args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: ROOT,
    env: producerEnvironment(),
  });
  if (result.error) {
    runnerExitCode = 127;
    process.stderr.write(
      `\ntestcov: ${runner.name} could not start: ${result.error.message} (${renderInvocation(invocation)})\n`
    );
  } else {
    runnerExitCode = result.status ?? 1;
  }
  if (runnerExitCode !== 0) {
    process.stderr.write(
      `\ntestcov: ⚠  ${runner.name} exited with code ${runnerExitCode} — coverage output is diagnostic only; the invocation remains failed.\n`
    );
    process.stderr.write(`  Run: npx gennady testcov --check  to diagnose.\n`);
  }
}

/** @purpose Preserve a failed producer's status through any later coverage-rendering diagnostic. */
function coverageFailureExitCode(): number {
  return runnerExitCode !== null && runnerExitCode !== 0 ? runnerExitCode : 1;
}

// ─── Load coverage data ───────────────────────────────────────────────────────

const reportRead = coverageBoundary.readReport();
if (!reportRead.ok) {
  printDiagnostics(runDiagnostics(), false);
  process.exit(coverageFailureExitCode());
}

let coverageReport: CoverageReport;
try {
  coverageReport = coverageAdapter.parseReport(reportRead.content);
} catch {
  printDiagnostics(
    [
      {
        level: 'error',
        code: 'COVERAGE_FILE_PARSE_ERROR',
        message: `${coverageAdapter.reportFormat} report is not valid`,
        expect: `Valid ${coverageAdapter.reportFormat} coverage report at: ${COVERAGE_FILE}`,
        fix: 'Delete the file and re-run: npx gennady testcov --run',
      },
    ],
    false
  );
  process.exit(coverageFailureExitCode());
}
const coverageJson = coverageReport.entries;
const covRaw = coverageReport.metrics;

// ─── Load test results ────────────────────────────────────────────────────────

const testCases: Record<string, number> = {};

const resultsRead = coverageBoundary.readTestResults();
if (resultsRead.ok) {
  try {
    const parsed = coverageAdapter.parseTestResults(resultsRead.content);
    if (parsed.kind === 'supported') {
      Object.assign(testCases, parsed.value);
    } else if (MIN_COVERAGE === undefined) {
      process.stderr.write(
        `[testcov] ${parsed.code}\n  problem: ${parsed.message}\n  effect: coverage remains available, but no test counts are shown.\n`
      );
    }
  } catch (cause) {
    if (MIN_COVERAGE === undefined) {
      process.stderr.write(
        `[testcov] ERR_CLI_TESTCOV_RESULTS_PARSE\n  problem: selected adapter could not parse ${coverageBoundary.testResultsRelative}: ${cause instanceof Error ? cause.message : String(cause)}\n  effect: coverage remains available, but no test counts are shown.\n`
      );
    }
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** @purpose Find the uniquely path-identified coverage entry for a source file. */
function findCovEntry(absPath: string): unknown | undefined {
  const resolution = coverageAdapter.resolveSource(ROOT, coverageReport, absPath);
  return resolution.kind === 'found' ? coverageJson[resolution.key] : undefined;
}

/** @purpose Resolve coverage stats only through full path identity, never basename alone. */
function getCovRaw(fp: string): FileCovRaw | undefined {
  const resolution = coverageAdapter.resolveSource(ROOT, coverageReport, fp);
  return resolution.kind === 'found' ? covRaw[resolution.key] : undefined;
}

/** @purpose Enumerate production files under an exact gate target, applying the same extension/skip policy as the tree. */
function productionFiles(target: string): string[] {
  return coverageAdapter.collectProductionFiles(target);
}

/** @purpose Reject every incomplete project-wide or scoped source walk with one teaching error. */
function traversalFailure(cause: unknown, scope: string): never {
  const detail =
    cause instanceof CoverageTraversalError
      ? cause.message
      : cause instanceof Error
        ? cause.message
        : String(cause);
  console.error(
    [
      '[testcov] ERR_CLI_TESTCOV_TRAVERSAL',
      `  problem: ${scope} could not be enumerated completely: ${detail}`,
      '  fix: restore read access to the entire coverage source tree and retry; partial coverage aggregates are never accepted.',
    ].join('\n')
  );
  process.exit(coverageFailureExitCode());
}

/** @purpose Enumerate one coverage directory through the shared fail-closed traversal boundary. */
function coverageEntries(dir: string): Dirent[] {
  try {
    return readCoverageDirectory(dir);
  } catch (cause) {
    traversalFailure(cause, relative(ROOT, dir) || '.');
  }
}

function isLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch (cause) {
    traversalFailure(cause, relative(ROOT, p) || '.');
  }
}

function pct(hit: number, total: number): number | null {
  return total > 0 ? Math.round((100 * hit) / total) : null;
}

/** @purpose Find files by path or name; exact match first, then all files with matching basename in project. */
function findFiles(target: string): string[] {
  const direct = resolve(ROOT, target);
  if (existsSync(direct)) return [direct];

  const name = basename(target);
  const results: string[] = [];
  const dirs = [ROOT];
  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    const ents = coverageEntries(dir);
    for (const e of ents) {
      const fp = join(dir, e.name);
      if (isLink(fp)) continue;
      if (e.isDirectory()) {
        if (!coverageAdapter.shouldSkipDirectory(e.name) && !e.name.startsWith('.')) dirs.push(fp);
      } else if (e.name === name && coverageAdapter.isProductionSource(fp)) {
        results.push(fp);
      }
    }
  }
  return results;
}

function icon(p: number | null): string {
  if (p === null) return '⚫';
  if (p >= 75) return '✅';
  if (p >= 50) return '🟢';
  if (p >= 25) return '🟡';
  if (p > 0) return '🟠';
  return '🔴';
}

// ─── File detail (line-by-line coverage) ──────────────────────────────────────

/** @purpose Ask the selected adapter for normalized line detail without inspecting native schema. */
function buildFileDetail(
  absPath: string,
  covEntry: unknown
): CoveragePresentationResult<CoverageFileDetail> | null {
  if (!existsSync(absPath)) return null;
  const source = readFileSync(absPath, 'utf8');
  return coverageAdapter.fileDetail(absPath, source, covEntry);
}

/** @purpose Render adapter-normalized line coverage without reading native report fields. */
function printFileDetail(detail: CoverageFileDetail, ctx: number): void {
  const lP = pct(detail.sH, detail.sT);
  const bP = pct(detail.bH, detail.bT);
  const fP = pct(detail.fH, detail.fT);
  const l = lP !== null ? `${lP}%` : '—';
  const br = bP !== null ? `${bP}%` : '—';
  const fn = fP !== null ? `${fP}%` : '—';

  const relPath = detail.path.startsWith(ROOT) ? detail.path.slice(ROOT.length + 1) : detail.path;

  // Header
  const headerStats = `s:${detail.sH}/${detail.sT} b:${detail.bH}/${detail.bT} f:${detail.fH}/${detail.fT}`;
  console.log(`\n── 📄 ${relPath} — ${icon(lP)} ${l}/${br}/${fn}  (${headerStats}) ──\n`);

  // Identify uncovered regions: consecutive lines where sT > 0 and sH === 0
  const regions: Array<{ start: number; end: number }> = [];
  let regionStart = -1;
  for (const li of detail.lines) {
    const isUncovered = li.sT > 0 && li.sH === 0;
    if (isUncovered && regionStart === -1) {
      regionStart = li.num;
    } else if (!isUncovered && regionStart !== -1) {
      regions.push({ start: regionStart, end: li.num - 1 });
      regionStart = -1;
    }
  }
  if (regionStart !== -1) {
    regions.push({ start: regionStart, end: detail.lines.length });
  }

  // Identify partially covered lines (sT > 0, 0 < sH < sT)
  const partialSet = new Set<number>();
  for (const li of detail.lines) {
    if (li.sT > 0 && li.sH > 0 && li.sH < li.sT) partialSet.add(li.num);
  }

  // Lines to show: uncovered + partial lines, each with ±ctx context
  const toShow = new Set<number>();
  for (const r of regions) {
    for (let ln = r.start; ln <= r.end; ln++) toShow.add(ln);
  }
  for (const ln of partialSet) toShow.add(ln);

  // Expand with context, capped by file bounds
  const expanded = new Set<number>();
  for (const ln of toShow) {
    for (let cl = Math.max(1, ln - ctx); cl <= Math.min(detail.lines.length, ln + ctx); cl++) {
      expanded.add(cl);
    }
  }

  // If no uncovered lines at all, show full file (it's all green)
  const showAll = expanded.size === 0;
  let lastPrinted = 0;
  let gap = false;

  for (const li of detail.lines) {
    if (!showAll && !expanded.has(li.num)) {
      if (!gap && lastPrinted > 0 && lastPrinted < li.num - 1) {
        console.log('  ···');
        gap = true;
      }
      continue;
    }
    gap = false;
    lastPrinted = li.num;

    const lineNum = String(li.num).padStart(5, ' ');
    const marker = lineMarker(li);
    const prefix =
      COLOR && li.sT > 0 && li.sH === 0
        ? '\x1b[41m\x1b[37m'
        : COLOR && li.sT > 0 && li.sH < li.sT
          ? '\x1b[43m\x1b[30m'
          : '';
    const suffix = prefix ? '\x1b[0m' : '';
    const noteStr = li.note ? (COLOR ? `  \x1b[33m${li.note}\x1b[0m` : `  ${li.note}`) : '';
    console.log(`${prefix}${lineNum} ${marker} ${li.text}${suffix}${noteStr}`);
  }

  // Legend
  console.log(`\n  ${icon(null)} not instrumented   ♦️ uncovered   🔸 partial   ✓ covered`);
}

function lineMarker(li: CoverageLineDetail): string {
  if (li.sT === 0 && li.bT === 0 && li.fT === 0) return '·';
  if (li.sT > 0 && li.sH === 0) return '♦️';
  if (li.sT > 0 && li.sH < li.sT) return '🔸';
  if (li.bT > 0 && li.bH < li.bT) return '🔸';
  if (li.fT > 0 && li.fH === 0) return '♦️';
  if (li.fT > 0 && li.fH < li.fT) return '🔸';
  return '✓';
}

// ─── Dir stats (cached, aggregated from raw counts) ───────────────────────────

const statsCache = new Map<string, DirStats>();

/** @purpose Recursively aggregate adapter metrics for a completely readable directory. */
function getDirStats(dir: string): DirStats {
  const cached = statsCache.get(dir);
  if (cached) return cached;

  const a: DirStats = { sT: 0, sH: 0, bT: 0, bH: 0, fT: 0, fH: 0, cases: 0 };
  const ents = coverageEntries(dir);

  for (const e of ents) {
    const fp = join(dir, e.name);
    if (isLink(fp)) continue;
    if (e.isDirectory()) {
      if (coverageAdapter.shouldSkipDirectory(e.name)) continue;
      const c = getDirStats(fp);
      a.sT += c.sT;
      a.sH += c.sH;
      a.bT += c.bT;
      a.bH += c.bH;
      a.fT += c.fT;
      a.fH += c.fH;
      a.cases += c.cases;
    } else {
      if (coverageAdapter.isTestSource(fp)) {
        // Test files: contribute case counts but NOT coverage metrics.
        a.cases += testCases[fp] ?? 0;
      } else if (coverageAdapter.isProductionSource(fp)) {
        const cov = getCovRaw(fp);
        if (cov) {
          a.sT += cov.sT;
          a.sH += cov.sH;
          a.bT += cov.bT;
          a.bH += cov.bH;
          a.fT += cov.fT;
          a.fH += cov.fH;
        }
      }
    }
  }

  statsCache.set(dir, a);
  return a;
}

function fmtDirStats(s: DirStats): string {
  const lP = pct(s.sH, s.sT);
  const p = lP !== null ? `${icon(lP)} ${lP}%` : icon(null);
  return s.cases > 0 ? `${p} (${s.cases} tests)` : p;
}

// ─── Tree output ──────────────────────────────────────────────────────────────

/** @purpose Renders an ASCII coverage tree using the selected adapter's source policy. */
function walk(dir: string, pfx: string): void {
  const ents = coverageEntries(dir);

  const visible = ents.filter((e) => {
    const fp = join(dir, e.name);
    if (isLink(fp)) return false;
    if (e.isDirectory()) return !coverageAdapter.shouldSkipDirectory(e.name);
    if (!SHOW_FILES) return false;
    return coverageAdapter.isProductionSource(join(dir, e.name));
  });

  visible.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < visible.length; i++) {
    const e = visible[i]!;
    const last = i === visible.length - 1;
    const fp = join(dir, e.name);
    const conn = last ? '└─' : '├─';
    const cpfx = pfx + (last ? '   ' : '│  ');

    if (e.isDirectory()) {
      const s = getDirStats(fp);
      console.log(`${pfx}${conn} 📁 ${e.name} — ${fmtDirStats(s)}`);
      walk(fp, cpfx);
    } else {
      const cov = getCovRaw(fp);
      if (cov) {
        const lP = pct(cov.sH, cov.sT);
        const bP = pct(cov.bH, cov.bT);
        const fP = pct(cov.fH, cov.fT);
        if (lP === null && bP === null && fP === null) {
          // sT = 0: file has no executable statements — not instrumented
          console.log(`${pfx}${conn} 📄 ${e.name} ⚫`);
        } else {
          const l = lP !== null ? `${lP}%` : '—';
          const b = bP !== null ? `${bP}%` : '—';
          const f = fP !== null ? `${fP}%` : '—';
          console.log(`${pfx}${conn} 📄 ${e.name} — ${icon(lP)} ${l}/${b}/${f}`);
        }
      } else {
        // File absent from coverage JSON — not instrumented
        console.log(`${pfx}${conn} 📄 ${e.name} ⚫`);
      }
    }
  }
}

// ─── Discover top-level code directories ──────────────────────────────────────

/** @purpose Returns true if dir contains any source file (up to depth 4); used to filter root dirs. */
function hasCode(dir: string, depth = 0): boolean {
  if (depth > 4) return false;
  const ents = coverageEntries(dir);
  for (const e of ents) {
    if (e.isFile() && coverageAdapter.isProductionSource(join(dir, e.name))) return true;
    if (
      e.isDirectory() &&
      !coverageAdapter.shouldSkipDirectory(e.name) &&
      !isLink(join(dir, e.name))
    ) {
      if (hasCode(join(dir, e.name), depth + 1)) return true;
    }
  }
  return false;
}

/** @purpose Returns top-level directories under ROOT that contain source files, sorted. */
function getRoots(): string[] {
  return coverageEntries(ROOT)
    .filter((e) => {
      if (!e.isDirectory()) return false;
      if (coverageAdapter.shouldSkipDirectory(e.name)) return false;
      if (e.name.startsWith('.')) return false;
      if (isLink(join(ROOT, e.name))) return false;
      return hasCode(join(ROOT, e.name));
    })
    .map((e) => e.name)
    .sort();
}

// ─── Flat collection ──────────────────────────────────────────────────────────

function collectFlat(dir: string, base: string, out: FlatEntry[]): void {
  const ents = coverageEntries(dir);

  const sorted = [...ents].sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const e of sorted) {
    const fp = join(dir, e.name);
    const rel = join(base, e.name);
    if (isLink(fp)) continue;

    if (e.isDirectory()) {
      if (coverageAdapter.shouldSkipDirectory(e.name)) continue;
      if (SHOW_FILES) {
        collectFlat(fp, rel, out);
      } else {
        const s = getDirStats(fp);
        out.push({
          path: rel,
          lines: pct(s.sH, s.sT),
          branches: pct(s.bH, s.bT),
          functions: pct(s.fH, s.fT),
          tests: s.cases || undefined,
        });
        collectFlat(fp, rel, out);
      }
    } else {
      if (!SHOW_FILES) continue;
      if (!coverageAdapter.isProductionSource(fp)) continue;
      const cov = getCovRaw(fp);
      if (cov) {
        out.push({
          path: rel,
          lines: pct(cov.sH, cov.sT),
          branches: pct(cov.bH, cov.bT),
          functions: pct(cov.fH, cov.fT),
        });
      } else {
        out.push({ path: rel, lines: null, branches: null, functions: null });
      }
    }
  }
}

function printFlat(entries: FlatEntry[]): void {
  if (JSON_OUT) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  for (const e of entries) {
    const l = e.lines !== null ? `${e.lines}%` : '—';
    const b = e.branches !== null ? `${e.branches}%` : '—';
    const f = e.functions !== null ? `${e.functions}%` : '—';
    const cov = SHOW_FILES ? `${l}/${b}/${f}` : l;
    const tests = e.tests !== undefined ? ` (${e.tests} tests)` : '';
    console.log(`${e.path} ${cov}${tests}`);
  }
}

// ─── --min mode ───────────────────────────────────────────────────────────────
// Both project-wide and scoped gates derive one complete production-source set through the selected
// platform adapter. Every member must be fresh and resolve to exactly one report identity before any
// aggregate is trusted. Tree rendering remains presentation-only and never defines gate membership.

if (MIN_COVERAGE !== undefined) {
  // The gate demands an exact COMPLETE source set. With no positional targets the adapter walks
  // ROOT itself, so root-level files and arbitrarily nested sources cannot disappear behind the
  // presentation tree's top-level/depth heuristics. Future platforms retain ownership of source
  // extensions and ignored directories through collectProductionFiles().
  let selectedFiles: string[];
  try {
    const targets = TARGETS.length > 0 ? INSPECTED_GATE_TARGETS : [ROOT];
    selectedFiles = [...new Set(targets.flatMap(productionFiles))].sort();
  } catch (cause) {
    console.error(
      [
        '[testcov] ERR_CLI_TESTCOV_TRAVERSAL',
        `  problem: coverage source set could not be enumerated completely: ${cause instanceof Error ? cause.message : String(cause)}`,
        '  fix: restore read access to the entire selected subtree and retry; partial coverage aggregates are never accepted.',
      ].join('\n')
    );
    process.exit(coverageFailureExitCode());
  }

  const resolvedSources = selectedFiles.map((file) => ({
    file,
    resolution: coverageAdapter.resolveSource(ROOT, coverageReport, file),
  }));
  const unresolved = resolvedSources.filter(({ resolution }) => resolution.kind !== 'found');
  if (unresolved.length > 0) {
    for (const { file, resolution } of unresolved) {
      const target = relative(ROOT, file);
      if (resolution.kind === 'ambiguous') {
        console.error(
          `testcov: неоднозначная coverage identity для ${target}; полному repo-relative пути соответствуют несколько записей: ${resolution.keys.join(', ')}`
        );
      } else {
        console.error(
          `testcov: coverage identity не найдена для ${target}; каждый production-файл в полном source-set должен иметь единственную запись по точному или полному repo-relative пути (basename-only запрещён)`
        );
      }
    }
    process.exit(coverageFailureExitCode());
  }

  // Freshness is checked for the very same complete set whose unique identities form the aggregate.
  // A directory mtime cannot stand in for nested source bytes.
  let stale: string[];
  try {
    stale = coverageAdapter.staleSources(reportRead.mtimeMs, selectedFiles);
  } catch (cause) {
    traversalFailure(cause, 'coverage source freshness');
  }
  if (stale.length > 0) {
    console.error(
      `testcov: ${relative(ROOT, COVERAGE_FILE)} устарел — эти файлы изменены ПОСЛЕ прогона покрытия: ` +
        `${stale.map((p) => relative(ROOT, p)).join(', ')}. ` +
        `Перегони покрытие (sdd-verify --task <ticket-path> --phase <test-PhaseID> / testcov --run) перед проверкой порога.`
    );
    process.exit(coverageFailureExitCode());
  }

  const buckets = resolvedSources.map(({ resolution }) => {
    if (resolution.kind !== 'found') throw new Error('unreachable unresolved coverage identity');
    return covRaw[resolution.key] as FileCovRaw;
  });
  const totals = aggregateLineCoverage(buckets);
  const { message, ok } = describeCoverageGate(totals, MIN_COVERAGE);
  console.log(message);
  process.exit(runnerExitCode && runnerExitCode !== 0 ? runnerExitCode : ok ? 0 : 1);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (FLAT) {
  const entries: FlatEntry[] = [];
  if (TARGET) {
    const files = findFiles(TARGET);
    if (files.length === 0) {
      console.error(`File not found: ${TARGET}`);
      process.exit(coverageFailureExitCode());
    }
    for (const fp of files) {
      // If it's a directory, collect flat; otherwise add file entry
      const stat = lstatSync(fp);
      if (stat.isDirectory()) {
        collectFlat(fp, TARGET, entries);
      } else {
        const cov = getCovRaw(fp);
        const rel = relative(ROOT, fp);
        entries.push({
          path: rel,
          lines: cov ? pct(cov.sH, cov.sT) : null,
          branches: cov ? pct(cov.bH, cov.bT) : null,
          functions: cov ? pct(cov.fH, cov.fT) : null,
        });
      }
    }
  } else {
    for (const top of getRoots()) collectFlat(join(ROOT, top), top, entries);
  }
  printFlat(entries);
} else if (TARGET) {
  const files = findFiles(TARGET);
  if (files.length === 0) {
    console.error(`File not found: ${TARGET}`);
    process.exit(coverageFailureExitCode());
  }
  for (const fp of files) {
    const stat = lstatSync(fp);
    if (stat.isFile() && coverageAdapter.isProductionSource(fp)) {
      const covEntryRaw = findCovEntry(fp);
      if (covEntryRaw !== undefined) {
        const detail = buildFileDetail(fp, covEntryRaw);
        if (detail) {
          if (detail.kind === 'unsupported') {
            console.error(
              `[testcov] ${detail.code}\n  problem: ${detail.message}\n  fix: install or extend adapter ${coverageAdapter.id} with file-detail support; no native report fields were guessed.`
            );
            process.exit(coverageFailureExitCode());
          }
          printFileDetail(detail.value, CONTEXT);
          continue;
        }
      }
      const rel = relative(ROOT, fp);
      console.log(`📄 ${rel} ⚫  (not in coverage data)`);
    } else {
      const s = getDirStats(fp);
      const rel = relative(ROOT, fp);
      console.log(`📁 ${rel} — ${fmtDirStats(s)}`);
      walk(fp, '');
    }
  }
} else {
  for (const top of getRoots()) {
    const fp = join(ROOT, top);
    const s = getDirStats(fp);
    console.log(`\n📁 ${top} — ${fmtDirStats(s)}`);
    walk(fp, '');
  }
}

if (runnerExitCode && runnerExitCode !== 0) process.exit(runnerExitCode);
