// @file: Objective quality gate for eval runs — mechanical success rules, not the stochastic judge.
// @spec: AI-SKILLS
// @consumers: cli; see docs/EVAL-SPEC.md for the rule backlog and the both-outcomes discipline.

import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { checkSpecAuthoringDraft, checkSpecHierarchy } from '../../shared/sdd/check.ts';
import { extractSection } from '../../shared/sdd/section.ts';
import { MARKED_DONE_LINE_RE, parseExecutionLog } from '../../shared/sdd/execution-log.ts';
import { SCOPE_KINDS } from '../../shared/sdd/templates.ts';
import { proveRepoFile, readProvenRepoFile } from '../../shared/common/repo-file-identity.ts';
import {
  deriveGroupState,
  groupReceiptIssue,
  type GroupReceipt,
  type GroupReceiptKind,
} from '../../shared/sdd/group-receipt.ts';

const execFileAsync = promisify(execFile);

/** @purpose Read-only pre-Approval-1 readiness, not whole-project/ticket completion.
 * Every declared artifact must be safe, complete and free of authoring findings (including hints).
 * No auto-fix is called: the oracle never repairs the artifact it grades. */
export function checkAuthoringReadiness(
  sandboxDir: string,
  targets: readonly string[]
): QualityRuleResult {
  const fail = (detail: string): QualityRuleResult => ({ rule: 'R1-A', pass: false, detail });
  if (!targets.length || new Set(targets).size !== targets.length)
    return fail('missing or duplicate scenario-owned authoring targets');
  const identities = new Set<string>();
  const ids = new Set<string>();
  const specs: Array<{ file: string; content: string; flowVersion: 'v2' }> = [];
  let count = 0;
  for (const target of targets) {
    if (!target.endsWith('.spec.md')) return fail('authoring target is not a spec');
    const proof = proveRepoFile(sandboxDir, target);
    if (!proof.ok) return fail(`${target}: ${proof.detail}`);
    if (identities.has(proof.identity.relative)) return fail('duplicate canonical spec target');
    identities.add(proof.identity.relative);
    const observed = readProvenRepoFile(proof.identity);
    if (!observed.ok) return fail(`${target}: ${observed.detail}`);
    const identity = extractSection(observed.content, 'SPEC_ID');
    const id = identity.status === 'ok' ? identity.content.trim() : '';
    if (!id || !/^[^\s<>]+$/.test(id) || ids.has(id))
      return fail(`${target}: missing, malformed or duplicate SPEC_ID`);
    ids.add(id);
    const scope = extractSection(observed.content, 'SCOPE_TYPE');
    const module = extractSection(observed.content, 'MODULE_VISION');
    const scopeKinds =
      scope.status === 'ok'
        ? SCOPE_KINDS.filter((kind) => new RegExp(`\\b${kind}\\b`).test(scope.content))
        : [];
    if (
      !(
        (module.status === 'ok' && scope.status === 'not_found') ||
        (module.status === 'not_found' && scope.status === 'ok' && scopeKinds.length === 1)
      )
    )
      return fail(`${target}: no unambiguous canonical scope/module kind`);
    const findings = checkSpecAuthoringDraft(target, observed.content);
    if (findings.length)
      return fail(`${target}: ${findings.map((finding) => finding.code).join(', ')}`);
    specs.push({ file: proof.identity.relative, content: observed.content, flowVersion: 'v2' });
    count++;
  }
  const hierarchy = checkSpecHierarchy(specs);
  if (hierarchy.length) return fail(hierarchy.map((finding) => finding.code).join(', '));
  return {
    rule: 'R1-A',
    pass: true,
    detail: `${count} exact specs ready; read-only authoring checks`,
  };
}

/** @purpose One quality rule's objective outcome for a run. */
export type QualityRuleResult = {
  /** @purpose Rule id from docs/EVAL-SPEC.md (e.g. 'R1'). */
  rule: string;
  pass: boolean;
  /** @purpose Short objective evidence (e.g. error count, the checker's summary line). */
  detail: string;
};

