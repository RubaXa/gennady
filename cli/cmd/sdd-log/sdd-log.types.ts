// @file: Types, errors, append builders, and the atomic phase-completion transition for sdd-log.
// @consumers: SddLogCommand
// @tasks: N/A

import { relative, resolve } from 'node:path';
import type { TicketRef } from '../../../shared/sdd/check.ts';
import { parsePhaseReceipts } from '../../../shared/sdd/phase-receipt.ts';
import { findSectionBounds } from '../../../shared/sdd/section.ts';
import { deriveSpecAcronym } from '../../../shared/sdd/requirement-id.ts';
import { unreadableTicketHint } from '../../../shared/sdd/ticket-resolve.ts';

/** @purpose No ticket path, or not exactly one of --round / --line / --close. */
export const ERR_CLI_SDD_LOG_BAD_INVOCATION = 'ERR_CLI_SDD_LOG_BAD_INVOCATION' as const;
/** @purpose Ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_LOG_FILE = 'ERR_CLI_SDD_LOG_FILE' as const;
/** @purpose Argument has Task-ID shape but no ticket in the tree carries that Meta Task-ID. */
export const ERR_CLI_SDD_LOG_UNKNOWN_ID = 'ERR_CLI_SDD_LOG_UNKNOWN_ID' as const;
/** @purpose More than one ticket carries the same Meta Task-ID (a project-wide collision). */
export const ERR_CLI_SDD_LOG_AMBIGUOUS_ID = 'ERR_CLI_SDD_LOG_AMBIGUOUS_ID' as const;
/** @purpose Ticket has no single clean EXECUTION_LOG section to append to. */
export const ERR_CLI_SDD_LOG_NO_LOG_SECTION = 'ERR_CLI_SDD_LOG_NO_LOG_SECTION' as const;
/** @purpose Content carries an unreplaced `<…>` placeholder — a fabricated / incomplete entry. */
export const ERR_CLI_SDD_LOG_PLACEHOLDER = 'ERR_CLI_SDD_LOG_PLACEHOLDER' as const;
/** @purpose `blocker` mode invoked without required `--axiom` and/or `--unblock`. */
export const ERR_CLI_SDD_LOG_MISSING_FLAG = 'ERR_CLI_SDD_LOG_MISSING_FLAG' as const;
/** @purpose `--phase <PhaseID>` names a phase with no open `#### <PhaseID>` block in EXECUTION_LOG. */
export const ERR_CLI_SDD_LOG_PHASE_NOT_OPEN = 'ERR_CLI_SDD_LOG_PHASE_NOT_OPEN' as const;
/** @purpose A one-shot `.claude/tmp/` payload failed path, size, UTF-8, or schema validation. */
export const ERR_CLI_SDD_LOG_PAYLOAD_FILE = 'ERR_CLI_SDD_LOG_PAYLOAD_FILE' as const;
/** @purpose `complete` cannot prove or apply its all-or-nothing phase transition. */
export const ERR_CLI_SDD_LOG_COMPLETE_STATE = 'ERR_CLI_SDD_LOG_COMPLETE_STATE' as const;
/** @purpose `close` cannot prove one unclosed current-Round transition. */
export const ERR_CLI_SDD_LOG_CLOSE_STATE = 'ERR_CLI_SDD_LOG_CLOSE_STATE' as const;
/** @purpose `authoring-complete` cannot prove or record one completed scope/module draft. */
export const ERR_CLI_SDD_LOG_AUTHORING_STATE = 'ERR_CLI_SDD_LOG_AUTHORING_STATE' as const;

/**
 * @purpose Result of one sdd-log run.
 * @invariant On success `text` echoes the appended lines; on failure `message` is never empty.
 */
export type LogOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 4; message: string };

/** @purpose Matches an unreplaced scaffold placeholder like `<ts>`, `<cmd>`, `<pass|fail>`, `<…>` (no inner whitespace). */
export const PLACEHOLDER_RE = /<[^>\s]+>/;
/** @purpose Match an entire scaffold placeholder inside inline code. */
const WHOLE_PLACEHOLDER_RE = /^<[^>\s]+>$/;

