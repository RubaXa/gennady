// @file: Objective quality gate for eval runs — mechanical success rules, not the stochastic judge.
// @consumers: cli; see docs/10-QUALITY-RULES.md for the rule backlog and the both-outcomes discipline.

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** @purpose One quality rule's objective outcome for a run. */
export type QualityRuleResult = {
  /** @purpose Rule id from docs/10-QUALITY-RULES.md (e.g. 'R1'). */
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

/** @purpose The on-disk completion signals for one execute target — read, never inferred. */
type CompletionSignals = {
  /** @purpose Whether the ticket's target artifact exists on disk. */
  artifactExists: boolean;
  /** @purpose Whether the ticket Meta Status is `[x] DONE`. */
  ticketDone: boolean;
  /** @purpose Whether the ticket's Execution Log has a closed (checked) round DONE line. */
  roundClosed: boolean;
  /** @purpose Whether the owning spec carries a CLI-written group audit receipt. */
  auditReceipt: boolean;
  /** @purpose Whether the owning spec carries a CLI-written group code-review receipt. */
  reviewReceipt: boolean;
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
  if (!s.auditReceipt) missing.push('no group audit receipt on spec');
  if (!s.reviewReceipt) missing.push('no group code-review receipt on spec');
  return missing.length === 0
    ? {
        rule: 'R-COMPLETE',
        pass: true,
        detail: 'artifact built + ticket DONE + round closed + receipts',
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
    artifactExists: readRel(sandboxDir, t.artifact) !== '',
    ticketDone: /\*\*Status:\*\*\s*\[[xX]\]/.test(ticket),
    roundClosed: /- \[[xX]\]\s*`[^`]*`\s*DONE/.test(logBlock ? logBlock[1]! : ''),
    auditReceipt: spec.includes('SDD_AUDIT_RECEIPT'),
    reviewReceipt: spec.includes('SDD_REVIEW_RECEIPT'),
  });
}
