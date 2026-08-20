// @file: SddExtractCommand — CLI entry for gennady sdd-extract: read a file, slice one <!--SECTION:NAME--> block.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  extractSection,
  extractHeadingSection,
  isValidSectionName,
  isHeadingAnchor,
  headingSlug,
} from '../../../shared/sdd/section.ts';
import {
  badInvocation,
  fileNotFound,
  fileNotReadable,
  invalidName,
  toOutcome,
  toHeadingOutcome,
  type ExtractOutcome,
} from './sdd-extract.types.ts';

/**
 * @purpose Every `<!--SECTION:X-->` name plus every heading's slug present in `content` — candidate
 * anchors for a not_found suggestion.
 * @param content Full file markdown.
 * @returns Section names and heading slugs, in document order (may repeat).
 */
function listAnchors(content: string): string[] {
  const sections = [...content.matchAll(/<!--SECTION:([A-Z][A-Z0-9_]*)-->/g)].map(
    (m) => m[1] as string
  );
  const headings = [...content.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)].map((m) =>
    headingSlug(m[1] as string)
  );
  return [...sections, ...headings];
}

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

  // Two forms: `<file> <NAME>` (unchanged), and `<file>#<ANCHOR>` combined into the sole positional —
  // the shape a read-manifest actually prints (e.g. `./infra-base.spec.md#BOOTSTRAP_REQUIREMENTS`).
  let file: string;
  let rawName: string;
  if (positional.length === 2) {
    [file, rawName] = positional as [string, string];
  } else if (positional.length === 1 && (positional[0] as string).includes('#')) {
    const combined = positional[0] as string;
    const hashAt = combined.lastIndexOf('#');
    file = combined.slice(0, hashAt);
    rawName = combined.slice(hashAt + 1);
  } else {
    logger.warn(
      `[SddExtractCommand#run] bad invocation — ${positional.length} positional arg(s), expected 2 (or 1 combined "<file>#<NAME>")`
    );
    return badInvocation();
  }

  // A leading `#` on the anchor argument (either combined-form remainder, or a bare `#ANCHOR` second
  // argument) is just the manifest's own anchor-link syntax — strip it before grammar-matching either
  // the canonical <!--SECTION:NAME--> form or a markdown heading slug.
  const name = rawName.startsWith('#') ? rawName.slice(1) : rawName;
  const isHeading = isHeadingAnchor(name);

  if (!isValidSectionName(name) && !isHeading) {
    logger.warn(`[SddExtractCommand#run] invalid section name: ${rawName}`);
    return invalidName(rawName);
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

  // A markdown heading anchor (`#lower-dashed` or bare) is tried only when the canonical
  // `<!--SECTION--> grammar doesn't match — the two grammars are disjoint (upper vs lower).
  if (isHeading && !isValidSectionName(name)) {
    const result = extractHeadingSection(content, name);
    logger.debug(`[SddExtractCommand#run] [reading → ${result.status}] heading ${name}`);
    return toHeadingOutcome(file, name, result);
  }

  const result = extractSection(content, name);
  if (result.status === 'not_found') {
    logger.debug(`[SddExtractCommand#run] [reading → not_found] section ${name}`);
    return toOutcome(file, name, result, listAnchors(content));
  }
  logger.debug(`[SddExtractCommand#run] [reading → ${result.status}] section ${name}`);
  return toOutcome(file, name, result);
}

// Self-executing for CLI: gennady sdd-extract <file> <NAME>
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.content : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
