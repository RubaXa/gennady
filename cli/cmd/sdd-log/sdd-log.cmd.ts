// @file: SddLogCommand — CLI entry for gennady sdd-log: append-only round/line/close/phase/handoff/blocker/resolved into EXECUTION_LOG.
// @consumers: gennady.ts
// @tasks: N/A

import { relative, resolve } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  readScratchPayloadFile,
  type ScratchPayload,
} from '../../../shared/common/scratch-payload-file.ts';
import { findSectionBounds } from '../../../shared/sdd/section.ts';
import { resolveTicketArg, resolutionLine } from '../../../shared/sdd/ticket-resolve.ts';
import { writeProvenRepoFile } from '../../../shared/common/repo-file-identity.ts';
import {
  ambiguousIdError,
  badInvocation,
  buildBlockerBlock,
  buildCloseBlock,
  buildEventLine,
  buildHandoffLine,
  buildPhaseHeader,
  buildResolvedLine,
  buildRoundHeader,
  fileError,
  findPhaseBlockBounds,
  hasPlaceholder,
  missingFlag,
  nextRoundNumber,
  noLogSection,
  phaseNotOpenError,
  payloadFileError,
  placeholderError,
  setMetaStatus,
  unknownIdError,
  type LogOutcome,
} from './sdd-log.types.ts';

const LOG_SECTION = 'EXECUTION_LOG';
const MODES = ['round', 'line', 'close', 'phase', 'handoff', 'blocker', 'resolved'] as const;
const PHASE_ID_RE = /^P[0-9]+$/;
const AXIOM_ID_RE = /^AX_[A-Z0-9_]+$/;

type BlockerPayload = { reason: string; axiom: string; unblock: string };

function oneFlag(value: unknown, name: string): string | undefined | LogOutcome {
  if (Array.isArray(value)) return badInvocation(`--${name} must appear exactly once`);
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return badInvocation(`--${name} needs a value`);
  return value;
}

function parseBlockerPayload(content: string): BlockerPayload | { error: LogOutcome } {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { error: payloadFileError('blocker payload must be valid JSON') };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: payloadFileError('blocker payload must be one JSON object') };
  }
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'axiom,reason,unblock') {
    return {
      error: payloadFileError('blocker payload keys must be exactly: reason, axiom, unblock'),
    };
  }
  if (
    typeof record.reason !== 'string' ||
    record.reason.trim() === '' ||
    /[\r\n]/.test(record.reason) ||
    typeof record.axiom !== 'string' ||
    !AXIOM_ID_RE.test(record.axiom) ||
    typeof record.unblock !== 'string' ||
    record.unblock.trim() === '' ||
    /[\r\n]/.test(record.unblock)
  ) {
    return {
      error: payloadFileError(
        'blocker reason/unblock must be non-empty single-line strings and axiom must match AX_[A-Z0-9_]+'
      ),
    };
  }
  return { reason: record.reason, axiom: record.axiom, unblock: record.unblock };
}

/**
 * @purpose Execute gennady sdd-log — append a round header, event/handoff line, phase header,
 *   blocker block, its paired resolved line, or close block into EXECUTION_LOG, append-only.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param now Clock injected for deterministic timestamps (the CLI tail passes the real now).
 * @param [projectRoot] Canonical ticket-resolution root; defaults to cwd.
 * @returns LogOutcome — echo of the appended lines on success, else an actionable failure.
 */
