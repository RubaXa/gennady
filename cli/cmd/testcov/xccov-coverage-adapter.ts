// @file: Xcode xccov JSON adapter for Swift coverage threshold and freshness checks.
// @consumers: coverage-adapter-registry.ts
// @tasks: V-11

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import { basename, join, posix, relative, resolve } from 'node:path';
import { detectSwiftProject } from '../../../plugins/swift/swift-detect.logic.ts';
import type {
  CoverageAdapter,
  CoverageMetrics,
  CoveragePathResolution,
  CoverageReport,
} from './coverage-adapter.types.ts';
import { CoverageTraversalError, readCoverageDirectory } from './coverage-traversal.ts';

const SKIP_DIRECTORIES = new Set([
  '.git',
  '.build',
  'build',
  'DerivedData',
  'Pods',
  'Carthage',
  'vendor',
  'node_modules',
  'Tests',
  'UITests',
]);

type XccovFile = {
  readonly path?: string;
  readonly name?: string;
  readonly coveredLines?: number;
  readonly executableLines?: number;
};

type XccovReport = {
  readonly targets?: readonly { readonly name?: string; readonly files?: readonly XccovFile[] }[];
};

function normalizeCoveragePath(value: string): string {
  return posix.normalize(value.replaceAll('\\', '/')).replace(/\/$/, '');
}

function xcresultEvidence(root: string): string[] {
  const evidence: string[] = [];
  for (const relativeDirectory of ['', 'build', 'build/xcresult']) {
    const directory = join(root, relativeDirectory);
    let names: string[];
    try {
      names = readdirSync(directory);
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (!name.endsWith('.xcresult')) continue;
      try {
        const stat = lstatSync(join(directory, name));
        if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      } catch {
        continue;
      }
      evidence.push(posix.join(relativeDirectory.replaceAll('\\', '/'), name));
    }
  }
  return evidence;
}

function producerXcresultCandidates(root: string): string[] {
  const candidates = xcresultEvidence(root).filter(
    (bundle) => !bundle.toLowerCase().endsWith('.previous.xcresult')
  );
  const canonical = 'build/xcresult/TestResults.xcresult';
  return candidates.includes(canonical) ? [canonical] : candidates;
}

function isTestSource(value: string): boolean {
  const normalized = normalizeCoveragePath(value);
  return (
    normalized.endsWith('.swift') &&
    (/(^|\/)(?:Tests|UITests)(\/|$)/.test(normalized) || /(?:Test|Tests)\.swift$/.test(normalized))
  );
}

function isProductionSource(value: string): boolean {
  if (!value.endsWith('.swift') || isTestSource(value)) return false;
  const name = basename(value);
  return ![
    'Package.swift',
    'Project.swift',
    'Workspace.swift',
    'Config.swift',
    'Dependencies.swift',
  ].includes(name);
}

function collectProductionFiles(target: string): string[] {
  let isDirectory: boolean;
  try {
    isDirectory = lstatSync(target).isDirectory();
  } catch (cause) {
    throw new CoverageTraversalError(
      `cannot inspect ${target}: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`
    );
  }
  if (!isDirectory) return isProductionSource(target) ? [target] : [];
  const files: string[] = [];
  const directories = [target];
  while (directories.length > 0) {
    const directory = directories.pop()!;
    for (const entry of readCoverageDirectory(directory)) {
      const candidate = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) directories.push(candidate);
      } else if (isProductionSource(candidate)) {
        files.push(candidate);
      }
    }
  }
  return files.sort();
}

