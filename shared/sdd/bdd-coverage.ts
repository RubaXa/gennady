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
 * @purpose Parse one trimmed `- ...` Test Scenario Coverage line.
 * @invariant Matches the `→ \`file\` :: \`case\`` shape and the `Deferred Test Ownership:` variant (§TEST_COVERAGE); anything else is unparseable — null.
 * @param line One trimmed line, already confirmed to start with `-`.
 * @returns The parsed entry, or null when the line matches neither known shape.
 */
function parseCoverageRow(line: string): CoverageEntry | null {
  const deferredM = /^-\s*Deferred Test Ownership:\s*(\S+)\s*(.*)$/.exec(line);
  const deferred = deferredM?.[1] ?? null;
  const rest = deferredM ? (deferredM[2] ?? '') : line.replace(/^-\s*/, '');

  const m = /^(.+?)\s*→\s*`([^`]+)`\s*::\s*(.+?)\.?\s*$/.exec(rest);
  if (!m) return null;

  const scenario = (m[1] ?? '').replace(/`\[[^\]]+\]`|\[[^\]]+\]/g, '').trim();
  const testFile = (m[2] ?? '').trim();
  const caseNames = [...(m[3] ?? '').matchAll(/`([^`]+)`/g)].map((x) => x[1] as string);
  if (!testFile || caseNames.length === 0) return null;

  return { scenario, testFile, caseNames, deferred };
}

/**
 * @purpose Parse the `## Test Scenario Coverage` section body into its rows.
 * @invariant Rows `parseCoverageRow` can't match are skipped — see `findUnparsedCoverageRows` for the "row-shaped but unparseable" cases this silently drops.
 * @param body Section markdown (TEST_COVERAGE anchor content).
 * @returns One CoverageEntry per matched line.
 */
export function parseTestCoverage(body: string): CoverageEntry[] {
  const out: CoverageEntry[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('-')) continue;
    const row = parseCoverageRow(line);
    if (row) out.push(row);
  }
  return out;
}

/**
 * @purpose Find `- ...` lines shaped like a coverage row that `parseCoverageRow` can't match — these silently vanish from `parseTestCoverage`, hiding a scenario.
 * @param body Section markdown (TEST_COVERAGE anchor content).
 * @returns Trimmed line text for each unparseable row, in document order.
 */
export function findUnparsedCoverageRows(body: string): string[] {
  const out: string[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('-')) continue;
    if (!parseCoverageRow(line)) out.push(line);
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
 * @purpose Check each concrete coverage row's case names against its test file, and flag any row deferred to this ticket's own Task-ID.
 * @invariant Pure. `SDD_BDD_SCENARIO_UNTESTED` severity follows `flowVersion` (`v1` warn, `v2` error); `SDD_BDD_DEFERRED_TO_SELF` is always `error` — a self-deferral hides missing coverage, never a real one.
 * @param file Ticket path (finding location).
 * @param entries Parsed coverage rows (`parseTestCoverage`).
 * @param caseNamesByFile Test-file basename → its extracted `it`/`test` case names (adapter-read).
 * @param [flowVersion] The ticket's own flow version — `'v1'` default, the conservative choice.
 * @param [selfTaskId] This ticket's own Task-ID (from its META), or null when unknown/unparseable.
 * @returns One `SDD_BDD_SCENARIO_UNTESTED` per claimed case name not found, plus one `SDD_BDD_DEFERRED_TO_SELF` per row deferred to `selfTaskId`; empty when clean.
 */
export function checkBddCoverage(
  file: string,
  entries: CoverageEntry[],
  caseNamesByFile: Map<string, string[]>,
  flowVersion: FlowVersion = 'v1',
  selfTaskId: string | null = null
): Finding[] {
  const findings: Finding[] = [];
  const severity = flowVersion === 'v2' ? 'error' : 'warn';
  for (const e of entries) {
    if (e.deferred !== null) {
      if (selfTaskId !== null && e.deferred === selfTaskId) {
        findings.push({
          severity: 'error',
          code: 'SDD_BDD_DEFERRED_TO_SELF',
          file,
          message: `Scenario "${e.scenario}" defers test ownership to this ticket's own Task-ID (${selfTaskId}) — that hides missing coverage instead of delegating it to another ticket.`,
        });
      }
      continue;
    }
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

/**
 * @purpose Flag rows `findUnparsedCoverageRows` could not parse — else an unmapped scenario silently stops being checkable.
 * @invariant Pure. Always `warn` — one real row-shaped-but-malformed line, not graded by `flowVersion`.
 * @param file Ticket path (finding location).
 * @param body Section markdown (TEST_COVERAGE anchor content).
 * @returns One `SDD_BDD_COVERAGE_ROW_UNPARSED` per unparseable row, in document order.
 */
export function checkUnparsedCoverageRows(file: string, body: string): Finding[] {
  return findUnparsedCoverageRows(body).map(
    (raw): Finding => ({
      severity: 'warn',
      code: 'SDD_BDD_COVERAGE_ROW_UNPARSED',
      file,
      message: `Test Scenario Coverage row could not be parsed — no "→ \\\`file\\\` :: \\\`case\\\`" and no valid "Deferred Test Ownership: <Task-ID>": "${raw}"`,
    })
  );
}