/**
 * @purpose Detect bare placeholders while allowing angle brackets inside longer inline-code values.
 * @invariant Scans one CLI argument; cross-line markdown and PascalCase markup exclusions belong only to shared/sdd/check.ts.
 * @invariant A bare `<PhaseID>` remains a placeholder.
 * @param text Candidate log content.
 * @returns True when a `<…>`-style placeholder remains.
 */
export function hasPlaceholder(text: string): boolean {
  let outsideCode = '';
  let lastIndex = 0;
  for (const m of text.matchAll(/`([^`]*)`/g)) {
    outsideCode += text.slice(lastIndex, m.index);
    if (WHOLE_PLACEHOLDER_RE.test((m[1] ?? '').trim())) return true;
    lastIndex = (m.index ?? 0) + m[0].length;
  }
  outsideCode += text.slice(lastIndex);
  return PLACEHOLDER_RE.test(outsideCode);
}

/**
 * @purpose Compute the next round number from how many `### Round` headers already exist.
 * @param fileContent Full ticket markdown.
 * @returns Existing round count + 1 (1 for the first round).
 */
export function nextRoundNumber(fileContent: string): number {
  const matches = fileContent.match(/^#{3}\s+Round\s+\d+/gm);
  return (matches?.length ?? 0) + 1;
}

/**
 * @purpose Build a Round header block (blank-line padded) to insert into EXECUTION_LOG.
 * @param n Round number.
 * @param date `YYYY-MM-DD` date string.
 * @param reason Short reason (`initial`, `fix: F-NNN`, `resume`).
 * @returns The header text to splice before the section close marker.
 */
export function buildRoundHeader(n: number, date: string, reason: string): string {
  return `\n### Round ${n} — ${date}, ${reason}\n`;
}

/**
 * @purpose Build a single timestamped, completed event line.
 * @param content The event content (e.g. `DONE`, ``ver `npm run check` → pass exit=0``, `intro Foo`).
 * @param ts Timestamp string.
 * @returns A `- [x] \`<ts>\` <content>` list item.
 */
export function buildEventLine(content: string, ts: string): string {
  return `- [x] \`${ts}\` ${content}`;
}

/**
 * @purpose Build the Round-close block.
 * @param ts Timestamp string.
 * @returns The `#### Round close` header plus a completed DONE line.
 */
export function buildCloseBlock(ts: string): string {
  return `\n#### Round close\n- [x] \`${ts}\` DONE`;
}

/** @purpose The only Round-close placeholder owned by `close`. */
const ROUND_CLOSE_SKELETON = '- [ ] `<ts>` DONE';
/** @purpose A Round already closed by a previous successful `close`. */
const ROUND_CLOSE_DONE_RE = /^- \[x\] `[^`]+` DONE$/;

/**
 * @purpose Close the current Round without duplicating a scaffolded `#### Round close` block.
 * @invariant A scaffold placeholder is replaced in place; a missing block is appended once for
 *   rounds opened dynamically by `sdd-log round`; an already closed or ambiguous Round fails.
 * @param content Full ticket markdown, optionally with a scaffolded current-Round close block.
 * @param ts Real ISO timestamp owned by the CLI.
 * @returns Complete replacement content, or one fail-closed structural reason.
 */
export function closeCurrentRound(
  content: string,
  ts: string
): { ok: true; content: string; closeBlock: string } | { ok: false; detail: string } {
  const log = findSectionBounds(content, 'EXECUTION_LOG');
  if (!log) return { ok: false, detail: 'ticket has no readable EXECUTION_LOG' };
  const lines = content.split('\n');

  let currentRound = -1;
  for (let i = log.openLine + 1; i < log.closeLine; i++) {
    if (/^###\s+Round\s+\d+\b/.test((lines[i] ?? '').trim())) currentRound = i;
  }

  const searchStart = currentRound >= 0 ? currentRound + 1 : log.openLine + 1;
  const closeHeads: number[] = [];
  for (let i = searchStart; i < log.closeLine; i++) {
    if ((lines[i] ?? '').trim() === '#### Round close') closeHeads.push(i);
  }
  if (closeHeads.length > 1) {
    return {
      ok: false,
      detail: `current Round must contain at most one Round close block (found ${closeHeads.length})`,
    };
  }

  const closeBlock = buildCloseBlock(ts).trim();
  if (closeHeads.length === 0) {
    lines.splice(log.closeLine, 0, ...buildCloseBlock(ts).split('\n'));
    return { ok: true, content: lines.join('\n'), closeBlock };
  }

  const closeHead = closeHeads[0] as number;
  const closeState = (lines[closeHead + 1] ?? '').trim();
  if (ROUND_CLOSE_DONE_RE.test(closeState)) {
    return { ok: false, detail: 'current Round is already closed' };
  }
  if (closeState !== ROUND_CLOSE_SKELETON) {
    return {
      ok: false,
      detail: 'current Round close block must contain exactly one incomplete DONE skeleton',
    };
  }
  lines[closeHead + 1] = `- [x] \`${ts}\` DONE`;
  return { ok: true, content: lines.join('\n'), closeBlock };
}

/** @purpose Completion kind inferred from the spec's load-bearing identity marker. */
export type SpecAuthoringKind = 'scope' | 'module';

/**
 * @purpose Prepare one durable Decision Log receipt for a mechanically clean authoring draft.
 * @invariant The next file-local DL number, completion record, and returned receipt are derived
 *   before the caller performs its single proven-file write.
 * @param content Full scope/module spec markdown before completion.
 * @param specPath Repository-relative exact spec path.
 * @param date Recording date in YYYY-MM-DD form.
 * @returns Replacement content plus the exact receipt, or a fail-closed structural reason.
 */
export function completeSpecAuthoring(
  content: string,
  specPath: string,
  date: string
):
  | { ok: true; content: string; receipt: string; kind: SpecAuthoringKind }
  | { ok: false; detail: string } {
  const moduleMarkers = content.match(/<!--SECTION:MODULE_VISION-->/g)?.length ?? 0;
  const scopeMarkers = content.match(/<!--SECTION:SCOPE_TYPE-->/g)?.length ?? 0;
  if (moduleMarkers + scopeMarkers !== 1) {
    return {
      ok: false,
      detail: `spec kind must have exactly one MODULE_VISION or SCOPE_TYPE marker (module=${moduleMarkers}, scope=${scopeMarkers})`,
    };
  }
  const kind: SpecAuthoringKind = moduleMarkers === 1 ? 'module' : 'scope';
  if (new RegExp(`\\b${kind} draft complete\\b`).test(content)) {
    return { ok: false, detail: `${kind} draft already has an authoring-complete receipt` };
  }

  const sectionName = kind === 'module' ? 'MODULE_DECISION_LOG' : 'DECISION_LOG';
  const bounds = findSectionBounds(content, sectionName);
  if (!bounds) return { ok: false, detail: `spec has no readable ${sectionName} section` };
  const lines = content.split('\n');
  let detailsClose = -1;
  for (let i = bounds.openLine + 1; i < bounds.closeLine; i++) {
    if ((lines[i] ?? '').trim() === '</details>') detailsClose = i;
  }
  if (detailsClose === -1) {
    return { ok: false, detail: `${sectionName} must fold its full entries under <details>` };
  }

  const acr = deriveSpecAcronym(specPath);
  let max = 0;
  const escapedAcr = acr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const match of content.matchAll(new RegExp(`\\b${escapedAcr}-DL-([0-9]+)\\b`, 'g'))) {
    max = Math.max(max, Number(match[1] ?? 0));
  }
  const receipt = `${acr}-DL-${max + 1} ${date} — ${kind} draft complete (почему: sdd-check --spec ${specPath} --authoring прошёл без замечаний)`;
  lines.splice(detailsClose, 0, receipt, '');
  return { ok: true, content: lines.join('\n'), receipt, kind };
}

/**
 * @purpose Build a phase-block header per `PHASE_BLOCK_FORMAT` — verbatim, no timestamp/escaping.
 * @param phaseId The phase id (e.g. `P1`).
 * @param [suffix] Optional re-run suffix (e.g. `— re-run: F-001`), appended verbatim after a space.
 * @returns The `#### <PhaseID>` header line, blank-line padded like the other block openers.
 */
export function buildPhaseHeader(phaseId: string, suffix?: string): string {
  const head = suffix ? `${phaseId} ${suffix}` : phaseId;
  return `\n#### ${head}\n`;
}

/**
 * @purpose Build the `**Handoff →**` line per `HANDOFF_FORMAT` — verbatim payload, no timestamp.
 * @param payload The typed payload (`artifacts: […]; decisions: […]; open: […]`).
 * @returns The `**Handoff →** <payload>` line, exact bytes.
 */
export function buildHandoffLine(payload: string): string {
  return `**Handoff →** ${payload}`;
}

/** @purpose Canonical field boundaries accepted by `complete`; field text may contain nested brackets. */
const COMPLETE_HANDOFF_PAYLOAD_RE =
  /^artifacts:\s*\[(.+)\];\s*decisions:\s*\[(.*)\];\s*open:\s*\[(.*)\];\s*deviations:\s*\[(.*)\]$/;
/** @purpose One current-Round phase heading, with an optional re-run suffix. */
const COMPLETE_PHASE_HEADING_RE = /^####\s+(P[0-9]+)\b/;
/** @purpose The only incomplete DONE skeleton line `complete` owns. */
const COMPLETE_DONE_SKELETON = '- [ ] `<ts>` DONE';
/** @purpose The only incomplete Handoff skeleton lines `complete` owns. */
const COMPLETE_HANDOFF_SKELETONS = new Set([
  '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
  '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]',
]);

/**
 * @purpose Validate the four-field semantic Handoff value consumed by the next phase.
 * @param payload Candidate value without the `**Handoff →**` prefix.
 * @returns True only for all four named fields in canonical order and no scaffold ellipsis.
 */
export function isCompleteHandoffPayload(payload: string): boolean {
  return COMPLETE_HANDOFF_PAYLOAD_RE.test(payload) && !payload.includes('[...]');
}

/**
 * @purpose Prepare the all-or-nothing phase completion transition in memory.
 * @invariant Only the selected phase row and its two skeleton lines in the latest Round change.
 * @param content Full ticket markdown before completion.
 * @param phaseId Exact phase selected by `--phase`.
 * @param payload Validated typed Handoff payload without its Markdown prefix.
 * @param ts Real ISO timestamp owned by the CLI.
 * @returns Complete replacement content, or one fail-closed structural reason with no mutation.
 */
export function completePhase(
  content: string,
  phaseId: string,
  payload: string,
  ts: string
):
  | { ok: true; content: string; doneLine: string; handoffLine: string }
  | { ok: false; detail: string } {
  const receipts = parsePhaseReceipts(content);
  if (!receipts.ok) return { ok: false, detail: receipts.issue };
  if (!receipts.receipts.some((receipt) => receipt.phase === phaseId)) {
    return { ok: false, detail: `phase ${phaseId} has no CLI-owned SDD_PHASE_RECEIPT` };
  }

  const overview = findSectionBounds(content, 'PHASES_OVERVIEW');
  if (!overview) return { ok: false, detail: 'ticket has no readable PHASES_OVERVIEW' };
  const log = findSectionBounds(content, 'EXECUTION_LOG');
  if (!log) return { ok: false, detail: 'ticket has no readable EXECUTION_LOG' };
  const lines = content.split('\n');

  const overviewRows: number[] = [];
  for (let i = overview.openLine + 1; i < overview.closeLine; i++) {
    const cells = (lines[i] ?? '').split('|');
    if (cells.length >= 6 && cells[1]?.trim() === phaseId) overviewRows.push(i);
  }
  if (overviewRows.length !== 1) {
    return {
      ok: false,
      detail: `PHASES_OVERVIEW must contain exactly one ${phaseId} row (found ${overviewRows.length})`,
    };
  }
  const overviewLine = overviewRows[0] as number;
  const overviewCells = (lines[overviewLine] ?? '').split('|');
  const statusCell = overviewCells[4] ?? '';
  if (!/^\s*\[ \](?:\s+[A-Z_]+)?\s*$/.test(statusCell)) {
    return { ok: false, detail: `phase ${phaseId} status is not the incomplete [ ] state` };
  }

  let currentRound = -1;
  for (let i = log.openLine + 1; i < log.closeLine; i++) {
    if (/^###\s+Round\s+\d+\b/.test((lines[i] ?? '').trim())) currentRound = i;
  }
  if (currentRound < 0) return { ok: false, detail: 'EXECUTION_LOG has no current Round' };

  const phaseHeads: number[] = [];
  for (let i = currentRound + 1; i < log.closeLine; i++) {
    const match = COMPLETE_PHASE_HEADING_RE.exec((lines[i] ?? '').trim());
    if (match?.[1] === phaseId) phaseHeads.push(i);
  }
  if (phaseHeads.length !== 1) {
    return {
      ok: false,
      detail: `current Round must contain exactly one ${phaseId} block (found ${phaseHeads.length})`,
    };
  }
  const phaseHead = phaseHeads[0] as number;
  let phaseEnd = log.closeLine;
  for (let i = phaseHead + 1; i < log.closeLine; i++) {
    if (/^#{1,6}\s+\S/.test((lines[i] ?? '').trim())) {
      phaseEnd = i;
      break;
    }
  }

  const doneLines: number[] = [];
  const handoffLines: number[] = [];
  for (let i = phaseHead + 1; i < phaseEnd; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === COMPLETE_DONE_SKELETON) doneLines.push(i);
    if (COMPLETE_HANDOFF_SKELETONS.has(line)) handoffLines.push(i);
  }
  if (doneLines.length !== 1 || handoffLines.length !== 1) {
    return {
      ok: false,
      detail: `phase ${phaseId} must contain one incomplete DONE and one Handoff skeleton in the current Round`,
    };
  }

  const doneLine = `- [x] \`${ts}\` DONE`;
  const handoffLine = buildHandoffLine(payload);
  overviewCells[4] = statusCell.replace('[ ]', '[x]');
  lines[overviewLine] = overviewCells.join('|');
  lines[doneLines[0] as number] = doneLine;
  lines[handoffLines[0] as number] = handoffLine;
  return { ok: true, content: lines.join('\n'), doneLine, handoffLine };
}

/**
 * @purpose Build a full BLOCKER_FORMAT block — cause + axiom ref + unblock action.
 * @param reason One-line cause (verbatim).
 * @param axiom Axiom id cited as the trigger (verbatim, e.g. `AX_BLOCKER_ESCALATION`).
 * @param unblock Concrete operator action to resolve the blocker (verbatim).
 * @param ts Timestamp string.
 * @returns The `- 🛑 …` / `  - 🔗 axiom: …` / `  - 💬 unblock: …` block.
 */
export function buildBlockerBlock(
  reason: string,
  axiom: string,
  unblock: string,
  ts: string
): string {
  return [
    `- 🛑 \`${ts}\` BLOCKED: ${reason}`,
    `  - 🔗 axiom: ${axiom}`,
    `  - 💬 unblock: ${unblock}`,
  ].join('\n');
}

/**
 * @purpose Build the paired close for BLOCKER_FORMAT — the `✅ RESOLVED` marker
 *   `AX_BLOCKER_RESOLUTION_TRAIL` and `scanBlockerTrail` (check.ts) key off, per-phase.
 * @param reason The concrete environmental change or decision that removed the blocker (verbatim).
 * @param ts Timestamp string.
 * @returns A `- [x] \`<ts>\` ✅ RESOLVED: <reason>` line.
 */
export function buildResolvedLine(reason: string, ts: string): string {
  return `- [x] \`${ts}\` ✅ RESOLVED: ${reason}`;
}

/**
 * @purpose Build a teaching diagnostic for an unsafe or malformed file-backed payload.
 * @param detail Exact failed safety/schema condition.
 * @returns Outcome with exit 2; the ticket remains untouched.
 */
export function payloadFileError(detail: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_PAYLOAD_FILE,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_PAYLOAD_FILE}: ${detail}`,
      '  Write literal content with the file-write tool to a regular `.claude/tmp/<name>` file,',
      '  then pass its exact repo-relative path via --content-file or --payload-file.',
      '  The rejected file was not consumed; correct or remove that exact scratch file.',
    ].join('\n'),
  };
}

/**
 * @purpose Report why `complete` could not prove its phase-owned all-or-nothing transition.
 * @param detail Missing receipt or malformed/inconsistent current phase state.
 * @returns Exit 2; the ticket remains byte-identical.
 */
export function phaseCompletionError(detail: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_COMPLETE_STATE,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_COMPLETE_STATE}: ${detail}`,
      '  Run sdd-verify for this phase first. Then complete the still-open phase skeleton exactly once.',
      '  No phase status, DONE line, or Handoff was changed.',
    ].join('\n'),
  };
}