export async function run(
  rawArgs: string[],
  now: Date,
  projectRoot = resolve('.')
): Promise<LogOutcome> {
  let args;
  try {
    args = parseArgs(
      rawArgs,
      {
        axiom: { aliases: ['axiom'], takesValue: true },
        unblock: { aliases: ['unblock'], takesValue: true },
        phase: { aliases: ['phase'], takesValue: true },
        contentFile: { aliases: ['content-file'], takesValue: true },
        payloadFile: { aliases: ['payload-file'], takesValue: true },
      },
      { strict: true }
    );
  } catch (cause) {
    return badInvocation((cause as Error).message);
  }
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-log'
  );

  const ticket = positional[0];
  const mode = positional[1] as (typeof MODES)[number] | undefined;
  if (!ticket) return badInvocation('missing <ticket>');
  if (!mode || !MODES.includes(mode)) {
    return badInvocation(`unknown mode "${mode ?? ''}" — use ${MODES.join(' | ')}`);
  }
  const root = resolve(projectRoot);
  const inlinePayload = positional.slice(mode === 'phase' ? 3 : 2).join(' ');
  const contentFile = oneFlag(args.contentFile, 'content-file');
  if (typeof contentFile === 'object') return contentFile;
  const blockerFile = oneFlag(args.payloadFile, 'payload-file');
  if (typeof blockerFile === 'object') return blockerFile;
  const axiomFlag = oneFlag(args.axiom, 'axiom');
  if (typeof axiomFlag === 'object') return axiomFlag;
  const unblockFlag = oneFlag(args.unblock, 'unblock');
  if (typeof unblockFlag === 'object') return unblockFlag;
  const phaseFlagValue = oneFlag(args.phase, 'phase');
  if (typeof phaseFlagValue === 'object') return phaseFlagValue;

  if (contentFile && blockerFile) {
    return badInvocation('--content-file and --payload-file are mutually exclusive');
  }
  if (blockerFile && mode !== 'blocker') {
    return badInvocation('--payload-file applies only to blocker mode');
  }
  if (mode !== 'blocker' && (axiomFlag || unblockFlag)) {
    return badInvocation('--axiom and --unblock apply only to blocker mode');
  }
  if (contentFile && (mode === 'close' || mode === 'blocker')) {
    return badInvocation(`--content-file does not apply to mode "${mode}"`);
  }
  if (contentFile && inlinePayload.trim() !== '') {
    return badInvocation('inline content and --content-file are mutually exclusive');
  }
  if (mode === 'close' && inlinePayload.trim() !== '') {
    return badInvocation('close mode takes no content');
  }

  let scratch: ScratchPayload | undefined;
  let payload = inlinePayload;
  if (contentFile || blockerFile) {
    const read = readScratchPayloadFile(root, contentFile ?? blockerFile ?? '');
    if (!read.ok) return payloadFileError(read.detail);
    scratch = read.payload;
    if (contentFile) payload = scratch.content;
  }

  if (
    (mode === 'round' ||
      mode === 'line' ||
      mode === 'handoff' ||
      mode === 'blocker' ||
      mode === 'resolved') &&
    payload.trim() === '' &&
    !blockerFile
  ) {
    return badInvocation(`mode "${mode}" needs content`);
  }
  if (mode === 'blocker') {
    if (blockerFile && (inlinePayload.trim() !== '' || axiomFlag || unblockFlag)) {
      return badInvocation('blocker --payload-file cannot be combined with inline fields');
    }
    if (!blockerFile && !axiomFlag) return missingFlag('missing --axiom <AX_NAME>');
    if (!blockerFile && !unblockFlag) return missingFlag('missing --unblock "<action>"');
    if (!blockerFile && !AXIOM_ID_RE.test(axiomFlag ?? '')) {
      return badInvocation('--axiom must match AX_[A-Z0-9_]+');
    }
  }
  // #region START_PHASE_FLAG — invariant: --phase only makes sense on a mode that logs INTO an
  // already-open phase block; round/close are ticket-wide events, and `phase` mode already takes
  // the phase id as its own positional.
  const phaseFlag = phaseFlagValue;
  if ((mode === 'blocker' || mode === 'resolved') && phaseFlag === undefined) {
    return missingFlag(
      `mode "${mode}" requires --phase <PhaseID> so the blocker lifecycle stays phase-owned`
    );
  }
  if (phaseFlag !== undefined) {
    if (mode !== 'line' && mode !== 'handoff' && mode !== 'blocker' && mode !== 'resolved') {
      return badInvocation(
        `--phase only applies to line | handoff | blocker | resolved (not "${mode}")`
      );
    }
    if (hasPlaceholder(phaseFlag)) return placeholderError(phaseFlag);
    if (!PHASE_ID_RE.test(phaseFlag)) return badInvocation('--phase must match P<digits>');
  }
  // #endregion END_PHASE_FLAG

  // #region START_READ — invariant: path or Task-ID (AX_TASK_RESOLUTION) → resolved path + content
  const resolved = resolveTicketArg(ticket, root);
  if (!resolved.ok) {
    if (resolved.reason === 'unreadable') return fileError(ticket);
    if (resolved.reason === 'unsafe-path' || resolved.reason === 'unsafe-corpus') {
      return fileError(`${ticket} (${resolved.detail})`);
    }
    if (resolved.reason === 'unknown-id') return unknownIdError(ticket, resolved.refs);
    if (resolved.reason === 'ambiguous-id') return ambiguousIdError(ticket, resolved.matches, root);
    return fileError(ticket);
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

  // #region START_PHASE_INSERT_POINT — invariant: --phase redirects the append target from
  // "end of EXECUTION_LOG" to "end of that phase's own #### <PhaseID> block". Phase attribution is
  // explicit even though phases execute sequentially: re-runs can leave several historical blocks.
  let insertLine = bounds.closeLine;
  if (phaseFlag !== undefined) {
    const lookup = findPhaseBlockBounds(content, bounds, phaseFlag);
    if (!lookup.found) return phaseNotOpenError(displayPath, phaseFlag, lookup.openPhases);
    insertLine = lookup.insertLine;
  }
  // #endregion END_PHASE_INSERT_POINT

  const ts = now.toISOString();
  const date = ts.slice(0, 10);

  // #region START_BUILD — invariant: content carrying <ts>/reason must carry no unreplaced placeholder;
  //   verbatim modes (phase/handoff/blocker/resolved) pass content through byte-exact — no escaping, no encoding.
  let insertText: string;
  if (mode === 'round') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildRoundHeader(nextRoundNumber(content), date, payload);
  } else if (mode === 'line') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildEventLine(payload, ts);
  } else if (mode === 'phase') {
    const phaseId = positional[2];
    if (!phaseId) return badInvocation('phase id must match P<digits>');
    if (hasPlaceholder(phaseId)) return placeholderError(phaseId);
    if (!PHASE_ID_RE.test(phaseId)) return badInvocation('phase id must match P<digits>');
    const suffix = payload || undefined;
    if (suffix && hasPlaceholder(suffix)) {
      return placeholderError(payload);
    }
    insertText = buildPhaseHeader(phaseId, suffix);
  } else if (mode === 'handoff') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildHandoffLine(payload);
  } else if (mode === 'blocker') {
    let reason = payload;
    let axiom = axiomFlag ?? '';
    let unblock = unblockFlag ?? '';
    if (scratch) {
      const parsed = parseBlockerPayload(scratch.content);
      if ('error' in parsed) return parsed.error;
      ({ reason, axiom, unblock } = parsed);
    }
    if (hasPlaceholder(reason) || hasPlaceholder(axiom) || hasPlaceholder(unblock)) {
      return placeholderError(payload);
    }
    insertText = buildBlockerBlock(reason, axiom, unblock, ts);
  } else if (mode === 'resolved') {
    if (hasPlaceholder(payload)) return placeholderError(payload);
    insertText = buildResolvedLine(payload, ts);
  } else {
    insertText = buildCloseBlock(ts);
  }
  // #endregion END_BUILD

  // #region START_META_STATUS — invariant: round/close also drive Meta Status; tolerant of old
  // tickets with no META/Status line (setMetaStatus leaves content untouched, changed: false).
  // Rewriting in place never changes the line count, so `bounds` (computed above) stays valid.
  let workingContent = content;
  let metaStatusNote = '';
  if (mode === 'round') {
    const result = setMetaStatus(workingContent, '[~] IN_PROGRESS');
    workingContent = result.content;
    metaStatusNote = result.changed
      ? '\n[sdd-log] status → IN_PROGRESS'
      : '\n[sdd-log] META/Status не найден — статус не обновлён.';
  } else if (mode === 'close') {
    const result = setMetaStatus(workingContent, '[x] DONE');
    workingContent = result.content;
    metaStatusNote = result.changed
      ? '\n[sdd-log] status → DONE'
      : '\n[sdd-log] META/Status не найден — статус не обновлён.';
  }
  // #endregion END_META_STATUS

  // #region START_APPEND — invariant: insert strictly before the close marker (append-only), or
  // before the requested phase's own next heading when --phase redirected the target (insertLine).
  const lines = workingContent.split('\n');
  lines.splice(insertLine, 0, ...insertText.split('\n'));
  const written = writeProvenRepoFile(resolved.identity, lines.join('\n'));
  if (!written.ok) {
    return fileError(displayPath);
  }
  const cleanupFailure = scratch?.consume() ?? null;
  // #endregion END_APPEND

  logger.debug(`[SddLogCommand#run] appended ${mode} to ${LOG_SECTION} of ${ticket}`);
  const cleanupNote = cleanupFailure
    ? `\n[sdd-log] payload was applied but cleanup failed: ${cleanupFailure}\n  next: remove that exact scratch file before handoff.`
    : '';
  const body = `[sdd-log] appended to ${LOG_SECTION}:\n${insertText.trim()}${metaStatusNote}${cleanupNote}`;
  return { ok: true, text: idBanner ? `${idBanner}\n${body}` : body };
}

// Self-executing for CLI: gennady sdd-log <ticket> <mode> [content] — see MODES above.
const outcome = await run(process.argv, new Date());
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
