// @file: Istanbul JSON adapter for JavaScript-family coverage projects.
// @consumers: coverage-adapter-registry.ts

import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { extname, join, posix, relative, resolve } from 'node:path';
import type {
  CoverageAdapter,
  CoverageFileDetail,
  CoverageLineDetail,
  CoverageMetrics,
  CoveragePathResolution,
  CoverageProducer,
  CoverageReport,
} from './coverage-adapter.types.ts';
import { CoverageTraversalError, readCoverageDirectory } from './coverage-traversal.ts';

const SOURCE_EXTENSIONS = new Set([
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

const SKIP_DIRECTORIES = new Set([
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

const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte|vue)$/;

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

function runnerBinary(name: 'npm' | 'npx'): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function readManifest(root: string): PackageManifest | null {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageManifest;
  } catch {
    return null;
  }
}

function normalizeCoveragePath(path: string): string {
  return posix.normalize(path.replaceAll('\\', '/')).replace(/\/$/, '');
}

function isProductionSource(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path)) && !TEST_FILE.test(path);
}

function isTestSource(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path)) && TEST_FILE.test(path);
}

function collectProductionFiles(target: string): string[] {
  let isDirectory: boolean;
  try {
    isDirectory = lstatSync(target).isDirectory();
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code ?? 'I/O error';
    throw new CoverageTraversalError(`cannot inspect ${target}: ${code}`);
  }
  if (!isDirectory) return isProductionSource(target) ? [target] : [];

  const files: string[] = [];
  const dirs = [target];
  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    const entries = readCoverageDirectory(dir);
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) dirs.push(path);
      } else if (isProductionSource(path)) {
        files.push(path);
      }
    }
  }
  return files;
}

function parseReport(reportContent: string): CoverageReport {
  const parsed = JSON.parse(reportContent) as Record<
    string,
    { s?: Record<string, number>; b?: Record<string, number[]>; f?: Record<string, number> }
  >;
  const entries: Record<string, unknown> = parsed;
  const metrics: Record<string, CoverageMetrics> = {};
  for (const [path, data] of Object.entries(parsed)) {
    const statements = Object.values(data.s ?? {});
    const branches = Object.values(data.b ?? {}).flat();
    const functions = Object.values(data.f ?? {});
    metrics[path] = {
      sT: statements.length,
      sH: statements.filter((value) => value > 0).length,
      bT: branches.length,
      bH: branches.filter((value) => value > 0).length,
      fT: functions.length,
      fH: functions.filter((value) => value > 0).length,
    };
  }
  return { entries, metrics };
}

