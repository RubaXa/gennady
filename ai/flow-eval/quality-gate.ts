// @file: Objective quality gate for eval runs — mechanical success rules, not the stochastic judge.
// @consumers: cli; see docs/EVAL-SPEC.md for the rule backlog and the both-outcomes discipline.

import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  deriveGroupState,
  groupReceiptIssue,
  type GroupReceipt,
  type GroupReceiptKind,
} from '../../shared/sdd/group-receipt.ts';

const execFileAsync = promisify(execFile);

/** @purpose One quality rule's objective outcome for a run. */
export type QualityRuleResult = {
  /** @purpose Rule id from docs/EVAL-SPEC.md (e.g. 'R1'). */
  rule: string;
  pass: boolean;
  /** @purpose Short objective evidence (e.g. error count, the checker's summary line). */
  detail: string;
};

/**
 * @purpose Read the pass/fail of R1 (structural integrity) from `sdd-check --all` output.
 * @invariant Pure so it can be tested both ways without running the CLI: a "✅ clean" summary
 *   (zero findings at all) is a pass; an "N error(s), M warning(s)" summary (`sdd-check.types.ts`'s
 *   actual real-repo format, `errors === 0`) is ALSO a pass — `sdd-check` itself exits 0 and calls
 *   warnings-only clean (see its own `help.ts`: "0 clean (warnings allowed)"); `errors > 0` is a fail
 *   carrying the count; anything else is an inconclusive fail (the checker did not produce a verdict).
 * @param output Combined stdout+stderr of `gennady sdd-check --all .`.
 * @returns The R1 rule result.
 */
export function parseSddCheckResult(output: string): QualityRuleResult {
  const errorMatch = /(\d+)\s+error\(s\)(?:,\s*(\d+)\s+warning\(s\))?/i.exec(output);
  if (errorMatch) {
    const errors = Number(errorMatch[1]);
    if (errors > 0) return { rule: 'R1', pass: false, detail: `${errors} sdd-check error(s)` };
    const warnings = errorMatch[2];
    return {
      rule: 'R1',
      pass: true,
      detail:
        warnings !== undefined
          ? `0 sdd-check error(s), ${warnings} warning(s) (warnings allowed)`
          : '0 sdd-check error(s)',
    };
  }
  const clean = /\bclean\b\s+—\s+\d+\s+file/i.test(output) || /✅\s*clean/i.test(output);
  if (clean) return { rule: 'R1', pass: true, detail: 'sdd-check --all clean' };
  return { rule: 'R1', pass: false, detail: 'no sdd-check verdict parsed' };
}

/**
 * @purpose Run R1 (structural integrity) objectively against a finished scenario sandbox.
 * @param sandboxDir Absolute path to the provisioned scenario sandbox.
 * @returns The R1 result; a checker that cannot run at all is a fail, never a silent pass.
 */
