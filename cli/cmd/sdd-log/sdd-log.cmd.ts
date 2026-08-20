// @file: SddLogCommand — CLI entry for gennady sdd-log: append-only round/line/close/phase/handoff/blocker into EXECUTION_LOG.
// @consumers: gennady.ts
// @tasks: N/A

import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { findSectionBounds } from '../../../shared/sdd/section.ts';
import { resolveTicketArg, resolutionLine } from '../../../shared/sdd/ticket-resolve.ts';
import {
  ambiguousIdError,
  badInvocation,
  buildBlockerBlock,
  buildCloseBlock,
  buildEventLine,
  buildHandoffLine,
  buildPhaseHeader,
  buildRoundHeader,
  fileError,
  hasPlaceholder,
  missingFlag,
  nextRoundNumber,
  noLogSection,
  placeholderError,
  unknownIdError,
  type LogOutcome,
} from './sdd-log.types.ts';

const LOG_SECTION = 'EXECUTION_LOG';
const MODES = ['round', 'line', 'close', 'phase', 'handoff', 'blocker'] as const;

/**
 * @purpose Execute gennady sdd-log — append a round header, event/handoff line, phase header, blocker block,
 *   or close block into EXECUTION_LOG, append-only.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param now Clock injected for deterministic timestamps (the CLI tail passes the real now).
 * @returns LogOutcome — echo of the appended lines on success, else an actionable failure.
 */
export async function run(rawArgs: string[], now: Date): Promise<LogOutcome> {
  const args = parseArgs(rawArgs, {
    axiom: { aliases: ['axiom'], takesValue: true },
    unblock: { aliases: ['unblock'], takesValue: true },
  });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-log'
  );

  const ticket = positional[0];
  const mode = positional[1] as (typeof MODES)[number] | undefined;
  const payload = positional.slice(2).join(' ');

  if (!ticket) return badInvocation('missing <ticket>');
  if (!mode || !MODES.includes(mode)) {
    return badInvocation(`unknown mode "${mode ?? ''}" — use ${MODES.join(' | ')}`);
  }
  if (
    (mode === 'round' ||
      mode === 'line' ||
      mode === 'phase' ||
      mode === 'handoff' ||
      mode === 'blocker') &&
    payload.trim() === ''
  ) {
    return badInvocation(`mode "${mode}" needs content`);
  }
  if (mode === 'blocker') {
    const axiom = args.axiom as string | undefined;
    const unblock = args.unblock as string | undefined;
    if (!axiom) return missingFlag('missing --axiom <AX_NAME>');
    if (!unblock) return missingFlag('missing --unblock "<action>"');
  }

  // #region START_READ — invariant: path or Task-ID (AX_TASK_RESOLUTION) → resolved path + content
  const root = resolve('.');
  const resolved = resolveTicketArg(ticket, root);
  if (!resolved.ok) {
    if (resolved.reason === 'unreadable') return fileError(ticket);
    if (resolved.reason === 'unknown-id') return unknownIdError(ticket, resolved.refs);
    return ambiguousIdError(ticket, resolved.matches, root);
  }
  const abs = resolved.path;
  const content = resolved.content;
  const idBanner =
    resolved.resolvedFrom === 'id'
      ? resolutionLine('sdd-log', resolved.id, resolved.path, root)
      : null;
  // Every subsequent diagnostic names the real, resolved path — copy-pasteable even when the
  // caller passed a bare Task-ID.
  const displayPath = resolved.resolvedFrom === 'id' ? relative(root, abs) || abs : ticket;
  // #endregion END_READ

  const bounds = findSectionBounds(content, LOG_SECTION);
  if (!bounds) return noLogSection(displayPath);

  const ts = now.toISOString();
  const date = ts.slice(0, 10);

  // #region START_BUILD — invariant: content carrying <ts>/reason must carry no unreplaced placeholder;
  //   verbatim modes (phase/handoff/blocker) pass content through byte-exact — no escaping, no encoding.
  let insertText: string;
  if (mode === 'round') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildRoundHeader(nextRoundNumber(content), date, payload);
  } else if (mode === 'line') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildEventLine(payload, ts);
  } else if (mode === 'phase') {
    const phaseId = positional[2];
    const suffix = positional.slice(3).join(' ') || undefined;
    if (hasPlaceholder(phaseId) || (suffix && hasPlaceholder(suffix))) {
      return placeholderError(payload);
    }
    insertText = buildPhaseHeader(phaseId, suffix);
  } else if (mode === 'handoff') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildHandoffLine(payload);
  } else if (mode === 'blocker') {
    const axiom = args.axiom as string;
    const unblock = args.unblock as string;
    if (hasPlaceholder(payload) || hasPlaceholder(axiom) || hasPlaceholder(unblock)) {
      return placeholderError(payload);
    }
    insertText = buildBlockerBlock(payload, axiom, unblock, ts);
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
    return fileError(displayPath);
  }
  // #endregion END_APPEND

  logger.debug(`[SddLogCommand#run] appended ${mode} to ${LOG_SECTION} of ${ticket}`);
  const body = `[sdd-log] appended to ${LOG_SECTION}:\n${insertText.trim()}`;
  return { ok: true, text: idBanner ? `${idBanner}\n${body}` : body };
}

// Self-executing for CLI: gennady sdd-log <ticket> <mode> [content] — see MODES above.
const outcome = await run(process.argv, new Date());
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