function fileDetail(
  sourcePath: string,
  sourceContent: string,
  reportEntry: unknown
): { kind: 'supported'; value: CoverageFileDetail } {
  const entry = reportEntry as Record<string, unknown>;
  const lines: CoverageLineDetail[] = sourceContent.split('\n').map((text, index) => ({
    num: index + 1,
    text,
    sT: 0,
    sH: 0,
    bT: 0,
    bH: 0,
    fT: 0,
    fH: 0,
  }));
  const lineAt = (line: number): CoverageLineDetail | undefined => lines[line - 1];
  const statementMap = (entry['statementMap'] ?? {}) as Record<
    string,
    { start: { line: number }; end: { line: number } }
  >;
  const statements = (entry['s'] ?? {}) as Record<string, number>;
  for (const [id, location] of Object.entries(statementMap)) {
    const hit = statements[id] ?? 0;
    for (let line = location.start.line; line <= location.end.line; line++) {
      const detail = lineAt(line);
      if (!detail) continue;
      detail.sT++;
      if (hit > 0) detail.sH++;
    }
  }
  const branchMap = (entry['branchMap'] ?? {}) as Record<
    string,
    { line?: number; locations: Array<{ start: { line: number }; end: { line: number } }> }
  >;
  const branches = (entry['b'] ?? {}) as Record<string, number[]>;
  for (const [id, branch] of Object.entries(branchMap)) {
    const hits = branches[id] ?? [];
    for (let index = 0; index < branch.locations.length; index++) {
      const location = branch.locations[index]!;
      for (let line = location.start.line; line <= location.end.line; line++) {
        const detail = lineAt(line);
        if (!detail) continue;
        detail.bT++;
        if ((hits[index] ?? 0) > 0) detail.bH++;
      }
    }
    const covered = hits.filter((hit) => hit > 0).length;
    if (covered < branch.locations.length) {
      const line = branch.line ?? branch.locations[0]?.start.line ?? 0;
      const detail = lineAt(line);
      if (detail && !detail.note) {
        detail.note = `← branch ${covered === 0 ? 'not taken' : `${covered}/${branch.locations.length} taken`}`;
      }
    }
  }
  const functionMap = (entry['fnMap'] ?? {}) as Record<
    string,
    { line?: number; name?: string; loc: { start: { line: number }; end: { line: number } } }
  >;
  const functions = (entry['f'] ?? {}) as Record<string, number>;
  for (const [id, fn] of Object.entries(functionMap)) {
    const hit = functions[id] ?? 0;
    for (let line = fn.loc.start.line; line <= fn.loc.end.line; line++) {
      const detail = lineAt(line);
      if (!detail) continue;
      detail.fT++;
      if (hit > 0) detail.fH++;
    }
    if (hit === 0) {
      const detail = lineAt(fn.line ?? fn.loc.start.line);
      if (detail && !detail.note) {
        const anonymous =
          !fn.name ||
          fn.name === '(anonymous)' ||
          fn.name === '__name' ||
          fn.name.startsWith('(anonymous');
        detail.note = anonymous ? '← never called' : `← ${fn.name}() never called`;
      }
    }
  }
  const totals = lines.reduce<CoverageMetrics>(
    (total, line) => ({
      sT: total.sT + line.sT,
      sH: total.sH + line.sH,
      bT: total.bT + line.bT,
      bH: total.bH + line.bH,
      fT: total.fT + line.fT,
      fH: total.fH + line.fH,
    }),
    { sT: 0, sH: 0, bT: 0, bH: 0, fT: 0, fH: 0 }
  );
  return { kind: 'supported', value: { path: sourcePath, lines, ...totals } };
}

function parseTestResults(resultsContent: string): {
  kind: 'supported';
  value: Record<string, number>;
} {
  const parsed = JSON.parse(resultsContent) as {
    testResults?: Array<{
      name?: string;
      testFilePath?: string;
      assertionResults?: Array<{ status: string }>;
    }>;
  };
  const counts: Record<string, number> = {};
  for (const suite of parsed.testResults ?? []) {
    const path = suite.testFilePath ?? suite.name;
    if (path) {
      counts[path] = (suite.assertionResults ?? []).filter(
        ({ status }) => status === 'passed'
      ).length;
    }
  }
  return { kind: 'supported', value: counts };
}

function resolveSource(
  root: string,
  report: CoverageReport,
  sourcePath: string
): CoveragePathResolution {
  const normalizedKeys = Object.keys(report.metrics).map((key) => ({
    key,
    normalized: normalizeCoveragePath(key),
  }));
  const absolute = normalizeCoveragePath(resolve(root, sourcePath));
  const repoRelative = normalizeCoveragePath(relative(root, sourcePath));
  const exact = normalizedKeys.filter(
    ({ normalized }) => normalized === absolute || normalized === repoRelative
  );
  if (exact.length === 1) return { kind: 'found', key: exact[0]!.key };
  if (exact.length > 1) return { kind: 'ambiguous', keys: exact.map(({ key }) => key) };

  // Root-level suffix matching would be basename-only and could attribute another file's coverage.
  if (!repoRelative.includes('/')) return { kind: 'missing' };
  const suffix = `/${repoRelative}`;
  const relocated = normalizedKeys.filter(({ normalized }) => normalized.endsWith(suffix));
  if (relocated.length === 1) return { kind: 'found', key: relocated[0]!.key };
  if (relocated.length > 1) {
    return { kind: 'ambiguous', keys: relocated.map(({ key }) => key) };
  }
  return { kind: 'missing' };
}

/**
 * @purpose Istanbul JSON implementation of the complete JS-family coverage boundary.
 * @invariant A match requires package.json or the adapter's exact report artifact; source identity
 *   never falls back to basename.
 */
