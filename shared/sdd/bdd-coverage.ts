// @file: Pure comparison of a ticket's Test Scenario Coverage canonical case names against real it()/test() names — BDD_COVERAGE (SDD_BDD_SCENARIO_UNTESTED). Test-file reads stay in the adapter.
// @consumers: sdd-check.cmd
// @tasks: N/A

import type { Finding } from './check.ts';
import type { FlowVersion } from './flow.ts';

/**
 * @purpose One `## Test Scenario Coverage` row, parsed.
 * @invariant `deferred` carries the owning Task-ID for a `Deferred Test Ownership:` row — informational, never checked against a test file.
 */
export type CoverageEntry = {
  /** @purpose The scenario label text (tag like `[simulation-backed]` stripped). */
  scenario: string;
  /** @purpose Declared test-file basename (e.g. `session-lifecycle.test.ts`). */
  testFile: string;
  /** @purpose Canonical `it`/`test` case names claimed for this scenario (one row may claim several, comma-separated). */
  caseNames: string[];
  /** @purpose Task-ID owning a deferred scenario, or null for a concrete (checkable) row. */
  deferred: string | null;
};

/**
 * @purpose Parse the `## Test Scenario Coverage` section body into its rows.
 * @invariant Matches `- <scenario> [tag] → \`file\` :: \`case\`, \`case2\`` and the `Deferred Test Ownership: <Task-ID>` variant (per `TASK_TICKET_STRUCTURE` §TEST_COVERAGE); other lines are skipped.
 * @param body Section markdown (TEST_COVERAGE anchor content).
 * @returns One CoverageEntry per matched line.
 */
export function parseTestCoverage(body: string): CoverageEntry[] {
  const out: CoverageEntry[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('-')) continue;

    const deferredM = /^-\s*Deferred Test Ownership:\s*(\S+)\s*(.*)$/.exec(line);
    const deferred = deferredM?.[1] ?? null;
    const rest = deferredM ? (deferredM[2] ?? '') : line.replace(/^-\s*/, '');

    const m = /^(.+?)\s*→\s*`([^`]+)`\s*::\s*(.+?)\.?\s*$/.exec(rest);
    if (!m) continue;

    const scenario = (m[1] ?? '').replace(/`\[[^\]]+\]`|\[[^\]]+\]/g, '').trim();
    const testFile = (m[2] ?? '').trim();
    const caseNames = [...(m[3] ?? '').matchAll(/`([^`]+)`/g)].map((x) => x[1] as string);
    if (!testFile || caseNames.length === 0) continue;

    out.push({ scenario, testFile, caseNames, deferred });
  }
  return out;
}

/**
 * @purpose Extract `it(...)`/`test(...)` canonical case-name string literals from a test file.
 * @invariant Regex-based (no AST) — matches `it`/`test` calls including `.only`/`.skip`/`.todo` modifiers; `describe` blocks are not tracked, only the leaf case name matters for BDD matching.
 * @param content Full test-file source.
 * @returns Case names in file order (duplicates possible across separate `it`/`test` calls).
 */
export function extractTestCaseNames(content: string): string[] {
  const out: string[] = [];
  const re = /\b(?:it|test)(?:\.\w+)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const m of content.matchAll(re)) {
    if (m[2] !== undefined) out.push(m[2]);
  }
  return out;
}

/**
 * @purpose Check every concrete (non-deferred) coverage row's canonical case name(s) exist in its declared test file.
 * @invariant Pure. A file absent from `caseNamesByFile` counts as zero cases. Severity by `flowVersion`: `v1` is `warn`, `v2` is `error`.
 * @param file Ticket path (finding location).
 * @param entries Parsed coverage rows (`parseTestCoverage`).
 * @param caseNamesByFile Test-file basename → its extracted `it`/`test` case names (adapter-read).
 * @param [flowVersion] The ticket's own flow version — `'v1'` default, the conservative choice.
 * @returns One `SDD_BDD_SCENARIO_UNTESTED` per claimed case name not found; empty when every concrete row matches.
 */
export function checkBddCoverage(
  file: string,
  entries: CoverageEntry[],
  caseNamesByFile: Map<string, string[]>,
  flowVersion: FlowVersion = 'v1'
): Finding[] {
  const findings: Finding[] = [];
  const severity = flowVersion === 'v2' ? 'error' : 'warn';
  for (const e of entries) {
    if (e.deferred !== null) continue;
    const names = caseNamesByFile.get(e.testFile) ?? [];
    for (const c of e.caseNames) {
      if (!names.includes(c)) {
        findings.push({
          severity,
          code: 'SDD_BDD_SCENARIO_UNTESTED',
          file,
          message: `Scenario "${e.scenario}" claims case "${c}" in ${e.testFile}, but no it()/test() with that exact name was found there.`,
        });
      }
    }
  }
  return findings;
}
