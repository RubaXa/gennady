// @file: File header validation — checks for @file: and @consumers: directives before first import.
// @consumers: LintCommand
// @tasks: TSK-13

import type { LintError } from '../lint.types.ts';
import { ERR_CLI_LINT_MISSING_CONSUMERS, ERR_CLI_LINT_MISSING_FILE } from '../lint.types.ts';

/**
 * @purpose Validate presence of // @file: and // @consumers: directives at file top before first import.
 * @implements {FileHeaderCheck} in specs/cli/lint/lint.spec.md
 * @invariant Scans only lines before the first import statement; tags after import are ignored.
 * @param content Raw file content as string.
 * @param filePath Path to the file for error reporting.
 * @returns Empty array when both directives are present.
 */
export function check(content: string, filePath: string): LintError[] {
  const errors: LintError[] = [];

  if (content.length === 0) {
    errors.push({
      file: filePath,
      line: 1,
      col: 1,
      severity: 'error',
      code: ERR_CLI_LINT_MISSING_FILE,
      message: '[FileHeaderCheck#check] Missing // @file: directive',
    });
    errors.push({
      file: filePath,
      line: 1,
      col: 1,
      severity: 'error',
      code: ERR_CLI_LINT_MISSING_CONSUMERS,
      message: '[FileHeaderCheck#check] Missing // @consumers: directive',
    });
    return errors;
  }

  const lines = content.split('\n');
  let hasFileTag = false;
  let hasConsumersTag = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('import ')) {
      break;
    }

    if (trimmed.startsWith('// @file:')) {
      hasFileTag = true;
    }
    if (trimmed.startsWith('// @consumers:')) {
      hasConsumersTag = true;
    }

    if (hasFileTag && hasConsumersTag) {
      break;
    }
  }

  if (!hasFileTag) {
    errors.push({
      file: filePath,
      line: 1,
      col: 1,
      severity: 'error',
      code: ERR_CLI_LINT_MISSING_FILE,
      message: '[FileHeaderCheck#check] Missing // @file: directive',
    });
  }

  if (!hasConsumersTag) {
    errors.push({
      file: filePath,
      line: 1,
      col: 1,
      severity: 'error',
      code: ERR_CLI_LINT_MISSING_CONSUMERS,
      message: '[FileHeaderCheck#check] Missing // @consumers: directive',
    });
  }

  return errors;
}