export const istanbulCoverageAdapter: CoverageAdapter = {
  id: 'istanbul-js',
  platform: 'JavaScript / TypeScript / Vue / Svelte',
  reportFormat: 'Istanbul JSON',
  detect(root) {
    const evidence = [
      existsSync(join(root, 'package.json')) ? 'package.json' : '',
      existsSync(join(root, 'coverage', 'coverage-final.json'))
        ? 'coverage/coverage-final.json'
        : '',
    ].filter(Boolean);
    return { matched: evidence.length > 0, evidence };
  },
  artifacts(_root) {
    return {
      report: 'coverage/coverage-final.json',
      testResults: 'coverage/.tree-results.json',
      writableDirectories: ['coverage'],
    };
  },
  producerCapability(root) {
    const pkg = readManifest(root);
    if (!pkg) {
      return {
        kind: 'unsupported',
        code: 'NO_PACKAGE_JSON',
        message: 'package.json not found or malformed at project root',
        expect: `readable package.json at ${root}`,
        fix: 'Run from the project root and repair package.json',
      };
    }
    const deps = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
    const scripts = pkg.scripts ?? {};
    const producers: CoverageProducer[] = [];
    if (deps['vitest'] || deps['@vitest/coverage-v8'] || deps['@vitest/coverage-istanbul']) {
      producers.push({
        name: 'vitest',
        invocation: (out: string) => ({
          command: runnerBinary('npx'),
          args: [
            '--no-install',
            'vitest',
            'run',
            '--coverage',
            '--reporter=default',
            '--reporter=json',
            `--outputFile.json=${out}`,
          ],
        }),
      });
    }
    if (deps['jest'] || deps['@jest/core'] || deps['jest-circus'] || deps['babel-jest']) {
      producers.push({
        name: 'jest',
        invocation: (out: string) => ({
          command: runnerBinary('npx'),
          args: ['--no-install', 'jest', '--coverage', '--json', `--outputFile=${out}`],
        }),
      });
    }
    const nodeTestEntry = Object.entries(scripts).find(([, value]) =>
      /\bnode\s+--test\b/.test(value)
    );
    if (deps['c8'] && nodeTestEntry) {
      const [scriptName, scriptCommand] = nodeTestEntry;
      producers.push({
        name: 'node:test',
        invocation: (_out: string) =>
          /\bc8\b/.test(scriptCommand)
            ? { command: runnerBinary('npm'), args: ['run', scriptName] }
            : {
                command: runnerBinary('npx'),
                args: ['--no-install', 'c8', '--reporter=json', 'npm', 'run', scriptName],
              },
      });
    }
    if (producers.length > 0) {
      return { kind: 'available', producers: [producers[0]!, ...producers.slice(1)] };
    }
    const native = Object.entries(scripts).find(
      ([, value]) => /\bnode\s+--test\b/.test(value) && /--experimental-test-coverage\b/.test(value)
    );
    if (native) {
      return {
        kind: 'unsupported',
        code: 'NATIVE_COVERAGE_UNSUPPORTED',
        message: `native node coverage found in script "${native[0]}" but it does not produce Istanbul JSON`,
        expect: 'c8 with a node --test npm script',
        fix: `native node coverage found; install c8 for testcov integration — npm install -D c8, then wrap the script: npx c8 --reporter=json npm run ${native[0]}`,
      };
    }
    return {
      kind: 'unsupported',
      code: 'NO_RUNNER',
      message: 'No Istanbul-compatible coverage producer detected in package.json',
      expect: 'vitest, jest, or c8 with a node --test npm script',
      fix: 'Install a producer supported by the selected istanbul-js adapter',
    };
  },
  isProductionSource,
  isTestSource,
  shouldSkipDirectory: (name) => SKIP_DIRECTORIES.has(name),
  collectProductionFiles,
  parseReport,
  fileDetail,
  parseTestResults,
  resolveSource,
  staleSources(reportMtimeMs, sourcePaths) {
    return sourcePaths.filter((source) => statSync(source).mtimeMs > reportMtimeMs);
  },
};
