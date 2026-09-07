// @file: Pure transitive-closure check for a ticket phase's Rules: list against rule-file <DependsOn> declarations — RULES_CASCADE_CLOSURE (SDD_RULES_CASCADE_UNRESOLVED).
// @consumers: sdd-check.cmd
// @tasks: N/A

import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Finding } from './check.ts';

/**
 * @purpose rule-id → its declared `<DependsOn>` entries, both in the same id space (repo-root-relative POSIX path recommended — the form `<DependsOn>` bullets already use).
 */
export type RuleDepsMap = Map<string, string[]>;

/**
 * @purpose Normalize a phase Rules: bullet's link target to a repo-root-relative POSIX path — the id space `<DependsOn>` entries already use.
 * @invariant Pure path math only; the caller must pass the result to the shared strict repository
 *   identity boundary before any existence/read assumption.
 * @param ticketFile Ticket file path; only its directory anchors the relative link target.
 * @param repoRoot Repository root (absolute or relative to the same base as `ticketFile`).
 * @param linkTarget The Rules: bullet's link target, as parsed by `parsePhaseDetail` (e.g. `../../ai/directives/coding/typescript-rules.xml`).
 * @returns The repo-root-relative path with `/` separators; a forbidden absolute form is preserved
 *   verbatim so the repository identity boundary can reject it without disguising it as traversal.
 */
export function normalizeRulePath(
  ticketFile: string,
  repoRoot: string,
  linkTarget: string
): string {
  // Preserve forbidden absolute forms so the shared repository-file boundary can teach the exact
  // violation. Relativizing them first would disguise an absolute injection as traversal.
  if (isAbsolute(linkTarget) || /^[A-Za-z]:[\\/]/.test(linkTarget)) return linkTarget;
  const abs = resolve(dirname(resolve(ticketFile)), linkTarget);
  return relative(resolve(repoRoot), abs).split(sep).join('/');
}

/**
 * @purpose Parse a rule directive's `<DependsOn>` bullet list into its declared dependency paths.
 * @invariant Pure string parsing — the caller supplies the rule file's already-read content.
 * @param ruleFileContent Full rule-file XML content.
 * @returns Declared paths, verbatim as written; empty when no `<DependsOn>` block is present.
 */
export function parseRuleDependsOn(ruleFileContent: string): string[] {
  const m = /<DependsOn>([\s\S]*?)<\/DependsOn>/.exec(ruleFileContent);
  if (!m?.[1]) return [];
  return [...m[1].matchAll(/^\s*-\s+(\S+)/gm)].map((x) => x[1] as string);
}

/**
 * @purpose Verify a phase's Rules: list is already the transitive `<DependsOn>` closure — every rule's direct + transitive deps must be in the list (`AX_RULES_CASCADE_VERIFICATION`).
 * @invariant Pure — no I/O. Caller resolves rule links (`normalizeRulePath`) and reads every reachable rule's `<DependsOn>` (`parseRuleDependsOn`) into `depsMap` first, same id space.
 * @param file Ticket file path (finding location).
 * @param phaseId Phase id (e.g. `P1`) — carried into the finding message.
 * @param rules The phase's `Rules:` list, in the same id space as `depsMap` keys.
 * @param depsMap rule id → its declared `<DependsOn>` entries; a missing key is treated as "no further deps known".
 * @returns One `SDD_RULES_CASCADE_UNRESOLVED` (error) per missing transitive dependency; empty when the list is already the full closure.
 */
export function checkRulesCascadeClosure(
  file: string,
  phaseId: string,
  rules: string[],
  depsMap: RuleDepsMap
): Finding[] {
  if (rules.length === 0) return [];
  const declared = new Set(rules);
  const seen = new Set<string>();
  const missing = new Set<string>();
  const stack = [...rules];
  while (stack.length) {
    const r = stack.pop() as string;
    if (seen.has(r)) continue;
    seen.add(r);
    for (const dep of depsMap.get(r) ?? []) {
      if (!declared.has(dep)) missing.add(dep);
      if (!seen.has(dep)) stack.push(dep);
    }
  }
  return [...missing].map((dep) => ({
    severity: 'error' as const,
    code: 'SDD_RULES_CASCADE_UNRESOLVED',
    file,
    message: `Phase ${phaseId}: rule dependency "${dep}" is required transitively but is not in the phase's Rules: list — the closure over <DependsOn> is incomplete.`,
  }));
}