/**
 * @purpose Report why `close` could not prove one current-Round transition.
 * @param detail Duplicate, completed, or malformed Round-close state.
 * @returns Exit 2; the ticket remains byte-identical.
 */
export function roundCloseError(detail: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_CLOSE_STATE,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_CLOSE_STATE}: ${detail}`,
      '  Close the current Round exactly once; a scaffolded Round close placeholder is replaced in place.',
      '  No Round-close line or Meta Status was changed.',
    ].join('\n'),
  };
}

/** @purpose A phase-heading line inside EXECUTION_LOG — `#### P<N>` (optionally with a re-run suffix), same shape `parsePhaseHandoffs` (check.ts) keys off. */
const PHASE_HEADING_RE = /^#{2,6}\s+(P[0-9]+)\b/;
/** @purpose Any markdown heading line — the boundary of a phase's block within EXECUTION_LOG (next phase/round header). */
const ANY_HEADING_RE = /^#{1,6}\s+\S/;

/**
 * @purpose Outcome of locating one phase's block inside EXECUTION_LOG.
 * @invariant `found: false` carries every phase id that DOES have an open block — the teaching hint
 *   for the caller's error message.
 */
export type PhaseBlockLookup =
  | { found: true; insertLine: number }
  | { found: false; openPhases: string[] };

