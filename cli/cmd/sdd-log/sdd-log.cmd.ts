// @file: SddLogCommand — append log events and atomically complete a verified phase.
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
import {
  proveRepoFile,
  readProvenRepoFile,
  writeProvenRepoFile,
} from '../../../shared/common/repo-file-identity.ts';
import { checkSpecAuthoringDraft, type Finding } from '../../../shared/sdd/check.ts';
import { normalizeSddToolFailure } from '../../../shared/sdd/tool-guidance.ts';
import {
  ambiguousIdError,
  authoringCompletionError,
  badInvocation,
  buildBlockerBlock,
  buildCloseBlock,
  buildEventLine,
  buildHandoffLine,
  buildPhaseHeader,
  buildResolvedLine,
  buildRoundHeader,
  closeCurrentRound,
  completePhase,
  completeSpecAuthoring,
  fileError,
  findPhaseBlockBounds,
  hasPlaceholder,
  isCompleteHandoffPayload,
  missingFlag,
  nextRoundNumber,
  noLogSection,
  phaseNotOpenError,
  payloadFileError,
  phaseCompletionError,
  placeholderError,
  roundCloseError,
  setMetaStatus,
  unknownIdError,
  type LogOutcome,
} from './sdd-log.types.ts';

const LOG_SECTION = 'EXECUTION_LOG';
const MODES = [
  'round',
  'line',
  'close',
  'phase',
  'handoff',
  'blocker',
  'resolved',
  'complete',
  'authoring-complete',
] as const;
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
 * @purpose Append an Execution Log event, or atomically complete one verified phase across its
 *   current-Round skeleton and Phases Overview row.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param now Clock injected for deterministic timestamps (the CLI tail passes the real now).
 * @param [projectRoot] Canonical ticket-resolution root; defaults to cwd.
 * @param [checkAuthoring] Spec-draft validator injected only for deterministic command tests.
 * @returns LogOutcome — echo of the appended lines on success, else an actionable failure.
 */
