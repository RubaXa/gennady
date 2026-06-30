// @file: SddExtractCommand — CLI entry for gennady sdd-extract: read a file, slice one <!--SECTION:NAME--> block.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { extractSection, isValidSectionName } from '../../../shared/sdd/section.ts';
import {
  badInvocation,
  fileNotFound,
  fileNotReadable,
  invalidName,
  toOutcome,
  type ExtractOutcome,
} from './sdd-extract.types.ts';

/**
 * @purpose Execute gennady sdd-extract — resolve <file> <NAME>, read the file, return the named section or an actionable failure.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns ExtractOutcome — content on success, else a diagnostic with the matching exit code.
 */
export async function run(rawArgs: string[]): Promise<ExtractOutcome> {
  const args = parseArgs(rawArgs, {});
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-extract'
  );

  if (positional.length !== 2) {
    logger.warn(`[SddExtractCommand#run] bad invocation — ${positional.length} positional arg(s), expected 2`);
    return badInvocation();
  }

  const [file, name] = positional as [string, string];

  if (!isValidSectionName(name)) {
    logger.warn(`[SddExtractCommand#run] invalid section name: ${name}`);
    return invalidName(name);
  }

  // #region START_READ — invariant: distinguish ENOENT (not found) from other read failures
  let content: string;
  try {
    logger.debug(`[SddExtractCommand#run] [idle → reading] ${file}`);
    content = readFileSync(resolve(file), 'utf-8');
  } catch (cause) {
    const err = cause as NodeJS.ErrnoException;
    logger.warn(`[SddExtractCommand#run] [reading → failed] ${file}: ${err.code ?? 'UNKNOWN'}`);
    return err.code === 'ENOENT' ? fileNotFound(file) : fileNotReadable(file);
  }
  // #endregion END_READ

  const result = extractSection(content, name);
  logger.debug(`[SddExtractCommand#run] [reading → ${result.status}] section ${name}`);
  return toOutcome(file, name, result);
}

// Self-executing for CLI: gennady sdd-extract <file> <NAME>
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.content : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
