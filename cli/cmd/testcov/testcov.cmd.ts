// @file: testcov command — visual test coverage tree for vitest / jest / node:test projects.
// @consumers: gennady.ts
// @tasks: TSK-66

/**
 * npx gennady testcov              dirs only (default)
 * npx gennady testcov --files      dirs + source files
 * npx gennady testcov --run        detect runner → run tests with coverage → show tree
 * npx gennady testcov --check      diagnose config without running tests (exit 0/1)
 * npx gennady testcov --check --json  same, machine-readable JSON
 * npx gennady testcov --flat       flat list of dirs
 * npx gennady testcov --flat --files  flat list of source files
 * npx gennady testcov --flat --json   JSON array {path, lines, branches, functions}
 * npx gennady testcov <path>       target specific folder
 *
 * Legend: ✅ ≥75%   🟢 ≥50%   🟡 ≥25%   🟠 >0%   🔴 0%   ⚫ not instrumented
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, extname, resolve, basename, relative } from 'node:path';
import type { Dirent } from 'node:fs';
import { parseArgs } from '../../../shared/common/parse-args.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = resolve(process.cwd());
const COVERAGE_FILE = join(ROOT, 'coverage', 'coverage-final.json');
const RESULTS_TMP = join(ROOT, 'coverage', '.tree-results.json');

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = parseArgs(process.argv, {
  files: ['files'],
  run: ['run'],
  check: ['check'],
  json: ['json'],
  flat: ['flat'],
  help: ['help', 'h'],
  context: ['context', 'c'],
  color: ['color'],
});

const RUN_TESTS = args.run === true || args.run === 'true';
const CHECK_ONLY = args.check === true || args.check === 'true';
const SHOW_FILES = args.files === true || args.files === 'true';
const FLAT = args.flat === true || args.flat === 'true';
const JSON_OUT = args.json === true || args.json === 'true';
const HELP = args.help === true || args.help === 'true';
const CONTEXT = typeof args.context === 'string' ? parseInt(args.context, 10) || 2 : 2;
const COLOR = args.color === true || args.color === 'true';

// Positional arg: skip "testcov" (command name), take first real path
const positional = (args._ as string[]).filter((a) => a !== 'testcov');
const TARGET = positional.length > 0 ? positional[0] : undefined;

if (HELP) {
  const { printHelp } = await import('./help.ts');
  printHelp();
  process.exit(0);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DiagCode =
  | 'NO_PACKAGE_JSON'
  | 'NO_RUNNER'
  | 'NO_COVERAGE_FILE'
  | 'COVERAGE_FILE_PARSE_ERROR'
  | 'NO_RUNNER_CONFIG'
  | 'MISSING_JSON_REPORTER'
  | 'MISSING_REPORT_ON_FAILURE'
  | 'REPORT_ON_FAILURE_DISABLED';

interface Diagnostic {
  level: 'error' | 'warning';
  code: DiagCode;
  /** Human-readable description of what is wrong. */
  message: string;
  /** What the tool expects in order to work. */
  expect: string;
  /** Concrete action the user (or agent) should take. */
  fix: string;
}

interface DetectedRunner {
  name: 'vitest' | 'jest' | 'node:test';
  /** Returns the shell command that runs tests with coverage and writes coverage-final.json. */
  runCmd(resultsFile: string): string;
}

type PkgJson = {
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  jest?: { coverageReporters?: string[] };
};

