// @file: Pure comparison of a ticket's Test Scenario Coverage canonical case names against real it()/test() names — BDD_COVERAGE (SDD_BDD_SCENARIO_UNTESTED). Test-file reads stay in the adapter.
// @consumers: sdd-check.cmd
// @tasks: N/A

import type { Finding } from './check.ts';
import type { FlowVersion } from './flow.ts';
import { DEFERRED_TEST_OWNERSHIP_LITERAL } from './task-authoring-literals.ts';

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
  /** @purpose Exact executable command this scenario proves, or null for non-command behavior. */
  probeCommand: string | null;
};

/** @purpose One BDD scenario's stable requirement links, derived without interpreting semantics. */
type BddRequirementTrace = {
  /** @purpose Scenario name with verification-level and requirement tags removed. */
  scenario: string;
  /** @purpose Exact `<ACR>-REQ-<N>` tokens declared on the Scenario heading. */
  requirementIds: string[];
};

/** @purpose Extract scenario names and explicit Requirement-IDs from a BDD section. */
function parseBddRequirementTraces(body: string): BddRequirementTrace[] {
  return body.split('\n').flatMap((rawLine) => {
    const match = /^\*\*Scenario:\*\*\s*(.+)$/.exec(rawLine.trim());
    if (!match) return [];
    const heading = match[1] as string;
    const requirementIds = [...new Set(heading.match(/[A-Z][A-Z0-9]*-REQ-[0-9]+/g) ?? [])];
    const scenario = heading.replace(/`?\[[^\]]+\]`?/g, '').trim();
    return [{ scenario, requirementIds }];
  });
}

/**
 * @purpose Prove the mechanical BDD → Test Scenario Coverage part of requirement traceability.
 * @invariant Each BDD Requirement-ID occurs verbatim in a canonical coverage case;
 * `checkBddCoverage` requires that exact `it()`/`test()` name in the declared test file.
 * @param file Ticket path used in findings.
 * @param bddBody BDD section body.
 * @param coverageBody Test Scenario Coverage section body.
 * @returns One error per Requirement-ID whose scenario has no coverage case carrying that ID.
 */
export function checkBddRequirementTraceability(
  file: string,
  bddBody: string,
  coverageBody: string
): Finding[] {
  const entries = parseTestCoverage(coverageBody);
  const findings: Finding[] = [];
  for (const trace of parseBddRequirementTraces(bddBody)) {
    const caseRequirementIds = new Set(
      entries
        .filter((entry) => entry.scenario === trace.scenario)
        .flatMap((entry) => entry.caseNames)
        .flatMap((caseName) => caseName.match(/[A-Z][A-Z0-9]*-REQ-[0-9]+/g) ?? [])
    );
    for (const requirementId of trace.requirementIds) {
      if (caseRequirementIds.has(requirementId)) continue;
      findings.push({
        severity: 'error',
        code: 'SDD_BDD_REQUIREMENT_UNTRACED',
        file,
        message:
          `BDD scenario "${trace.scenario}" declares ${requirementId}, but none of its Test Scenario Coverage case names contains that exact Requirement-ID. ` +
          `Fix: map it as "- ${trace.scenario} → \`<test-file>\` :: \`[${requirementId}] <canonical case name>\`" and use that exact name in the real it()/test().`,
      });
    }
  }
  return findings;
}

/** @purpose One test phase's exact Target Files, used to bind BDD evidence and command probes to their execution owner. */
type TestPhaseTargets = {
  /** @purpose Phase identifier from Phases Overview. */
  phaseId: string;
  /** @purpose Exact Target Files declared by that test phase. */
  targets: readonly string[];
};

/**
 * @purpose Resolve which test phases own a declared Test Scenario Coverage file.
 * @invariant Uses the same exact-or-path-suffix matching as authoring validation; callers decide
 * whether zero or multiple owners are errors.
 * @param testFile Declared test-file path from one coverage row.
 * @param phases Test phases and their exact Target Files.
 * @returns Matching phase IDs in input order.
 */
export function matchingTestPhaseIds(
  testFile: string,
  phases: readonly TestPhaseTargets[]
): string[] {
  const declared = testFile.replace(/\\/g, '/');
  return phases.flatMap((phase) => {
    const owns = phase.targets.some((rawTarget) => {
      const target = rawTarget.replace(/\\/g, '/');
      return (
        target === declared || target.endsWith(`/${declared}`) || declared.endsWith(`/${target}`)
      );
    });
    return owns ? [phase.phaseId] : [];
  });
}

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

  const commandSuffix = /\s*::\s*command\s+`([^`]+)`\s*\.?\s*$/.exec(rest);
  const mapping = commandSuffix ? rest.slice(0, commandSuffix.index).trimEnd() : rest;
  const m = /^(.+?)\s*→\s*`([^`]+)`\s*::\s*(.+?)\.?\s*$/.exec(mapping);
  if (!m) return null;

  const scenario = (m[1] ?? '').replace(/`\[[^\]]+\]`|\[[^\]]+\]/g, '').trim();
  const testFile = (m[2] ?? '').trim();
  const caseNames = [...(m[3] ?? '').matchAll(/`([^`]+)`/g)].map((x) => x[1] as string);
  if (!testFile || caseNames.length === 0) return null;

  return {
    scenario,
    testFile,
    caseNames,
    deferred,
    probeCommand: commandSuffix?.[1]?.trim() ?? null,
  };
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
 * @purpose Extract canonical case names from ACTIVE `it(...)`/`test(...)` calls only — a name is
 *   "observed" iff it could actually run.
 * @invariant Regex-based (no AST). Any modifier chain counts as active EXCEPT one containing
 *   `skip`/`todo` (`it.skip`, `test.todo`, `it.skip.each`) — excluded, so it can't silently satisfy
 *   a claimed scenario (B2-22). Runtime `t.skip()` inside a test body is not detected.
 * @param content Full test-file source.
 * @returns Case names of active calls only, in file order (duplicates possible).
 */
export function extractTestCaseNames(content: string): string[] {
  const out: string[] = [];
  const re = /\b(?:it|test)((?:\.\w+)*)\s*\(\s*(['"`])((?:\\.|(?!\2).)*)\2/g;
  for (const m of content.matchAll(re)) {
    if (m[3] === undefined) continue;
    const modifiers = (m[1] ?? '').split('.').filter(Boolean);
    if (modifiers.some((mod) => mod === 'skip' || mod === 'todo')) continue; // inactive — not observed
    out.push(m[3]);
  }
  return out;
}