function parseReport(content: string): CoverageReport {
  const parsed = JSON.parse(content) as XccovReport;
  const entries: Record<string, unknown> = {};
  const metrics: Record<string, CoverageMetrics> = {};
  for (const target of parsed.targets ?? []) {
    for (const file of target.files ?? []) {
      const key = file.path ?? file.name;
      if (!key) throw new Error('xccov report file entry has neither path nor name');
      if (metrics[key]) {
        throw new Error(
          `xccov report names source '${key}' more than once; target identity is ambiguous`
        );
      }
      const total = file.executableLines;
      const covered = file.coveredLines;
      if (
        typeof total !== 'number' ||
        typeof covered !== 'number' ||
        total < 0 ||
        covered < 0 ||
        covered > total
      ) {
        throw new Error(`xccov report has invalid line counters for '${key}'`);
      }
      entries[key] = file;
      metrics[key] = { sT: total, sH: covered, bT: 0, bH: 0, fT: 0, fH: 0 };
    }
  }
  return { entries, metrics };
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
 * @purpose xccov JSON boundary; project config owns workspace/scheme/destination and
 *   `.xcresult` creation.
 * @invariant No generic test argv is guessed. The configured Swift test gate creates the
 *   canonical/current `.xcresult`; this adapter exports its JSON report for `testcov --check`.
 */
export const xccovCoverageAdapter: CoverageAdapter = {
  id: 'xccov-swift',
  platform: 'Swift / Xcode / Tuist',
  reportFormat: 'xccov JSON',
  detect(root) {
    const project = detectSwiftProject(root);
    const evidence = [
      ...(project?.markers ?? []),
      existsSync(join(root, 'build', 'xcresult', 'coverage.json'))
        ? 'build/xcresult/coverage.json'
        : '',
      ...xcresultEvidence(root),
    ].filter(Boolean);
    return { matched: evidence.length > 0, evidence };
  },
  artifacts() {
    return {
      report: 'build/xcresult/coverage.json',
      testResults: 'build/xcresult/.tree-results.json',
      writableDirectories: ['build/xcresult'],
    };
  },
  producerCapability(root) {
    const bundles = producerXcresultCandidates(root);
    if (bundles.length === 0) {
      return {
        kind: 'unsupported',
        code: 'XCCOV_RESULT_MISSING',
        message: 'no bounded .xcresult bundle is available for coverage export',
        expect:
          'the config-owned stack.swift test gate writes exactly one .xcresult at the root, build/, or build/xcresult/',
        fix: 'Run the configured Swift test gate with coverage and -resultBundlePath, then retry testcov --run',
      };
    }
    if (bundles.length > 1) {
      return {
        kind: 'unsupported',
        code: 'XCCOV_RESULT_AMBIGUOUS',
        message: `more than one bounded .xcresult bundle exists: ${bundles.join(', ')}`,
        expect: 'exactly one current .xcresult bundle owned by the configured Swift test gate',
        fix: 'Remove stale result bundles or configure the test gate to leave one exact current bundle',
      };
    }
    const xccov = spawnSync('xcrun', ['--find', 'xccov'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    if (xccov.status !== 0 || xccov.error || !xccov.stdout.trim()) {
      return {
        kind: 'unsupported',
        code: 'XCCOV_TOOL_MISSING',
        message: 'xcrun could not resolve the xccov coverage tool',
        expect: '`xcrun --find xccov` succeeds in the selected Xcode toolchain',
        fix: 'Install/select a complete Xcode toolchain, then retry without changing project code',
      };
    }
    const bundle = resolve(root, bundles[0]!);
    const report = resolve(root, 'build/xcresult/coverage.json');
    return {
      kind: 'available',
      producers: [
        {
          name: 'xccov-export',
          invocation: (_testResultsFile: string) => ({
            command: '/bin/sh',
            args: [
              '-c',
              'mkdir -p "$(dirname "$3")" && "$1" view --report --json "$2" > "$3" && touch -r "$2" "$3"',
              'xccov-export',
              xccov.stdout.trim(),
              bundle,
              report,
            ],
          }),
        },
      ],
    };
  },
  isProductionSource,
  isTestSource,
  shouldSkipDirectory: (name) => SKIP_DIRECTORIES.has(name),
  collectProductionFiles,
  parseReport,
  fileDetail() {
    return {
      kind: 'unsupported',
      code: 'ERR_XCCOV_LINE_DETAIL_UNSUPPORTED',
      message: 'xccov report summaries do not expose adapter-stable per-line hit locations',
    };
  },
  parseTestResults() {
    return {
      kind: 'unsupported',
      code: 'ERR_XCCOV_TEST_RESULTS_UNSUPPORTED',
      message: 'the xccov report does not contain per-source test counts',
    };
  },
  resolveSource,
  staleSources(reportMtimeMs, sourcePaths) {
    return sourcePaths.filter((source) => statSync(source).mtimeMs > reportMtimeMs);
  },
};