export async function checkR1Structure(sandboxDir: string): Promise<QualityRuleResult> {
  const bin = join(sandboxDir, 'node_modules', '.bin', 'gennady');
  try {
    const { stdout, stderr } = await execFileAsync(bin, ['sdd-check', '--all', '.'], {
      cwd: sandboxDir,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    return parseSddCheckResult(`${stdout}\n${stderr}`);
  } catch (cause) {
    // Non-zero exit (errors present) still carries the summary on stdout/stderr — parse it.
    const shell = cause as { stdout?: string; stderr?: string; message?: string };
    const text = `${shell.stdout ?? ''}\n${shell.stderr ?? ''}`.trim();
    return text
      ? parseSddCheckResult(text)
      : { rule: 'R1', pass: false, detail: 'sdd-check failed to run' };
  }
}

/** @purpose Result of validating one group-completion receipt: null when valid, else why it isn't. */
type ReceiptCheck = { issue: string | null };

/** @purpose The on-disk completion signals for one execute target — read, never inferred. */
type CompletionSignals = {
  /** @purpose Whether the ticket's target artifact was actually PRODUCED (see `artifactWasProduced`). */
  artifactExists: boolean;
  /** @purpose Whether the ticket Meta Status is `[x] DONE`. */
  ticketDone: boolean;
  /** @purpose Whether the ticket's Execution Log has a closed (checked) round DONE line. */
  roundClosed: boolean;
  /** @purpose Validity of the owning spec's group audit receipt (see `checkReceipt`). */
  auditReceipt: ReceiptCheck;
  /** @purpose Validity of the owning spec's group code-review receipt (see `checkReceipt`). */
  reviewReceipt: ReceiptCheck;
};

/**
 * @purpose Objective completion rule (R-COMPLETE): an execute run that produced its artifact MUST have
 *   driven the ticket to a real DONE — closed round plus the durable group audit and code-review
 *   receipts. Pure, so both outcomes are testable without disk. This is the mechanical answer to the
 *   "abandoned artifact" blind spot: artifact-exists is NOT success.
 * @invariant Fails (RED) when the artifact exists but any completion signal is missing, listing each
 *   missing signal; fails when the declared artifact was never produced; passes only when all hold.
 * @param s The on-disk signals for the declared execute target.
 * @returns The R-COMPLETE rule result.
 */
function parseCompletion(s: CompletionSignals): QualityRuleResult {
  if (!s.artifactExists) {
    return { rule: 'R-COMPLETE', pass: false, detail: 'declared artifact was not produced' };
  }
  const missing: string[] = [];
  if (!s.ticketDone) missing.push('ticket not [x] DONE');
  if (!s.roundClosed) missing.push('no closed execution-log round');
  if (s.auditReceipt.issue !== null)
    missing.push(`no group audit receipt on spec (${s.auditReceipt.issue})`);
  if (s.reviewReceipt.issue !== null)
    missing.push(`no group code-review receipt on spec (${s.reviewReceipt.issue})`);
  return missing.length === 0
    ? {
        rule: 'R-COMPLETE',
        pass: true,
        detail:
          'artifact built + ticket DONE + round closed + receipts (verdict + provenance checked)',
      }
    : { rule: 'R-COMPLETE', pass: false, detail: `artifact built but ${missing.join('; ')}` };
}

/** @purpose Read one file relative to a sandbox; '' when absent (never throws). */
function readRel(sandboxDir: string, rel: string): string {
  try {
    return readFileSync(join(sandboxDir, rel), 'utf8');
  } catch {
    return '';
  }
}

/** @purpose The sandbox's initial provisioning commit sha, or null when it isn't (yet) a git checkout
 *  — `provision.ts` always `git init`s + commits a `chore: initialize eval fixture` root commit, so in
 *  a real provisioned sandbox this is never null; a bare directory (unit tests) gets null. */
function rootCommitSha(sandboxDir: string): string | null {
  try {
    const out = execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      cwd: sandboxDir,
      encoding: 'utf8',
    }).trim();
    return out.split('\n')[0] || null;
  } catch {
    return null;
  }
}

/**
 * @purpose Whether `artifact` was actually PRODUCED, not merely present (V-BATCH-22 verdict B-3): the
 *   `slugify-toolchain` fixture ships its target file already committed at provisioning (commit
 *   `chore: initialize eval fixture`), so "file exists and is non-empty" was satisfied before the
 *   worker did anything at all. Diffs the live working tree against the sandbox's ROOT commit (never
 *   HEAD — the worker may or may not have committed its own change) so real work is detected either way.
 * @invariant Falls back to existence-only when the sandbox is not a git checkout (unit tests / a
 *   directory built by hand) — the git-aware check needs `provision.ts`'s `git init` to mean anything.
 * @param sandboxDir Absolute path to the provisioned scenario sandbox.
 * @param artifact Repo-relative path of the declared artifact.
 * @returns True when the artifact exists and (when git history is available) differs from the root commit.
 */
function artifactWasProduced(sandboxDir: string, artifact: string): boolean {
  if (readRel(sandboxDir, artifact) === '') return false;
  const root = rootCommitSha(sandboxDir);
  if (root === null) return true; // not a git checkout — existence is the only signal available
  try {
    execFileSync('git', ['diff', '--quiet', root, '--', artifact], { cwd: sandboxDir });
    return false; // exit 0 — identical to the initial provisioning commit: no real work happened
  } catch (cause) {
    const err = cause as { status?: number | null };
    return err.status === 1; // exit 1 — genuinely different from provisioning; anything else → inconclusive
  }
}

/** @purpose Marker (open-comment name) each receipt kind's block is wrapped in — mirrors
 *  `shared/sdd/group-receipt.ts`'s `GROUP_RECEIPT_MARKER` (not imported: that map is private there). */
const RECEIPT_MARKER: Readonly<Record<GroupReceiptKind, string>> = {
  audit: 'SDD_AUDIT_RECEIPT',
  review: 'SDD_REVIEW_RECEIPT',
};

/** @purpose Structural type guard for a parsed receipt candidate — every `GroupReceipt` field present
 *  with the right primitive shape (kind is checked against the expected kind by the caller). */