/**
 * @purpose Locate the append point inside ONE phase's own EXECUTION_LOG block — keeps ownership
 * explicit across historical blocks and later re-runs of the same phase.
 * @invariant Keys off the LAST `#### <phaseId>` heading, not the first — a `fix` re-run reopens the
 * same id in a later Round.
 * @param content Full ticket markdown.
 * @param logBounds EXECUTION_LOG's marker line indices (`findSectionBounds`'s result).
 * @param phaseId The phase pointer from `--phase` (e.g. `P2`).
 * @returns The line index to splice new content before, or (not found) every phase id with an open block.
 */
export function findPhaseBlockBounds(
  content: string,
  logBounds: { openLine: number; closeLine: number },
  phaseId: string
): PhaseBlockLookup {
  const lines = content.split('\n');
  const escaped = phaseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const targetRe = new RegExp(`^#{2,6}\\s+${escaped}\\b`);

  const openPhases: string[] = [];
  let phaseHeadLine = -1;
  for (let i = logBounds.openLine + 1; i < logBounds.closeLine; i++) {
    const line = (lines[i] ?? '').trim();
    const m = PHASE_HEADING_RE.exec(line);
    if (m && !openPhases.includes(m[1] as string)) openPhases.push(m[1] as string);
    if (targetRe.test(line)) phaseHeadLine = i;
  }
  if (phaseHeadLine === -1) return { found: false, openPhases };

  let insertLine = logBounds.closeLine;
  let foundNextHeading = false;
  for (let i = phaseHeadLine + 1; i < logBounds.closeLine; i++) {
    if (ANY_HEADING_RE.test((lines[i] ?? '').trim())) {
      insertLine = i;
      foundNextHeading = true;
      break;
    }
  }
  // A real NEXT heading (another phase/round opened after this one) pads itself with a leading
  // blank line — back up before that blank run so the new content lands after this block's own
  // last line, not swallowed between the blank and the following heading. The end-of-section
  // fallback (no next heading) is left as-is — that already matches the no-`--phase` append point
  // every other mode uses, so behavior there is unchanged.
  if (foundNextHeading) {
    while (insertLine > phaseHeadLine + 1 && (lines[insertLine - 1] ?? '').trim() === '') {
      insertLine--;
    }
  }
  return { found: true, insertLine };
}

