// @file: CLI-owned group-completion receipt — the durable "group audited/reviewed, verdict V, at git-ref R" fact.
// @consumers: sdd-log.cmd (writer), sdd-check.cmd (re-derivation gate)
// @tasks: N/A

import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { extractSection } from './section.ts';
import { parseMetaInfo } from './ticket.ts';
import type { Finding } from './finding.ts';
import { nextRoundNumber, PHASE_RECEIPTS_SCHEMA_MARKER } from './execution-log.ts';

/** @purpose The two group-completion review transitions — audit and behavioural code-review. */
export type GroupReceiptKind = 'audit' | 'review';

/** @purpose Marker (and block value `SDD_AUDIT_RECEIPT` / `SDD_REVIEW_RECEIPT`) owning each kind's fact. */
export const GROUP_RECEIPT_MARKER: Readonly<Record<GroupReceiptKind, string>> = {
  audit: 'SDD_AUDIT_RECEIPT',
  review: 'SDD_REVIEW_RECEIPT',
};

/** @purpose WARN code emitted when a complete group has no valid audit receipt. */
const AUDIT_MISSING_CODE = 'SDD_GROUP_AUDIT_MISSING';
/** @purpose WARN code emitted when a complete group has no valid code-review receipt. */
const REVIEW_MISSING_CODE = 'SDD_GROUP_REVIEW_MISSING';
/** @purpose WARN code emitted when a group is migrating — SOME but not all members carry the v2
 *   receipt-aware schema marker — so grading stays explicitly skipped rather than silent (B2-16). */
const PARTIALLY_MARKED_CODE = 'SDD_GROUP_RECEIPT_PARTIALLY_MARKED';
/**
 * @purpose The durable FACT that one spec's ticket group was audited/reviewed — findings stay ephemeral.
 * @invariant `signature` binds the fact to re-derivable member state so a reopen invalidates it; `gitRef`
 *   records the audited commit as provenance only.
 */
export type GroupReceipt = {
  /** @purpose Receipt schema version. */
  schema: 1;
  /** @purpose Which review transition produced this fact. */
  kind: GroupReceiptKind;
  /** @purpose Human-readable group identity — the owning spec's repo-relative path. */
  group: string;
  /** @purpose The group's member ticket file basenames, sorted — the re-derived membership at write time. */
  members: string[];
  /** @purpose HEAD commit the group was audited at, or `'no-head'`. */
  gitRef: string;
  /** @purpose Terminal verdict (e.g. `PASS`, `reopened-Round-3`). */
  verdict: string;
  /** @purpose ISO timestamp owned by the CLI. */
  ts: string;
  /** @purpose SHA-256 over the sorted member `[basename, roundCount, done]` state — the reopen-invalidation binding. */
  signature: string;
};

/** @purpose One group member as re-derivation input: its exact file path and full markdown. */
export type GroupMemberInput = {
  /** @purpose Member ticket file path (absolute or relative — only its basename identifies it). */
  file: string;
  /** @purpose Full member ticket markdown. */
  content: string;
};

/**
 * @purpose Count a member's Rounds — the mechanical reopen signal (B2-01: derived from
 *   execution-log.ts's shared `nextRoundNumber`, one home for this count instead of a second copy).
 * @param content Full member ticket markdown.
 * @returns The number of `### Round N` headers in its Execution Log (0 when none).
 */
function memberRoundCount(content: string): number {
  return nextRoundNumber(content) - 1;
}

/**
 * @purpose Whether a member ticket's Meta Status is a checked DONE.
 * @param content Full member ticket markdown.
 * @returns True only for a `[x] … DONE` Meta Status.
 */
function memberIsDone(content: string): boolean {
  const meta = extractSection(content, 'META');
  const status = meta.status === 'ok' ? parseMetaInfo(meta.content).status : null;
  return status != null && status.includes('[x]') && /\bDONE\b/i.test(status);
}

/**
 * @purpose Whether a member ticket carries the v2 receipt-aware schema marker (the grandfathering gate).
 * @param content Full member ticket markdown.
 * @returns True when the marker is present.
 */
function memberIsReceiptAware(content: string): boolean {
  return content.includes(PHASE_RECEIPTS_SCHEMA_MARKER);
}

/**
 * @purpose Deterministically re-derived state of a ticket group from its live members.
 * @invariant `members` and `signature` depend only on basenames plus Round counts plus DONE, so they match
 *   between writer and checker regardless of repository root.
 */
export type DerivedGroupState = {
  /** @purpose Sorted member ticket basenames. */
  members: string[];
  /** @purpose True when every member is a checked DONE. */
  allDone: boolean;
  /** @purpose Member basenames that are not yet DONE (empty when complete). */
  notDone: string[];
  /** @purpose SHA-256 binding over the sorted member `[basename, roundCount, done]` state. */
  signature: string;
};

