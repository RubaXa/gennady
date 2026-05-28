// @file: LintCommand — CLI entry point for gennady lint: parseArgs, git scan, single read, 4 checks, ESLint output.
// @consumers: gennady.ts
// @tasks: TSK-16, TSK-49

import { execSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { logger, setLogLevel } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { check as checkFileHeader } from './checks/file-header.check.ts';
import { check as checkAnchors } from './checks/anchor.check.ts';
import { check as checkDbcContracts } from './checks/dbc-contract.check.ts';
import { check as checkDisables } from './checks/disables.check.ts';
import { check as checkLanguage } from './checks/language.check.ts';
import { LintReport } from './lint.types.ts';
import { ERR_CLI_LINT_STAGED_CONFLICT, ERR_CLI_LINT_RESOLVE_FAILED } from './lint.types.ts';
import type { LintError } from './lint.types.ts';
import {
  loadTaskReferences,
  extractTaskIdsFromHeader,
  resolveReferencesForTasks,
} from './utils/resolve-references.fn.ts';

/**
 * @purpose Execute the gennady lint command — collect files, run 4 checks, output ESLint-format report.
 * @implements {LintCommand} in specs/cli/lint/lint.spec.md
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns LintReport with aggregated errors and exit code.
 */
export async function run(rawArgs: string[]): Promise<LintReport> {
  const args = parseArgs(rawArgs, {
    autofix: ['autofix'],
    staged: ['staged'],
    verbose: ['verbose', 'v'],
  });

  const positional = (args._ as string[]).filter(
    (f: string) => typeof f === 'string' && f !== 'lint'
  );

  const autofix = args.autofix === true || args.autofix === 'true';
  const staged = args.staged === true || args.staged === 'true';
  const verbose = args.verbose === true || args.verbose === 'true';

  if (verbose) setLogLevel('debug');

  // #region START_COLLECT_FILES — invariant: --staged → git diff + ls-files; otherwise resolveTargets
  let files: string[];
  const resolutionErrors: LintError[] = [];

  if (staged) {
    if (positional.length > 0) {
      const error: LintError = {
        file: '',
        line: 0,
        col: 0,
        severity: 'error',
        code: ERR_CLI_LINT_STAGED_CONFLICT,
        message:
          '--staged and positional targets are mutually exclusive. Use either --staged or provide file/directory paths, not both.',
      };
      logger.warn('[LintCommand#run] --staged and positional targets are mutually exclusive');
      return new LintReport([error]);
    }

    logger.debug('[LintCommand#run] [idle → collecting] staged mode');
    try {
      const stagedOut = execSync('git diff --staged --name-only', { encoding: 'utf-8' }).trim();
      const untrackedOut = execSync('git ls-files --others --exclude-standard', {
        encoding: 'utf-8',
      }).trim();
      files = [...stagedOut.split('\n'), ...untrackedOut.split('\n')]
        .filter(Boolean)
        .filter((f) => f.endsWith('.ts'));
      files = [...new Set(files)];
    } catch (cause) {
      const error = new Error('[LintCommand#run] Git scan failed — not a git repository?', {
        cause,
      });
      logger.error('[LintCommand#run] [collecting → failed]', { error });
      throw error;
    }
  } else if (positional.length > 0) {
    logger.debug(`[LintCommand#run] [idle → resolving] ${positional.length} target(s)`);
    const result = resolveTargets(positional);
    files = result.files;
    resolutionErrors.push(...result.errors);
    for (const re of result.errors) {
      logger.warn(`[LintCommand#run] [resolving → failed] ${re.file}: ${re.message}`);
    }
  } else {
    files = [];
  }
  // #endregion END_COLLECT_FILES

  if (files.length === 0) {
    logger.debug('[LintCommand#run] [collecting → done] no files to lint');
    return new LintReport(resolutionErrors);
  }

  logger.debug(`[LintCommand#run] [collecting → linting] ${files.length} file(s)`);

  const allErrors: LintError[] = [...resolutionErrors];
  let totalAutoFixed = 0;

  // #region START_RESOLVE_REFERENCES — invariant: load taskRefMap once, collect task IDs from headers
  const projectRoot = resolve('.');
  const taskRefMap = loadTaskReferences(projectRoot);
  const foundTaskIds = new Set<string>();
  // #endregion END_RESOLVE_REFERENCES

  // #region START_LINT_LOOP — invariant: single read per file, content fed to all 4 checks
  for (const filePath of files) {
    const absPath = resolve(filePath);

    let content: string;
    try {
      logger.debug(`[LintCommand#run] [linting → reading] ${filePath}`);
      content = readFileSync(absPath, 'utf-8');
    } catch (cause) {
      const error = new Error(`[LintCommand#run] Cannot read file: ${filePath}`, { cause });
      logger.error(`[LintCommand#run] [reading → failed] ${filePath}`, { error });
      continue;
    }

    allErrors.push(...checkFileHeader(content, filePath));
    allErrors.push(...checkAnchors(content, filePath));
    allErrors.push(...checkLanguage(content, filePath));
    allErrors.push(...checkDisables(content, filePath));

    // Extract task IDs from file header for reference resolution
    const taskIds = extractTaskIdsFromHeader(content);
    for (const tid of taskIds) {
      foundTaskIds.add(tid);
    }

    const dbcResult = await checkDbcContracts(content, filePath, autofix);
    allErrors.push(...dbcResult.errors);
    totalAutoFixed += dbcResult.autoFixed;
  }
  // #endregion END_LINT_LOOP

  // #region START_RESOLVE_REFS_OUTPUT — invariant: resolve references from collected task IDs
  const { taskPaths, specPaths } = resolveReferencesForTasks([...foundTaskIds], taskRefMap);
  const report = new LintReport(allErrors, totalAutoFixed, taskPaths, specPaths);
  // #endregion END_RESOLVE_REFS_OUTPUT

  // #region START_OUTPUT — invariant: ESLint format when errors present
  if (report.exitCode === 1) {
    console.log(`[LintCommand#run] [linting → failed] ${allErrors.length} error(s)`);
  } else {
    console.log('[LintCommand#run] [linting → clean] no errors');
  }
  // #endregion END_OUTPUT

  return report;
}

// #region START_RESOLVE_TARGETS — invariant: recursive dir walk, filter .ts/.tsx, dedup, sort, exclude system dirs, skip symlinks
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx'];
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build', 'out', '__tests__']);

export function resolveTargets(targets: string[]): { files: string[]; errors: LintError[] } {
  logger.debug(`[resolveTargets] [idle → resolving] ${targets.length} target(s)`);
  const fileSet = new Set<string>();
  const errors: LintError[] = [];

  for (const target of targets) {
    const ext = extname(target).toLowerCase();
    if (ext && !SUPPORTED_EXTENSIONS.includes(ext) && !target.endsWith('/')) {
      // skip non-ts/tsx file extensions silently (e.g. readme.md, notes.txt)
      continue;
    }

    let stat;
    try {
      stat = lstatSync(target);
    } catch (cause: unknown) {
      const err = cause as NodeJS.ErrnoException;
      errors.push({
        file: target,
        line: 0,
        col: 0,
        severity: 'error',
        code: ERR_CLI_LINT_RESOLVE_FAILED,
        message: `${target}: ${err.code ?? 'UNKNOWN'}: ${err.message}`,
      });
      continue;
    }

    if (stat.isSymbolicLink()) {
      continue;
    }

    const absTarget = resolve(target);

    if (stat.isDirectory()) {
      walkDir(absTarget, fileSet);
    } else if (stat.isFile()) {
      const ext = extname(target).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        fileSet.add(absTarget);
      }
    }
  }

  const files = [...fileSet].sort();
  logger.debug(
    `[resolveTargets] [resolving → resolved] ${files.length} file(s), ${errors.length} error(s)`
  );
  return { files, errors };
}

// #region START_WALK_DIR — invariant: recursive, lstat, skip hidden/system dirs, filter by SUPPORTED_EXTENSIONS
function walkDir(dir: string, fileSet: Set<string>): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.name.startsWith('.')) {
      continue;
    }
    if (EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      walkDir(fullPath, fileSet);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        fileSet.add(fullPath);
      }
    }
  }
}
// #endregion END_WALK_DIR
// #endregion END_RESOLVE_TARGETS

// Self-executing for CLI: gennady lint <args>
const report = await run(process.argv);
if (report.exitCode === 1) console.log(report.format());
process.exit(report.exitCode);
