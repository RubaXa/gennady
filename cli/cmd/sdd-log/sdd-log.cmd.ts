// @file: SddLogCommand — CLI entry for gennady sdd-log: append-only round/event/close line into EXECUTION_LOG.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { findSectionBounds } from '../../../shared/sdd/section.ts';
import {
  badInvocation,
  buildCloseBlock,
  buildEventLine,
  buildRoundHeader,
  fileError,
  hasPlaceholder,
  nextRoundNumber,
  noLogSection,
  placeholderError,
  type LogOutcome,
} from './sdd-log.types.ts';

const LOG_SECTION = 'EXECUTION_LOG';

/**
 * @purpose Execute gennady sdd-log — append a round header, event line, or close block into EXECUTION_LOG, append-only.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param now Clock injected for deterministic timestamps (the CLI tail passes the real now).
 * @returns LogOutcome — echo of the appended lines on success, else an actionable failure.
 */
export async function run(rawArgs: string[], now: Date): Promise<LogOutcome> {
  const args = parseArgs(rawArgs, {});
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-log'
  );

  const ticket = positional[0];
  const mode = positional[1];
  const payload = positional.slice(2).join(' ');

  if (!ticket) return badInvocation('missing <ticket>');
  if (mode !== 'round' && mode !== 'line' && mode !== 'close') {
    return badInvocation(`unknown mode "${mode ?? ''}" — use round | line | close`);
  }
  if ((mode === 'round' || mode === 'line') && payload.trim() === '') {
    return badInvocation(`mode "${mode}" needs content`);
  }

  // #region START_READ — invariant: ENOENT / unreadable → file error
  const abs = resolve(ticket);
  let content: string;
  try {
    content = readFileSync(abs, 'utf-8');
  } catch {
    return fileError(ticket);
  }
  // #endregion END_READ

  const bounds = findSectionBounds(content, LOG_SECTION);
  if (!bounds) return noLogSection(ticket);

  const ts = now.toISOString();
  const date = ts.slice(0, 10);

  // #region START_BUILD — invariant: round/line content must carry no unreplaced placeholder
  let insertText: string;
  if (mode === 'round') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildRoundHeader(nextRoundNumber(content), date, payload);
  } else if (mode === 'line') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildEventLine(payload, ts);
  } else {
    insertText = buildCloseBlock(ts);
  }
  // #endregion END_BUILD

  // #region START_APPEND — invariant: insert strictly before the close marker (append-only)
  const lines = content.split('\n');
  lines.splice(bounds.closeLine, 0, ...insertText.split('\n'));
  try {
    writeFileSync(abs, lines.join('\n'), 'utf-8');
  } catch {
    return fileError(ticket);
  }
  // #endregion END_APPEND

  logger.debug(`[SddLogCommand#run] appended ${mode} to ${LOG_SECTION} of ${ticket}`);
  return { ok: true, text: `[sdd-log] appended to ${LOG_SECTION}:\n${insertText.trim()}` };
}

// Self-executing for CLI: gennady sdd-log <ticket> (round "<reason>" | line "<content>" | close)
const outcome = await run(process.argv, new Date());
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