/**
 * @purpose Re-derive a group's completion state and forge/stale-resistant signature from live members.
 * @invariant Pure; both writer and checker call this so their signatures always agree for the same group.
 * @param members Every resolved group member (file + full markdown).
 * @returns The sorted membership, DONE state, and the reopen-invalidation signature.
 */
export function deriveGroupState(members: GroupMemberInput[]): DerivedGroupState {
  const entries = members
    .map((m) => ({
      name: basename(m.file),
      round: memberRoundCount(m.content),
      done: memberIsDone(m.content),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const notDone = entries.filter((e) => !e.done).map((e) => e.name);
  const basis = entries.map((e) => [e.name, e.round, e.done ? 1 : 0].join(' ')).join('\n');
  return {
    members: entries.map((e) => e.name),
    allDone: notDone.length === 0,
    notDone,
    signature: `sha256:${createHash('sha256').update(basis).digest('hex')}`,
  };
}

/**
 * @purpose Prepare one group-completion receipt, refusing unless the whole re-derived group is DONE.
 * @invariant The group-completion boundary — a receipt is minted only after every re-derived member is DONE.
 * @param kind Audit or review.
 * @param group Human-readable owning-spec identity.
 * @param members Every resolved group member (file + full markdown).
 * @param gitRef HEAD commit provenance, or `'no-head'`.
 * @param verdict Terminal verdict token.
 * @param ts CLI-owned ISO timestamp.
 * @returns The receipt, or the member basenames still open.
 */
export function buildGroupReceipt(
  kind: GroupReceiptKind,
  group: string,
  members: GroupMemberInput[],
  gitRef: string,
  verdict: string,
  ts: string
): { ok: true; receipt: GroupReceipt } | { ok: false; notDone: string[] } {
  const derived = deriveGroupState(members);
  if (!derived.allDone) return { ok: false, notDone: derived.notDone };
  return {
    ok: true,
    receipt: {
      schema: 1,
      kind,
      group,
      members: derived.members,
      gitRef,
      verdict,
      ts,
      signature: derived.signature,
    },
  };
}

/**
 * @purpose Type guard: a parsed value is a well-formed receipt of the expected kind.
 * @param value Parsed JSON candidate.
 * @param kind The kind the surrounding block claims.
 * @returns True when the value carries every required receipt field.
 */
function isGroupReceipt(value: unknown, kind: GroupReceiptKind): value is GroupReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    r.schema === 1 &&
    r.kind === kind &&
    typeof r.group === 'string' &&
    Array.isArray(r.members) &&
    r.members.every((m) => typeof m === 'string') &&
    typeof r.gitRef === 'string' &&
    typeof r.verdict === 'string' &&
    typeof r.ts === 'string' &&
    typeof r.signature === 'string'
  );
}

function receiptBlockRe(marker: string): RegExp {
  const fence = '`'.repeat(3);
  return new RegExp(
    `^<!--${marker}-->\\n${fence}json\\n([\\s\\S]*?)\\n${fence}\\n<!--\\/${marker}-->\\n?`,
    'gm'
  );
}

/** @purpose Parsed receipts of one kind, or a fail-closed structural issue. */
type GroupReceiptParseResult =
  | { ok: true; receipts: GroupReceipt[] }
  | { ok: false; issue: string };

/**
 * @purpose Parse every group receipt of one kind, failing closed on malformed/unpaired markers.
 * @param content Full spec markdown.
 * @param kind Audit or review.
 * @returns The receipts (possibly empty), or the first structural issue.
 */
function parseGroupReceipts(content: string, kind: GroupReceiptKind): GroupReceiptParseResult {
  const marker = GROUP_RECEIPT_MARKER[kind];
  const receipts: GroupReceipt[] = [];
  let consumed = 0;
  for (const match of content.matchAll(receiptBlockRe(marker))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] as string);
    } catch {
      return { ok: false, issue: `${marker} block contains invalid JSON` };
    }
    if (!isGroupReceipt(parsed, kind)) return { ok: false, issue: `${marker} block is malformed` };
    receipts.push(parsed);
    consumed++;
  }
  const openCount = content.split(`<!--${marker}-->`).length - 1;
  const closeCount = content.split(`<!--/${marker}-->`).length - 1;
  if (openCount !== consumed || closeCount !== consumed)
    return { ok: false, issue: `unpaired or malformed ${marker} marker` };
  return { ok: true, receipts };
}

/**
 * @purpose Render one group receipt as a paired HTML-comment-fenced block for atomic insertion.
 * @param receipt The complete group-completion fact.
 * @returns The paired block with a pretty JSON body.
 */