function isReceiptShaped(value: unknown): value is GroupReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.kind === 'string' &&
    typeof r.group === 'string' &&
    Array.isArray(r.members) &&
    r.members.every((m) => typeof m === 'string') &&
    typeof r.gitRef === 'string' &&
    typeof r.verdict === 'string' &&
    typeof r.ts === 'string' &&
    typeof r.signature === 'string'
  );
}

/**
 * @purpose Parse and VALIDATE one group-completion receipt of `kind` on `specContent` — V-BATCH-22
 *   verdict B-3: the prior check was `spec.includes('SDD_AUDIT_RECEIPT')`, a bare substring test that
 *   verified neither an explicit pass verdict nor that the receipt is bound to the actual ticket it
 *   claims to cover (a receipt with `"verdict":"FAIL"`, or one copy-pasted under the wrong marker,
 *   passed identically). This requires: well-formed JSON with every receipt field; `kind` matching the
 *   marker it sits under (catches a pasted receipt reused for both audit and review); an explicit
 *   `"PASS"` verdict (not merely present — any other token, including empty, fails); and, via
 *   `groupReceiptIssue` (the SAME forge/stale defence `shared/sdd/group-receipt.ts`'s `sdd-check`-side
 *   `checkGroupReceipts` uses), that the receipt's signature still matches the ticket's LIVE re-derived
 *   state — a stale or forged receipt is rejected exactly as it would be by `sdd-check` itself.
 * @param specContent Full owning-spec markdown.
 * @param kind Audit or review.
 * @param ticketFile Repo-relative ticket path (only its basename identifies group membership).
 * @param ticketContent Full ticket markdown (the live state the receipt is checked against).
 * @returns `{ issue: null }` when valid and current, else the invalidation reason.
 */
function checkReceipt(
  specContent: string,
  kind: GroupReceiptKind,
  ticketFile: string,
  ticketContent: string
): ReceiptCheck {
  const marker = RECEIPT_MARKER[kind];
  const re = new RegExp(
    `<!--${marker}-->\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`\\n<!--/${marker}-->`
  );
  const m = re.exec(specContent);
  if (!m) return { issue: 'no receipt recorded' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1] as string);
  } catch {
    return { issue: 'receipt block is not valid JSON' };
  }
  if (!isReceiptShaped(parsed)) return { issue: 'receipt block is malformed' };
  if (parsed.kind !== kind)
    return { issue: `receipt kind is "${parsed.kind}", expected "${kind}" (provenance mismatch)` };
  if (parsed.verdict !== 'PASS')
    return { issue: `receipt verdict is "${parsed.verdict}", not an explicit PASS` };

  const derived = deriveGroupState([{ file: ticketFile, content: ticketContent }]);
  const staleIssue = groupReceiptIssue(parsed, derived);
  return { issue: staleIssue };
}

/** @purpose The declared execute target whose completion R-COMPLETE reads from disk. */
type CompletionTargets = {
  /** @purpose Repo-relative path of the ticket's target artifact. */
  artifact: string;
  /** @purpose Repo-relative path of the task ticket. */
  ticket: string;
  /** @purpose Repo-relative path of the owning spec (carries the group receipts). */
  spec: string;
};

/**
 * @purpose Run R-COMPLETE against a finished scenario sandbox by reading the declared target files from
 *   disk — the receipts are group-scoped on the spec, the DONE/round on the ticket. Read, not inferred.
 * @param sandboxDir Absolute path to the provisioned scenario sandbox.
 * @param t The declared completion targets (artifact/ticket/spec, repo-relative).
 * @returns The R-COMPLETE result.
 */
export function checkCompletion(sandboxDir: string, t: CompletionTargets): QualityRuleResult {
  const ticket = readRel(sandboxDir, t.ticket);
  const spec = readRel(sandboxDir, t.spec);
  const logBlock = /<!--SECTION:EXECUTION_LOG-->([\s\S]*?)<!--\/SECTION:EXECUTION_LOG-->/.exec(
    ticket
  );
  return parseCompletion({
    artifactExists: artifactWasProduced(sandboxDir, t.artifact),
    ticketDone: /\*\*Status:\*\*\s*\[[xX]\]/.test(ticket),
    roundClosed: /- \[[xX]\]\s*`[^`]*`\s*DONE/.test(logBlock ? logBlock[1]! : ''),
    auditReceipt: checkReceipt(spec, 'audit', t.ticket, ticket),
    reviewReceipt: checkReceipt(spec, 'review', t.ticket, ticket),
  });
}