// The Status line per TASK_SKELETON (templates.ts) — `- **Status:** [ ] TODO   <!-- hint -->`.
// Captures the label prefix (group 1) and any trailing hint comment (group 2) so a rewrite touches
// only the checkbox+token, byte-identical otherwise.
const META_STATUS_LINE = /^(\s*-\s*\*\*Status:\*\*\s*)\[.\]\s*[A-Z_]+(.*)$/;

/**
 * @purpose Outcome of a META Status rewrite attempt.
 * @invariant `changed` is false and `content` untouched whenever META or its Status line is absent
 *   (old tickets) — tolerance, not a failure.
 */
export type MetaStatusResult = {
  /** @purpose Ticket content with the Status line rewritten (untouched when `changed` is false). */
  content: string;
  /** @purpose Whether a Status line was actually found and rewritten. */
  changed: boolean;
};

/**
 * @purpose Rewrite the META section's `**Status:**` checkbox+token in place, preserving the trailing
 *   hint comment and every other line byte-identical.
 * @invariant Line count never changes — any line-index bounds computed from the original content
 *   (e.g. EXECUTION_LOG's `findSectionBounds`) stay valid after this call.
 * @param content Full ticket markdown.
 * @param token New checkbox+token to write (e.g. `[~] IN_PROGRESS`, `[x] DONE`).
 * @returns MetaStatusResult — rewritten content when a Status line existed, else the input untouched.
 */