async function runCommand(
  rawArgs: string[],
  now: Date,
  projectRoot = resolve('.'),
  checkAuthoring: (file: string, content: string) => Finding[] = checkSpecAuthoringDraft
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
  if (contentFile && (mode === 'close' || mode === 'blocker' || mode === 'authoring-complete')) {
    return badInvocation(`--content-file does not apply to mode "${mode}"`);
  }
  if (contentFile && inlinePayload.trim() !== '') {
    return badInvocation('inline content and --content-file are mutually exclusive');
  }
  if (mode === 'close' && inlinePayload.trim() !== '') {
    return badInvocation('close mode takes no content');
  }
  if (mode === 'authoring-complete' && inlinePayload.trim() !== '') {
    return badInvocation('authoring-complete mode takes no content');
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
      mode === 'resolved' ||
      mode === 'complete') &&
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
  if (mode === 'complete' && phaseFlag === undefined) {
    return badInvocation('mode "complete" requires --phase <PhaseID>');
  }
  if ((mode === 'blocker' || mode === 'resolved') && phaseFlag === undefined) {
    return missingFlag(
      `mode "${mode}" requires --phase <PhaseID> so the blocker lifecycle stays phase-owned`
    );
  }
  if (phaseFlag !== undefined) {
    if (
      mode !== 'line' &&
      mode !== 'handoff' &&
      mode !== 'blocker' &&
      mode !== 'resolved' &&
      mode !== 'complete'
    ) {
      return badInvocation(
        `--phase only applies to line | handoff | blocker | resolved | complete (not "${mode}")`
      );
    }
    if (hasPlaceholder(phaseFlag)) return placeholderError(phaseFlag);
    if (!PHASE_ID_RE.test(phaseFlag)) return badInvocation('--phase must match P<digits>');
  }
  // #endregion END_PHASE_FLAG

  // #region START_AUTHORING_COMPLETE — invariant: a clean authoring check, next Decision Log id,
  // and durable receipt are all proved before one identity-preserving replacement write.
  if (mode === 'authoring-complete') {
    const proven = proveRepoFile(root, ticket);
    if (!proven.ok) return fileError(`${ticket} (${proven.detail})`);
    if (!proven.identity.relative.endsWith('.spec.md')) {
      return badInvocation('authoring-complete requires an exact *.spec.md path');
    }
    const observed = readProvenRepoFile(proven.identity);
    if (!observed.ok) return fileError(`${ticket} (${observed.detail})`);
    const findings = checkAuthoring(proven.identity.relative, observed.content);
    if (findings.length > 0) {
      const first = findings[0];
      return authoringCompletionError(
        `${findings.length} authoring hint(s) remain; first: ${first?.code ?? 'unknown'} — ${first?.message ?? 'unknown finding'}`
      );
    }
    const completed = completeSpecAuthoring(
      observed.content,
      proven.identity.relative,
      now.toISOString().slice(0, 10)
    );
    if (!completed.ok) return authoringCompletionError(completed.detail);
    const written = writeProvenRepoFile(proven.identity, completed.content);
    if (!written.ok) return fileError(`${ticket} (${written.detail})`);
    logger.debug(`[SddLogCommand#run] completed ${completed.kind} authoring in ${ticket}`);
    return {
      ok: true,
      text: `[sdd-log] ${completed.kind} authoring receipt:\n${completed.receipt}`,
    };
  }
  // #endregion END_AUTHORING_COMPLETE

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

  const ts = now.toISOString();

  // #region START_COMPLETE — invariant: receipt, current Round skeleton, typed Handoff, and overview
  // status are all proved before one replacement write; a failed or repeated call changes no bytes.
  if (mode === 'complete') {
    const completionPayload = payload.trim();
    if (hasPlaceholder(completionPayload) || !isCompleteHandoffPayload(completionPayload)) {
      return badInvocation(
        'complete payload must be exactly: artifacts: [...]; decisions: [...]; open: [...]; deviations: [...] with real values'
      );
    }
    const completed = completePhase(content, phaseFlag ?? '', completionPayload, ts);
    if (!completed.ok) return phaseCompletionError(completed.detail);
    const written = writeProvenRepoFile(resolved.identity, completed.content);
    if (!written.ok) return fileError(displayPath);
    const cleanupFailure = scratch?.consume() ?? null;
    const cleanupNote = cleanupFailure
      ? `\n[sdd-log] payload was applied but cleanup failed: ${cleanupFailure}\n  next: remove that exact scratch file before handoff.`
      : '';
    logger.debug(`[SddLogCommand#run] completed ${phaseFlag} in ${ticket}`);
    const body = [
      `[sdd-log] completed ${phaseFlag}:`,
      completed.doneLine,
      completed.handoffLine,
      `[sdd-log] phase status → [x]${cleanupNote}`,
    ].join('\n');
    return { ok: true, text: idBanner ? `${idBanner}\n${body}` : body };
  }
  // #endregion END_COMPLETE

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

  // #region START_CLOSE — invariant: a scaffolded current-Round close skeleton is replaced in
  // place. Dynamically opened rounds may receive one new close block, but repeated/ambiguous close
  // state fails before any write, including the Meta Status rewrite prepared above.
  if (mode === 'close') {
    const closed = closeCurrentRound(workingContent, ts);
    if (!closed.ok) return roundCloseError(closed.detail);
    const written = writeProvenRepoFile(resolved.identity, closed.content);
    if (!written.ok) return fileError(displayPath);
    logger.debug(`[SddLogCommand#run] closed current Round in ${ticket}`);
    const body = `[sdd-log] closed current Round:\n${closed.closeBlock}${metaStatusNote}`;
    return { ok: true, text: idBanner ? `${idBanner}\n${body}` : body };
  }
  // #endregion END_CLOSE

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

/**
 * @purpose Execute sdd-log and normalize every failure into the common actionable tool schema.
 * @param rawArgs Raw command-line arguments.
 * @param now Clock value used by deterministic log receipts.
 * @param [projectRoot] Canonical ticket-resolution root.
 * @param [checkAuthoring] Spec validator seam retained for deterministic tests.
 * @returns Original success or a code/object/reason/next/example failure.
 */
export async function run(
  rawArgs: string[],
  now: Date,
  projectRoot = resolve('.'),
  checkAuthoring: (file: string, content: string) => Finding[] = checkSpecAuthoringDraft
): Promise<LogOutcome> {
  const outcome = await runCommand(rawArgs, now, projectRoot, checkAuthoring);
  if (outcome.ok) return outcome;
  return {
    ...outcome,
    message: normalizeSddToolFailure(
      {
        tool: 'sdd-log',
        code: outcome.code,
        object: rawArgs.slice(2).join(' ') || 'sdd-log transition',
        action: 'repair the named ticket or log state, then repeat the same transition once',
        example:
          'npx gennady sdd-log specs/demo/core/core.task.DEM-work.md line "verified" --phase P1',
      },
      outcome.message
    ),
  };
}

// Self-executing for CLI: gennady sdd-log <ticket> <mode> [content] — see MODES above.
const outcome = await run(process.argv, new Date());
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
