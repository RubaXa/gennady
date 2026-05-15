// @file: LintCommand — CLI entry point for gennady lint: parseArgs, git scan, single read, 3 checks, ESLint output.
// @consumers: gennady.ts
// @tasks: TSK-16

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { check as checkFileHeader } from './checks/file-header.check.ts';
import { check as checkAnchors } from './checks/anchor.check.ts';
import { check as checkDbcContracts } from './checks/dbc-contract.check.ts';
import { LintReport } from './lint.types.ts';
import type { LintError } from './lint.types.ts';

/**
 * @purpose Execute the gennady lint command — collect files, run 3 checks, output ESLint-format report.
 * @implements {LintCommand} in specs/cli/lint/lint.spec.md
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns LintReport with aggregated errors and exit code.
 */
export async function run(rawArgs: string[]): Promise<LintReport> {
  const args = parseArgs(rawArgs, {
    autofix: ['autofix'],
    staged: ['staged'],
  });

  // parseArgs does its own .slice(2); args._ may include command name — filter by .ts extension
  const positional = (args._ as string[]).filter((f) => f.endsWith('.ts'));

  const autofix = args.autofix === true || args.autofix === 'true';
  const staged = args.staged === true || args.staged === 'true';

  // #region START_COLLECT_FILES — invariant: --staged → git diff + ls-files; otherwise positional args
  let files: string[];

  if (staged) {
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
      const error = new Error('[LintCommand#run] Git scan failed — not a git repository?', { cause });
      logger.error('[LintCommand#run] [collecting → failed]', { error });
      throw error;
    }
  } else {
    files = positional;
  }
  // #endregion END_COLLECT_FILES

  if (files.length === 0) {
    logger.debug('[LintCommand#run] [collecting → done] no files to lint');
    return new LintReport([]);
  }

  logger.debug(`[LintCommand#run] [collecting → linting] ${files.length} file(s)`);

  const allErrors: LintError[] = [];
  let totalAutoFixed = 0;

  // #region START_LINT_LOOP — invariant: single read per file, content fed to all 3 checks
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

    const dbcResult = await checkDbcContracts(content, filePath, autofix);
    allErrors.push(...dbcResult.errors);
    totalAutoFixed += dbcResult.autoFixed;
  }
  // #endregion END_LINT_LOOP

  const report = new LintReport(allErrors, totalAutoFixed);

  // #region START_OUTPUT — invariant: ESLint format when errors present
  if (report.exitCode === 1) {
    logger.info(`[LintCommand#run] [linting → failed] ${allErrors.length} error(s)`);
  } else {
    logger.info('[LintCommand#run] [linting → clean] no errors');
  }
  // #endregion END_OUTPUT

  return report;
}

// Self-executing for CLI: gennady lint <args>
const report = await run(process.argv);
if (report.exitCode === 1) console.log(report.format());
process.exit(report.exitCode);