/** @purpose Persist an explicit mechanical bar for task scenarios with source-owned checkpoints.
 * No declared checkpoint means no quality claim; a trace alone is not artifact correctness. */
export function checkCheckpointResults(
  checkpoints: readonly { id: string; green: boolean }[]
): QualityRuleResult | undefined {
  if (!checkpoints.length) return undefined;
  const failed = checkpoints
    .filter((checkpoint) => !checkpoint.green)
    .map((checkpoint) => checkpoint.id);
  return {
    rule: 'CHECKPOINTS',
    pass: failed.length === 0,
    detail: failed.length
      ? `failed: ${failed.join(', ')}`
      : `${checkpoints.length} source-owned terminal checkpoints passed`,
  };
}

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
      timeout: 30_000,
    });
    return parseSddCheckResult(`${stdout}\n${stderr}`);
  } catch (cause) {
    // Non-zero exit (errors present) still carries the summary on stdout/stderr — parse it.
    const shell = cause as { stdout?: string; stderr?: string; message?: string };
    const text = `${shell.stdout ?? ''}\n${shell.stderr ?? ''}`.trim();
    return text
      ? {
          rule: 'R1',
          pass: false,
          detail: `checker exited nonzero: ${parseSddCheckResult(text).detail}`,
        }
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

/** @purpose Require the latest canonical round's real dated close, never a phase DONE or an older round. */
function latestRoundClosed(ticket: string): boolean {
  const round = parseExecutionLog(ticket)?.rounds.at(-1);
  const done = round?.close?.done;
  return Boolean(
    done &&
    MARKED_DONE_LINE_RE.test(done.raw) &&
    done.ts &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(done.ts) &&
    Number.isFinite(Date.parse(done.ts)) &&
    round?.close?.extra.length === 0 &&
    round.trailing.length === 0
  );
}

/** @purpose Validate local ticket/round/group-receipt closure without claiming a produced artifact or operator approval.
 * @param ticketFile Exact member ticket identity.
 * @param ticket Ticket snapshot from the host-owned capture.
 * @param spec Owning spec snapshot carrying signed group receipts.
 * @returns Workflow metadata proof only; callers must separately require functional and actual phase proof. Never replaces R-COMPLETE for ordinary execute tasks.
 */
export function checkLocalWorkflowClosure(
  ticketFile: string,
  ticket: string,
  spec: string
): QualityRuleResult {
  const result = parseCompletion({
    artifactExists: true,
    ticketDone: /\*\*Status:\*\*\s*\[[xX]\]/.test(ticket),
    roundClosed: latestRoundClosed(ticket),
    auditReceipt: checkReceipt(spec, 'audit', ticketFile, ticket),
    reviewReceipt: checkReceipt(spec, 'review', ticketFile, ticket),
  });
  return {
    rule: 'LOCAL-WORKFLOW-CLOSURE',
    pass: result.pass,
    detail: result.pass
      ? 'local DONE/round/group receipt metadata valid; NOT produced-code, semantic review or operator approval proof'
      : result.detail.replace('artifact built but ', 'local workflow incomplete: '),
  };
}

/**
 * @purpose Run R-COMPLETE against a finished scenario sandbox; code production, ticket/round and real group receipts remain required.
 * @param sandboxDir Absolute provisioned scenario sandbox.
 * @param t Declared artifact/ticket/spec targets.
 * @returns Existing objective completion proof, never replaced by the local metadata-only helper.
 */
export function checkCompletion(sandboxDir: string, t: CompletionTargets): QualityRuleResult {
  const ticket = readRel(sandboxDir, t.ticket);
  const spec = readRel(sandboxDir, t.spec);
  return parseCompletion({
    artifactExists: artifactWasProduced(sandboxDir, t.artifact),
    ticketDone: /\*\*Status:\*\*\s*\[[xX]\]/.test(ticket),
    roundClosed: latestRoundClosed(ticket),
    auditReceipt: checkReceipt(spec, 'audit', t.ticket, ticket),
    reviewReceipt: checkReceipt(spec, 'review', t.ticket, ticket),
  });
}
