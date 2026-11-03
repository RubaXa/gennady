// @file: DBC contract validation adapter — bridges DbcTsLinter into the lint command pipeline.
// @spec: CLI-LINT
// @consumers: LintCommand

import { logger } from '#logger';
import { DbcJsDocParser } from '../../../../services/dbc/parser/implementations/jsdoc/dbc-jsdoc-parser.ts';
import { DbcTsLinter } from '../../../../services/dbc/linter/implementations/ts/dbc-ts-linter.ts';
import { DbcTsAstAdapter } from '../../../../services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts';
import type { LintError } from '../lint.types.ts';
import { findFileLintDisable } from './utils/file-lint-disable.ts';

/**
 * @purpose Adapts DbcTsLinter result into the lint pipeline — translates DbcLintError → LintError.
 * @implements {DbcContractCheck} in specs/cli/lint/lint.spec.md
 * @invariant When autofix=false, calls lint(); when autofix=true, calls lintAndFix() with disk mutation.
 * @invariant An authorized file-level `gennady-lint-disable` returns no errors and never autofixes.
 * @param content Pre-read source text — avoids redundant fs.read.
 * @param filePath Path to the source file for error reporting.
 * @param autofix When true, auto-fixes are applied to the file on disk via DbcTsLinter.
 * @param [fileDisableAuthorized] Permission resolved by the caller from the canonical accepted decision.
 * @throws {Error} Wraps unexpected linter failure with cause-chain.
 * @returns Object with translated LintError[] and autoFixed count.
 * @sideEffect When autofix=true, mutates the source file on disk through DbcTsLinter.
 */
export async function check(
  content: string,
  filePath: string,
  autofix: boolean,
  fileDisableAuthorized = false
): Promise<{ errors: LintError[]; autoFixed: number }> {
  logger.debug(`[DbcContractCheck#check] [idle → creating] ${filePath}`);

  // An authorized file-level exemption marker (`<ACR>-DL-N` + reason) exempts the whole file from DbC.
  if (fileDisableAuthorized && findFileLintDisable(content) !== null) {
    logger.info(`[DbcContractCheck#check] [idle → exempt] ${filePath} (gennady-lint-disable)`);
    const syntax = await new DbcTsAstAdapter().parseExportNames(filePath, content);
    return syntax.ok
      ? { errors: [], autoFixed: 0 }
      : {
          errors: [
            {
              file: filePath,
              line: 1,
              col: 1,
              severity: 'error',
              code: 'ERR_DBC_LINT_PARSE_FAILED',
              message: syntax.error,
            },
          ],
          autoFixed: 0,
        };
  }

  const parser = new DbcJsDocParser();
  const astAdapter = new DbcTsAstAdapter();
  const linter = new DbcTsLinter(parser, astAdapter);

  // #region START_LINT_OR_FIX — invariant: autofix=false → lint(), autofix=true → lintAndFix() with disk mutation
  try {
    if (!autofix) {
      const report = await linter.lint(filePath, { content });
      logger.info(
        `[DbcContractCheck#check] [creating → linted] ${filePath} (${report.errors.length} errors)`
      );
      return { errors: report.errors.map(translateDbcLintErrorToLintError), autoFixed: 0 };
    }

    const fixReport = await linter.lintAndFix(filePath, { content });
    logger.info(
      `[DbcContractCheck#check] [creating → fixed] ${filePath} (autoFixed=${fixReport.autoFixed}, remaining=${fixReport.errors.length})`
    );
    return {
      errors: fixReport.errors.map(translateDbcLintErrorToLintError),
      autoFixed: fixReport.autoFixed,
    };
    // #endregion END_LINT_OR_FIX
  } catch (cause) {
    const error = new Error(`[DbcContractCheck#check] Lint failed for ${filePath}`, { cause });
    logger.error(`[DbcContractCheck#check] [creating → failed] ${filePath}`, { error });
    throw error;
  }
}

/**
 * @purpose Translates DbcLintError to LintError — shape-compatible pass-through mapping every field.
 * @param error DbcLintError received from DbcTsLinter.
 * @returns LintError with identical field values.
 */
function translateDbcLintErrorToLintError(error: {
  file: string;
  line: number;
  col: number;
  severity: 'error';
  code: string;
  message: string;
}): LintError {
  return {
    file: error.file,
    line: error.line,
    col: error.col,
    severity: 'error',
    code: error.code,
    message: error.message,
  };
}