interface FileCovRaw {
  sT: number;
  sH: number;
  bT: number;
  bH: number;
  fT: number;
  fH: number;
}

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
function detectRunners(): DetectedRunner[] {
  const pkg = readPkg();
  if (!pkg) return [];

  const deps = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
  const scripts = pkg.scripts ?? {};
  const runners: DetectedRunner[] = [];

  // #region START_VITEST_DETECTION — detects vitest or its coverage providers
  if (deps['vitest'] || deps['@vitest/coverage-v8'] || deps['@vitest/coverage-istanbul']) {
    runners.push({
      name: 'vitest',
      runCmd: (out) =>
        `npx vitest run --coverage --reporter=default --reporter=json --outputFile.json=${out}`,
    });
  }
  // #endregion END_VITEST_DETECTION

  // #region START_JEST_DETECTION — detects jest core or related packages
  if (deps['jest'] || deps['@jest/core'] || deps['jest-circus'] || deps['babel-jest']) {
    runners.push({
      name: 'jest',
      runCmd: (out) => `npx jest --coverage --json --outputFile=${out}`,
    });
  }
  // #endregion END_JEST_DETECTION

  // #region START_NODE_TEST_DETECTION — detects c8 + node --test script; re-uses npm script for correct TS loader
  const nodeTestEntry = Object.entries(scripts).find(([, v]) => /\bnode\s+--test\b/.test(v));
  if (deps['c8'] && nodeTestEntry) {
    const [scriptName, scriptCmd] = nodeTestEntry;
    const alreadyWrappedWithC8 = /\bc8\b/.test(scriptCmd);
    runners.push({
      name: 'node:test',
      runCmd: (_out) =>
        alreadyWrappedWithC8
          ? `npm run ${scriptName}`
          : `npx c8 --reporter=json npm run ${scriptName}`,
    });
  }
  // #endregion END_NODE_TEST_DETECTION

  return runners;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

/** @purpose Collects all configuration/environment diagnostics without side effects; used by --check and on any fatal error. */
function runDiagnostics(): Diagnostic[] {
  const diags: Diagnostic[] = [];

  // #region START_DIAG_PACKAGE_JSON — package.json must exist
  const pkg = readPkg();
  if (!pkg) {
    diags.push({
      level: 'error',
      code: 'NO_PACKAGE_JSON',
      message: 'package.json not found at project root',
      expect: `package.json at ${ROOT}`,
      fix: 'Run from the project root (directory containing package.json)',
    });
    return diags;
  }
  // #endregion END_DIAG_PACKAGE_JSON

  // #region START_DIAG_RUNNER — at least one runner must be detected
  const runners = detectRunners();
  if (runners.length === 0) {
    diags.push({
      level: 'error',
      code: 'NO_RUNNER',
      message: 'No supported test runner detected in package.json',
      expect:
        'devDependencies must include one of: vitest, @vitest/coverage-v8, jest, @jest/core, jest-circus — or c8 with a "node --test" npm script',
      fix: 'Install a runner: npm install -D vitest @vitest/coverage-v8',
    });
    return diags;
  }
  // #endregion END_DIAG_RUNNER

  const primary = runners[0]!;

  // #region START_DIAG_COVERAGE_FILE — coverage file must exist
  if (!existsSync(COVERAGE_FILE)) {
    const runHint =
      primary.name === 'vitest'
        ? 'npx vitest run --coverage'
        : primary.name === 'jest'
          ? 'npx jest --coverage'
          : 'npm test';
    diags.push({
      level: 'error',
      code: 'NO_COVERAGE_FILE',
      message: 'coverage/coverage-final.json not found — tests have not been run with coverage',
      expect: `Istanbul JSON coverage file at: ${COVERAGE_FILE}`,
      fix: `Option A: npx gennady testcov --run\nOption B: ${runHint}  (then re-run without --run)`,
    });
  }
  // #endregion END_DIAG_COVERAGE_FILE

  // #region START_DIAG_RUNNER_CONFIG — runner-specific config validation
  if (primary.name === 'vitest') {
    collectVitestDiags(diags);
  } else if (primary.name === 'jest') {
    collectJestDiags(diags, pkg);
  }
  // node:test: c8 works without extra config — no validation needed.
  // #endregion END_DIAG_RUNNER_CONFIG

  return diags;
}

function collectVitestDiags(diags: Diagnostic[]): void {
  const cfgCandidates = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'];
  const cfgFile = cfgCandidates.find((f) => existsSync(join(ROOT, f)));

  if (!cfgFile) {
    diags.push({
      level: 'warning',
      code: 'NO_RUNNER_CONFIG',
      message: 'No vitest config file found',
      expect:
        'vitest.config.ts at project root with coverage.reporter and coverage.reportOnFailure',
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

if (RUN_TESTS) {
  const runners = detectRunners();
  const runner = runners[0];
  if (!runner) {
    printDiagnostics(runDiagnostics(), false);
    process.exit(1);
  }
  process.stderr.write(`testcov: running ${runner.name} with coverage...\n`);
  try {
    // inherit all stdio so the user (and any calling agent) sees runner output + errors.
    execSync(runner.runCmd(RESULTS_TMP), { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT });
  } catch (err) {
    // Exit code 1 = test failures — expected. Coverage is still written (vitest: reportOnFailure: true).
    // Exit code > 1 usually means a runner crash (missing binary, config error, etc.).
    const status = (err as { status?: number }).status ?? -1;
    if (status !== 1) {
      process.stderr.write(
        `\ntestcov: ⚠  ${runner.name} exited with code ${status} — possible configuration error.\n`
      );
      process.stderr.write(`  Run: npx gennady testcov --check  to diagnose.\n`);
    }
  }
}

// ─── Load coverage data ───────────────────────────────────────────────────────

if (!existsSync(COVERAGE_FILE)) {
  printDiagnostics(runDiagnostics(), false);
  process.exit(1);
}

let coverageJson: Record<
  string,
  { s?: Record<string, number>; b?: Record<string, number[]>; f?: Record<string, number> }
>;
try {
  coverageJson = JSON.parse(readFileSync(COVERAGE_FILE, 'utf8'));
} catch {
  printDiagnostics(
    [
      {
        level: 'error',
        code: 'COVERAGE_FILE_PARSE_ERROR',
        message: 'coverage-final.json is not valid JSON',
        expect: `Valid Istanbul-format JSON at: ${COVERAGE_FILE}`,
        fix: 'Delete the file and re-run: npx gennady testcov --run',
      },
    ],
    false
  );
  process.exit(1);
}

const covRaw: Record<string, FileCovRaw> = {};
for (const [fp, data] of Object.entries(coverageJson)) {
  const sV = Object.values(data.s ?? {});
  const bV = Object.values(data.b ?? {}).flat();
  const fV = Object.values(data.f ?? {});
  covRaw[fp] = {
    sT: sV.length,
    sH: sV.filter((v) => v > 0).length,
    bT: bV.length,
    bH: bV.filter((v) => v > 0).length,
    fT: fV.length,
    fH: fV.filter((v) => v > 0).length,
  };
}

// ─── Load test results ────────────────────────────────────────────────────────

const testCases: Record<string, number> = {};

if (existsSync(RESULTS_TMP)) {
  try {
    const d = JSON.parse(readFileSync(RESULTS_TMP, 'utf8')) as {
      testResults?: Array<{
        name?: string;
        testFilePath?: string;
        assertionResults?: Array<{ status: string }>;
      }>;
    };
    for (const s of d.testResults ?? []) {
      // jest uses testFilePath; vitest uses name
      const filePath = s.testFilePath ?? s.name;
      if (filePath) {
        testCases[filePath] = (s.assertionResults ?? []).filter(
          (t) => t.status === 'passed'
        ).length;
      }
    }
  } catch {
    // ignore malformed results file
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.vite',
  '.cache',
  '.turbo',
  '.nx',
  '__generated__',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'vendor',
  'third_party',
  'external',
  '.storybook',
  '.husky',
  '.claude',
  '.github',
  '__tests__',
  '__snapshots__',
  '__mocks__',
  'docs',
  'public',
  'static',
  'assets',
  'fixtures',
  '__fixtures__',
  'tooling-lab',
  'draft',
  'tasks',
  'specs',
  'ai',
]);

const CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.svelte',
  '.vue',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);
const IS_TEST = (name: string) => /\.(test|spec)\.(ts|tsx|mts|js|jsx|mjs|svelte|vue)$/.test(name);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** @purpose Find coverage entry by absolute path; falls back to basename match if exact path not found. */
function findCovEntry(
  absPath: string,
  covJson: Record<string, unknown>
): Record<string, unknown> | undefined {
  // Step 1: exact match
  if (covJson[absPath]) return covJson[absPath] as Record<string, unknown>;

  // Step 2: basename match (handles container paths, different cwd roots, etc.)
  const targetName = basename(absPath);
  for (const [key, val] of Object.entries(covJson)) {
    if (basename(key) === targetName) return val as Record<string, unknown>;
  }

  return undefined;
}

const covRawByName: Record<string, FileCovRaw> = {};
for (const [key, raw] of Object.entries(covRaw)) {
  const name = basename(key);
  if (!covRawByName[name]) covRawByName[name] = raw;
}

/** @purpose Resolve coverage stats for a filesystem path; falls back to basename match. */
function getCovRaw(fp: string): FileCovRaw | undefined {
  return covRaw[fp] ?? covRawByName[basename(fp)];
}

function isLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
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
    let ents: Dirent[];
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const fp = join(dir, e.name);
      if (isLink(fp)) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) dirs.push(fp);
      } else if (e.name === name && CODE_EXT.has(extname(e.name)) && !IS_TEST(e.name)) {
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

interface LineInfo {
  num: number;
  text: string;
  sT: number;
  sH: number;
  bT: number;
  bH: number;
  fT: number;
  fH: number;
}

interface FileDetail {
  path: string;
  lines: LineInfo[];
  sT: number;
  sH: number;
  bT: number;
  bH: number;
  fT: number;
  fH: number;
}

/** @purpose Builds a per-line coverage map from Istanbul statementMap/branchMap/fnMap + source text. */
function buildFileDetail(absPath: string, covEntry: Record<string, unknown>): FileDetail | null {
  if (!existsSync(absPath)) return null;
  const source = readFileSync(absPath, 'utf8');
  const srcLines = source.split('\n');

  // Initialize line info for every line
  const lineMap = new Map<number, LineInfo>();
  for (let i = 0; i < srcLines.length; i++) {
    lineMap.set(i + 1, {
      num: i + 1,
      text: srcLines[i]!,
      sT: 0,
      sH: 0,
      bT: 0,
      bH: 0,
      fT: 0,
      fH: 0,
    });
  }

  // Map statements to lines
  const sm = (covEntry['statementMap'] ?? {}) as Record<
    string,
    { start: { line: number }; end: { line: number } }
  >;
  const s = (covEntry['s'] ?? {}) as Record<string, number>;
  for (const [id, loc] of Object.entries(sm)) {
    const hit = s[id] ?? 0;
    for (let ln = loc.start.line; ln <= loc.end.line; ln++) {
      const li = lineMap.get(ln);
      if (li) {
        li.sT++;
        if (hit > 0) li.sH++;
      }
    }
  }

  // Map branches to lines
  const bm = (covEntry['branchMap'] ?? {}) as Record<
    string,
    { locations: Array<{ start: { line: number }; end: { line: number } }> }
  >;
  const b = (covEntry['b'] ?? {}) as Record<string, number[]>;
  for (const [id, branch] of Object.entries(bm)) {
    const hits = b[id] ?? [];
    for (let bi = 0; bi < branch.locations.length; bi++) {
      const loc = branch.locations[bi]!;
      for (let ln = loc.start.line; ln <= loc.end.line; ln++) {
        const li = lineMap.get(ln);
        if (li) {
          li.bT++;
          if ((hits[bi] ?? 0) > 0) li.bH++;
        }
      }
    }
  }

  // Map functions to lines
  const fm = (covEntry['fnMap'] ?? {}) as Record<
    string,
    {
      decl: { start: { line: number }; end: { line: number } };
      loc: { start: { line: number }; end: { line: number } };
    }
  >;
  const f = (covEntry['f'] ?? {}) as Record<string, number>;
  for (const [id, fn] of Object.entries(fm)) {
    const hit = f[id] ?? 0;
    for (let ln = fn.loc.start.line; ln <= fn.loc.end.line; ln++) {
      const li = lineMap.get(ln);
      if (li) {
        li.fT++;
        if (hit > 0) li.fH++;
      }
    }
  }

  // Aggregate totals
  let totalST = 0,
    totalSH = 0,
    totalBT = 0,
    totalBH = 0,
    totalFT = 0,
    totalFH = 0;
  for (const li of lineMap.values()) {
    totalST += li.sT;
    totalSH += li.sH;
    totalBT += li.bT;
    totalBH += li.bH;
    totalFT += li.fT;
    totalFH += li.fH;
  }

  return {
    path: absPath,
    lines: [...lineMap.values()],
    sT: totalST,
    sH: totalSH,
    bT: totalBT,
    bH: totalBH,
    fT: totalFT,
    fH: totalFH,
  };
}

/** @purpose Renders a source file annotated with per-line coverage: full annotated view with context around uncovered regions. */
function printFileDetail(detail: FileDetail, ctx: number, covEntry: Record<string, unknown>): void {
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

  // Build branch annotation map from original coverage data — keyed by branch start line
  const branchNotes = new Map<number, string>();
  const bmRaw = (covEntry['branchMap'] ?? {}) as Record<
    string,
    { line?: number; locations: Array<{ start: { line: number } }> }
  >;
  const bRaw = (covEntry['b'] ?? {}) as Record<string, number[]>;
  for (const [id, branch] of Object.entries(bmRaw)) {
    const hits = bRaw[id] ?? [];
    const total = branch.locations.length;
    const covered = hits.filter((h) => h > 0).length;
    if (covered < total) {
      const line = branch.line ?? branch.locations[0]?.start.line ?? 0;
      if (line > 0 && !branchNotes.has(line)) {
        const label = covered === 0 ? 'not taken' : `${covered}/${total} taken`;
        branchNotes.set(line, `← branch ${label}`);
      }
    }
  }

  // Build function annotation map for uncovered functions
  const funcNotes = new Map<number, string>();
  const fmRaw = (covEntry['fnMap'] ?? {}) as Record<
    string,
    { line?: number; name?: string; loc: { start: { line: number } } }
  >;
  const fRaw = (covEntry['f'] ?? {}) as Record<string, number>;
  for (const [id, fn] of Object.entries(fmRaw)) {
    const hit = fRaw[id] ?? 0;
    if (hit === 0) {
      const line = fn.line ?? fn.loc.start.line;
      if (line > 0 && !funcNotes.has(line)) {
        const isAnon =
          !fn.name ||
          fn.name === '(anonymous)' ||
          fn.name === '__name' ||
          fn.name.startsWith('(anonymous');
        funcNotes.set(line, isAnon ? '← never called' : `← ${fn.name}() never called`);
      }
    }
  }

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
    const note = branchNotes.get(li.num) ?? funcNotes.get(li.num);
    const noteStr = note ? (COLOR ? `  \x1b[33m${note}\x1b[0m` : `  ${note}`) : '';
    console.log(`${prefix}${lineNum} ${marker} ${li.text}${suffix}${noteStr}`);
  }

  // Legend
  console.log(`\n  ${icon(null)} not instrumented   ♦️ uncovered   🔸 partial   ✓ covered`);
}

function lineMarker(li: LineInfo): string {
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

/** @purpose Recursively aggregates raw Istanbul hit counts for a directory; memoized per dir path. */
function getDirStats(dir: string): DirStats {
  const cached = statsCache.get(dir);
  if (cached) return cached;

  const a: DirStats = { sT: 0, sH: 0, bT: 0, bH: 0, fT: 0, fH: 0, cases: 0 };
  let ents: Dirent[];
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    statsCache.set(dir, a);
    return a;
  }

  for (const e of ents) {
    const fp = join(dir, e.name);
    if (isLink(fp)) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      const c = getDirStats(fp);
      a.sT += c.sT;
      a.sH += c.sH;
      a.bT += c.bT;
      a.bH += c.bH;
      a.fT += c.fT;
      a.fH += c.fH;
      a.cases += c.cases;
    } else {
      if (!CODE_EXT.has(extname(e.name))) continue;
      if (IS_TEST(e.name)) {
        // Test files: contribute case counts but NOT coverage metrics.
        a.cases += testCases[fp] ?? 0;
      } else {
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

/** @purpose Renders an ASCII coverage tree for dir; respects SHOW_FILES and SKIP_DIRS; never shows test files. */
function walk(dir: string, pfx: string): void {
  let ents: Dirent[];
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const visible = ents.filter((e) => {
    const fp = join(dir, e.name);
    if (isLink(fp)) return false;
    if (e.isDirectory()) return !SKIP_DIRS.has(e.name);
    if (!SHOW_FILES) return false;
    if (IS_TEST(e.name)) return false;
    return CODE_EXT.has(extname(e.name));
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
  let ents: Dirent[];
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of ents) {
    if (e.isFile() && CODE_EXT.has(extname(e.name))) return true;
    if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !isLink(join(dir, e.name))) {
      if (hasCode(join(dir, e.name), depth + 1)) return true;
    }
  }
  return false;
}

/** @purpose Returns top-level directories under ROOT that contain source files, sorted. */
function getRoots(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => {
      if (!e.isDirectory()) return false;
      if (SKIP_DIRS.has(e.name)) return false;
      if (e.name.startsWith('.')) return false;
      if (isLink(join(ROOT, e.name))) return false;
      return hasCode(join(ROOT, e.name));
    })
    .map((e) => e.name)
    .sort();
}

// ─── Flat collection ──────────────────────────────────────────────────────────

function collectFlat(dir: string, base: string, out: FlatEntry[]): void {
  let ents: Dirent[];
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const sorted = [...ents].sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const e of sorted) {
    const fp = join(dir, e.name);
    const rel = join(base, e.name);
    if (isLink(fp)) continue;

    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
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
      if (!CODE_EXT.has(extname(e.name))) continue;
      if (IS_TEST(e.name)) continue;
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

// ─── Entry point ──────────────────────────────────────────────────────────────

if (FLAT) {
  const entries: FlatEntry[] = [];
  if (TARGET) {
    const files = findFiles(TARGET);
    if (files.length === 0) {
      console.error(`File not found: ${TARGET}`);
      process.exit(1);
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
    process.exit(1);
  }
  for (const fp of files) {
    const stat = lstatSync(fp);
    if (stat.isFile() && CODE_EXT.has(extname(fp)) && !IS_TEST(fp)) {
      const covEntryRaw = findCovEntry(fp, coverageJson as Record<string, unknown>);
      if (covEntryRaw && typeof covEntryRaw['statementMap'] === 'object') {
        const detail = buildFileDetail(fp, covEntryRaw);
        if (detail) {
          printFileDetail(detail, CONTEXT, covEntryRaw);
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