/**
 * @purpose Resolve a declared test-file reference (basename or path) by suffix match against disk.
 * @invariant `f === norm || f.endsWith('/' + norm)`. Pure — `allFiles` must be forward-slash normalized.
 * @param allFiles Every test-file path on disk, forward-slash normalized.
 * @param declared The ticket's declared test-file reference — basename or path, either separator style.
 * @returns Every file matching the suffix rule (0, 1, or many).
 */
export function resolveTestFileMatches(allFiles: string[], declared: string): string[] {
  const norm = declared.replace(/\\/g, '/');
  const suffix = `/${norm}`;
  return allFiles.filter((f) => f === norm || f.endsWith(suffix));
}

/**
 * @purpose Flag a declared test-file reference resolving to >1 file — case-name lookup can't tell which.
 * @invariant Pure. Always `warn` — ambiguity is a spec-hygiene issue, not proof of missing coverage.
 * @param file Ticket path (finding location).
 * @param testFile The declared test-file reference, as written in the ticket.
 * @param matches The files `resolveTestFileMatches` found for it.
 * @returns One `SDD_BDD_TESTFILE_AMBIGUOUS` when `matches.length > 1`, else empty.
 */
export function checkTestFileAmbiguity(
  file: string,
  testFile: string,
  matches: string[]
): Finding[] {
  if (matches.length <= 1) return [];
  return [
    {
      severity: 'warn',
      code: 'SDD_BDD_TESTFILE_AMBIGUOUS',
      file,
      message: `Declared test-file "${testFile}" matches ${matches.length} files on disk (${matches.join(', ')}) — ambiguous; use a longer path suffix to disambiguate.`,
    },
  ];
}

/**
 * @purpose Check each concrete coverage row's case names against its test file, and flag any row deferred to this ticket's own Task-ID.
 * @invariant Pure. `SDD_BDD_SCENARIO_UNTESTED` severity follows `flowVersion` (`v1` warn, `v2` error); `SDD_BDD_DEFERRED_TO_SELF` is always `error` — a self-deferral hides missing coverage, never a real one.
 * @param file Ticket path (finding location).
 * @param entries Parsed coverage rows (`parseTestCoverage`).
 * @param caseNamesByFile Test-file basename → its extracted `it`/`test` case names (adapter-read).
 * @param [flowVersion] The ticket's own flow version — `'v1'` default, the conservative choice.
 * @param [selfTaskId] This ticket's own Task-ID (from its META), or null when unknown/unparseable.
 * @param [checkExistence] Whether to check case names against `caseNamesByFile` — false pre-DONE
 *   (the test file may not exist yet); self-deferral is still checked regardless.
 * @returns One `SDD_BDD_SCENARIO_UNTESTED` per claimed case name not found (only when `checkExistence`), plus one `SDD_BDD_DEFERRED_TO_SELF` per row deferred to `selfTaskId`; empty when clean.
 */
export function checkBddCoverage(
  file: string,
  entries: CoverageEntry[],
  caseNamesByFile: Map<string, string[]>,
  flowVersion: FlowVersion = 'v1',
  selfTaskId: string | null = null,
  checkExistence = true
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
          message: `Scenario "${e.scenario}" defers test ownership to this ticket's own Task-ID (${selfTaskId}) — that hides missing coverage instead of delegating it to another ticket. Fix: either write the test now and delete this "Deferred Test Ownership" row, or change the Task-ID to the other ticket that will actually own the test.`,
        });
      }
      continue;
    }
    if (!checkExistence) continue;
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
 * @purpose Flag rows `findUnparsedCoverageRows` could not parse — else the scenario silently drops
 *   out of `parseTestCoverage` and no check ever looks at it again (B2-22: unknown, not closed).
 * @invariant Pure. Graded by `flowVersion` like `checkBddCoverage`: `v1` warn (keeps the existing
 *   140-row baseline `GAP-B-1` warn, zero new errors), `v2` error (fail-closed post-migration).
 * @param file Ticket path (finding location).
 * @param body Section markdown (TEST_COVERAGE anchor content).
 * @param [flowVersion] Ticket's own flow version — `'v1'` default, the baseline-safe choice.
 * @returns One `SDD_BDD_COVERAGE_ROW_UNPARSED` per unparseable row, in document order.
 */
export function checkUnparsedCoverageRows(
  file: string,
  body: string,
  flowVersion: FlowVersion = 'v1'
): Finding[] {
  const severity = flowVersion === 'v2' ? 'error' : 'warn';
  return findUnparsedCoverageRows(body).map(
    (raw): Finding => ({
      severity,
      code: 'SDD_BDD_COVERAGE_ROW_UNPARSED',
      file,
      message: `Test Scenario Coverage row could not be parsed: "${raw}". Replace the whole row with either "- <scenario name> → \\\`<test-file>\\\` :: \\\`<canonical case name>\\\`" or "${DEFERRED_TEST_OWNERSHIP_LITERAL}".`,
    })
  );
}