export function setMetaStatus(content: string, token: string): MetaStatusResult {
  const bounds = findSectionBounds(content, 'META');
  if (!bounds) return { content, changed: false };

  const lines = content.split('\n');
  for (let i = bounds.openLine + 1; i < bounds.closeLine; i++) {
    const line = lines[i] ?? '';
    const m = line.match(META_STATUS_LINE);
    if (m) {
      lines[i] = `${m[1]}${token}${m[2]}`;
      return { content: lines.join('\n'), changed: true };
    }
  }
  return { content, changed: false };
}

/**
 * @purpose Build the missing-flag diagnostic for `blocker` mode.
 * @param detail What flag was missing.
 * @returns Outcome with exit 4.
 */
export function missingFlag(detail: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_MISSING_FLAG,
    exitCode: 4,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_MISSING_FLAG}: ${detail}`,
      '  expected: gennady sdd-log <ticket> blocker "<reason>" --axiom <AX_NAME> --unblock "<concrete action>"',
      '        or: gennady sdd-log <ticket> blocker --payload-file .claude/tmp/<name>.json --phase P<N>',
    ].join('\n'),
  };
}

/**
 * @purpose Build the bad-invocation diagnostic.
 * @param detail What was wrong.
 * @returns Outcome with exit 4.
 */
export function badInvocation(detail: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_BAD_INVOCATION}: ${detail}`,
      '  expected: gennady sdd-log <ticket> <mode> [content]',
      '  modes: round "<reason>" | line "<content>" [--phase P<N>] | close |',
      '         phase <P-ID> ["— re-run: <reason>"] | handoff "<payload>" [--phase P<N>] |',
      '         blocker "<reason>" --axiom <AX_NAME> --unblock "<action>" --phase P<N> |',
      '         resolved "<what removed it>" --phase P<N>   # paired close for blocker |',
      '         complete "artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]" --phase P<N> |',
      '         authoring-complete   # exact scope/module *.spec.md path',
      '  agent free text: replace the quoted content with --content-file .claude/tmp/<safe-name>;',
      '  blocker uses --payload-file .claude/tmp/<safe-name>.json with reason/axiom/unblock keys.',
      '  --phase P<N> is only valid on line | handoff | blocker | resolved | complete.',
      '  For append modes it inserts at the end',
      "  of that phase's own block instead of the end of EXECUTION_LOG (phases execute sequentially).",
      '  content must carry no <…> placeholder.',
    ].join('\n'),
  };
}