function formatGroupReceipt(receipt: GroupReceipt): string {
  const marker = GROUP_RECEIPT_MARKER[receipt.kind];
  return [
    `<!--${marker}-->`,
    '```json',
    JSON.stringify(receipt, null, 2),
    '```',
    `<!--/${marker}-->`,
  ].join('\n');
}

/**
 * @purpose Insert or replace one kind's receipt block on a spec, leaving every other byte untouched.
 * @invariant Removes ONLY prior blocks of the same kind, then appends the fresh block at end of file.
 * @param specContent Full spec markdown.
 * @param receipt The receipt to persist.
 * @returns The replacement spec content.
 */
export function upsertGroupReceipt(specContent: string, receipt: GroupReceipt): string {
  const without = specContent.replace(receiptBlockRe(GROUP_RECEIPT_MARKER[receipt.kind]), '');
  return `${without.replace(/\s*$/, '')}\n\n${formatGroupReceipt(receipt)}\n`;
}

/**
 * @purpose Validate one persisted receipt against the live re-derived group state (forge + stale gate).
 * @invariant Re-derivation is the forge defence — a receipt is accepted only when membership and signature
 *   both match the live group and the group is complete.
 * @param receipt A parsed persisted receipt.
 * @param derived The live re-derived state.
 * @returns Null when valid and current, else the invalidation reason.
 */
export function groupReceiptIssue(
  receipt: GroupReceipt,
  derived: DerivedGroupState
): string | null {
  if (!derived.allDone) return 'group is no longer complete — a member is not DONE';
  if (JSON.stringify(receipt.members) !== JSON.stringify(derived.members))
    return 'group membership changed since the receipt';
  if (receipt.signature !== derived.signature)
    return 'receipt is stale — a member reopened (new Round) since it was written';
  return null;
}

/** @purpose One resolved group ready for the receipt check: its owning spec plus every live member. */
export type GroupUnderCheck = {
  /** @purpose Owning spec file path (used in finding locations). */
  specFile: string;
  /** @purpose Full owning-spec markdown. */
  specContent: string;
  /** @purpose Every resolved group member (file + full markdown). */
  members: GroupMemberInput[];
};

/**
 * @purpose Re-derive each complete group and WARN when its audit/review receipt is missing, forged,
 *   or stale — grandfathered on the v2 schema marker, keyed off the WHOLE group being DONE.
 * @invariant Never per-ticket isDone. A SOME-but-not-all-marked group is an explicit
 *   `SDD_GROUP_RECEIPT_PARTIALLY_MARKED` skip (B2-16), not silence; a fully-unmarked group stays
 *   silently ungraded, same as before.
 * @param groups Every resolved group with its owning spec and live members.
 * @returns One WARN per complete v2 group lacking a valid audit or review receipt, plus one WARN per
 *   partially-marked group.
 */
export function checkGroupReceipts(groups: GroupUnderCheck[]): Finding[] {
  const findings: Finding[] = [];
  for (const group of groups) {
    if (group.members.length === 0) continue;
    const markedCount = group.members.filter((m) => memberIsReceiptAware(m.content)).length;
    if (markedCount === 0) continue;
    if (markedCount < group.members.length) {
      findings.push({
        severity: 'warn',
        code: PARTIALLY_MARKED_CODE,
        file: group.specFile,
        message: `Group has ${markedCount} of ${group.members.length} member ticket(s) marked \`<!--PHASE_RECEIPTS:v1-->\`; audit/code-review receipt grading stays skipped until every member is migrated.`,
      });
      continue;
    }
    const derived = deriveGroupState(group.members);
    if (!derived.allDone) continue;
    for (const [kind, code, label] of [
      ['audit', AUDIT_MISSING_CODE, 'audit'],
      ['review', REVIEW_MISSING_CODE, 'code-review'],
    ] as const) {
      const parsed = parseGroupReceipts(group.specContent, kind);
      const valid =
        parsed.ok && parsed.receipts.some((r) => groupReceiptIssue(r, derived) === null);
      if (valid) continue;
      const detail = !parsed.ok
        ? parsed.issue
        : parsed.receipts.length === 0
          ? 'no receipt recorded'
          : (parsed.receipts.map((r) => groupReceiptIssue(r, derived)).find((i) => i !== null) ??
            'no valid receipt');
      findings.push({
        severity: 'warn',
        code,
        file: group.specFile,
        message: `Group of ${group.members.length} DONE ticket(s) for this spec has no valid ${label} receipt (${detail}). Run \`gennady sdd-log <group> ${kind}-receipt <verdict>\` after the read-only ${label} returns.`,
      });
    }
  }
  return findings;
}
