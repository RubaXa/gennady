// @file: Objective quality gate for eval runs — mechanical success rules, not the stochastic judge.
// @consumers: cli; see QUALITY-RULES.ru.md for the rule backlog and the both-outcomes discipline.

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** @purpose One quality rule's objective outcome for a run. */
export type QualityRuleResult = {
  /** @purpose Rule id from QUALITY-RULES.ru.md (e.g. 'R1'). */
  rule: string;
  pass: boolean;
  /** @purpose Short objective evidence (e.g. error count, the checker's summary line). */
  detail: string;
};

/**
 * @purpose Read the pass/fail of R1 (structural integrity) from `sdd-check --all` output.
 * @invariant Pure so it can be tested both ways without running the CLI: a "clean" summary is a
 *   pass; an "N error(s)" summary is a fail carrying the count; anything else is an inconclusive
 *   fail (the checker did not produce a verdict).
 * @param output Combined stdout+stderr of `gennady sdd-check --all .`.
 * @returns The R1 rule result.
 */
export function parseSddCheckResult(output: string): QualityRuleResult {
  const clean = /\bclean\b\s+—\s+\d+\s+file/i.test(output) || /✅\s*clean/i.test(output);
  const errorMatch = /(\d+)\s+error\(s\)/i.exec(output);
  if (errorMatch && Number(errorMatch[1]) > 0) {
    return { rule: 'R1', pass: false, detail: `${errorMatch[1]} sdd-check error(s)` };
  }
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