/**
 * @purpose Report why a spec authoring receipt could not be proved or recorded atomically.
 * @param detail Incomplete draft, repeated receipt, or malformed spec state.
 * @returns Outcome with exit 4.
 */
export function authoringCompletionError(detail: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_AUTHORING_STATE,
    exitCode: 4,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_AUTHORING_STATE}: ${detail}`,
      '  Fix every `sdd-check --spec <path> --authoring` hint, then record completion exactly once.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the placeholder-rejection diagnostic.
 * @param content The offending content.
 * @returns Outcome with exit 2.
 */
export function placeholderError(content: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_PLACEHOLDER,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_PLACEHOLDER}: "${content}"`,
      '  Content still has an unreplaced <…> placeholder — that is a fabricated / incomplete log entry.',
      '  Replace every placeholder with a real value (the actual command, exit code, name) before logging.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-error diagnostic — tool-teaches: points a path-shaped argument at the map.
 * @param ticket The ticket path or Task-ID that could not be resolved.
 * @returns Outcome with exit 1.
 */
export function fileError(ticket: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_FILE,
    exitCode: 1,
    message: `[sdd-log] ${ERR_CLI_SDD_LOG_FILE}: ${ticket}\n  ${unreadableTicketHint(ticket)}`,
  };
}

/**
 * @purpose Build the unknown-Task-ID diagnostic — the argument has Task-ID shape but scanning the tree
 * found no ticket carrying that Meta Task-ID.
 * @param id The requested Task-ID.
 * @param refs Every ticket's graph ref found while scanning (for the "known Task-IDs" hint).
 * @returns Outcome with exit 2.
 */
export function unknownIdError(id: string, refs: TicketRef[]): LogOutcome {
  const known = refs.map((r) => r.taskId).filter((t): t is string => t != null);
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_UNKNOWN_ID,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_UNKNOWN_ID}: ${id}`,
      known.length
        ? `  known Task-IDs: ${known.join(', ')}`
        : '  очередь пуста — тикетов с Task-ID в дереве не найдено.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the ambiguous-Task-ID diagnostic — two or more tickets share one Meta Task-ID.
 * @param id The requested Task-ID.
 * @param matches Every ticket ref whose Task-ID equals `id`.
 * @param root Absolute project root (candidate paths are printed relative to it).
 * @returns Outcome with exit 2.
 */
export function ambiguousIdError(id: string, matches: TicketRef[], root: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_AMBIGUOUS_ID,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_AMBIGUOUS_ID}: ${id} matches ${matches.length} tickets`,
      ...matches.map((m) => `  - ${relative(root, resolve(m.file))}`),
    ].join('\n'),
  };
}

/**
 * @purpose Build the phase-not-open diagnostic — `--phase <PhaseID>` names a phase with no open
 * `#### <PhaseID>` block in EXECUTION_LOG to append into.
 * @param ticket The ticket path (display form).
 * @param phaseId The requested phase pointer.
 * @param openPhases Every phase id whose block is currently open in the log, in document order.
 * @returns Outcome with exit 2.
 */
export function phaseNotOpenError(
  ticket: string,
  phaseId: string,
  openPhases: string[]
): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_PHASE_NOT_OPEN,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_PHASE_NOT_OPEN}: ${phaseId}`,
      `  No open "#### ${phaseId}" block in ${ticket}'s EXECUTION_LOG.`,
      openPhases.length
        ? `  phases with an open block: ${openPhases.join(', ')}`
        : '  no phase block is open yet.',
      `  Open it first: npx gennady sdd-log ${ticket} phase ${phaseId}`,
    ].join('\n'),
  };
}

/**
 * @purpose Build the missing-log-section diagnostic.
 * @param ticket The ticket path.
 * @returns Outcome with exit 2.
 */
export function noLogSection(ticket: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_NO_LOG_SECTION,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_NO_LOG_SECTION}: ${ticket}`,
      '  No single clean <!--SECTION:EXECUTION_LOG--> … <!--/SECTION:EXECUTION_LOG--> pair to append to.',
      '  Scaffold or repair the Execution Log section first.',
    ].join('\n'),
  };
}
