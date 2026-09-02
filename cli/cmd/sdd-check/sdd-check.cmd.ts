// @file: SddCheckCommand — CLI entry for gennady sdd-check: mechanical audit of one ticket (--task) or the whole project (--all).
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, readdirSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, isAbsolute, join, resolve, relative, dirname, sep } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  proveRepoFile,
  readProvenRepoFile,
  writeProvenRepoFile,
} from '../../../shared/common/repo-file-identity.ts';
import {
  getChangedSourceFiles,
  getHeadContent,
  readHeadContent,
} from '../../../shared/common/changed-files.ts';
import {
  checkTicket,
  checkTicketAuthoringStructure,
  isTicket,
  isLegacyTicket,
  checkLegacyTicket,
  checkPortal,
  checkTaskGraph,
  checkTrackers,
  checkSpecStructure,
  checkSpecAuthoringDraft,
  autoFixSpecAuthoringDraft,
  checkSpecLanguage,
  checkTaskIdGrammar,
  checkModuleGraph,
  checkScopeDeps,
  checkSpecHierarchy,
  checkResearchOrphans,
  checkResearchLifecycle,
  checkRequirementIds,
  checkDecisionLogIds,
  checkRequirementUnhappyPath,
  checkDiagramCaptions,
  checkScopeDataFlowDiagram,
  checkModuleCallChain,
  findResearchLinks,
  findRegisteredResearchLinks,
  moduleGraphEdges,
  ticketRef,
  legacyTicketRef,
  type Finding,
  type TicketRef,
  type TrackerRowRef,
  type SpecEntry,
} from '../../../shared/sdd/check.ts';
import { checkRequirementBudgetsAgainstBaseline } from '../../../shared/sdd/requirement-budget.ts';
import type { GraphEdge } from '../../../shared/sdd/portal.ts';
import { parseScopes, parseGraphEdges } from '../../../shared/sdd/portal.ts';
import {
  detectFlowVersion,
  detectScopeFlowVersion,
  type FlowVersion,
} from '../../../shared/sdd/flow.ts';
import { checkSpecMermaid } from '../../../shared/sdd/mermaid-check.ts';
import { parseTrackerRows } from '../../../shared/sdd/tracker.ts';
import { extractSection, findSectionBounds } from '../../../shared/sdd/section.ts';
import {
  parseMetaInfo,
  parsePhaseDetail,
  parsePhasesOverview,
  parseTicketCoveragePolicy,
  parseVerificationTable,
} from '../../../shared/sdd/ticket.ts';
import {
  checkRulesCascadeClosure,
  normalizeRulePath,
  parseRuleDependsOn,
  type RuleDepsMap,
} from '../../../shared/sdd/rules-cascade.ts';
import { checkTasksAppendOnly } from '../../../shared/sdd/tasks-append-only.ts';
import {
  checkConsumersResolvable,
  classifyConsumerEntry,
  parseConsumersHeader,
} from '../../../shared/sdd/consumers-resolvable.ts';
import {
  checkBddCoverage,
  checkTestFileAmbiguity,
  checkUnparsedCoverageRows,
  extractTestCaseNames,
  parseTestCoverage,
  resolveTestFileMatches,
} from '../../../shared/sdd/bdd-coverage.ts';
import { resolveTicketArg, resolutionLine } from '../../../shared/sdd/ticket-resolve.ts';
import { looksLikeTaskId } from '../../../shared/sdd/task-id.ts';
import {
  resolveScopeDecomposition,
  resolveTaskOutputOwnership,
} from '../../../shared/sdd/module-specs.ts';
import { resolveOwningSpec, validateTicketReviewPaths } from '../../../shared/sdd/audit-group.ts';
import {
  ambiguousIdError,
  badInvocation,
  fileError,
  formatFindings,
  gitEvidenceError,
  readFailed,
  ERR_CLI_SDD_CHECK_READ_FAILED,
  unknownIdError,
  type CheckResult,
} from './sdd-check.types.ts';
import { checkPhaseReceipts } from './phase-receipt-check.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
]);

/** @purpose Exact failed filesystem observation retained by the general audit instead of being collapsed into absence. */
type ReadIssue = { path: string; reason: string };

/** @purpose Successful content or one exact failed read observation. */
type ReadObservation<T> = { ok: true; value: T } | { ok: false; issue: ReadIssue };

/** @purpose Preserve a compact single-line filesystem diagnostic. */
function readReason(cause: unknown): string {
  const error = cause as NodeJS.ErrnoException;
  return [error.code, error.message || String(cause)]
    .filter(Boolean)
    .join(': ')
    .replace(/\s+/g, ' ');
}

/** @purpose Read UTF-8 without conflating I/O failure with empty or absent content. */
function readUtf8(path: string): ReadObservation<string> {
  try {
    return { ok: true, value: readFileSync(path, 'utf-8') };
  } catch (cause) {
    return { ok: false, issue: { path, reason: readReason(cause) } };
  }
}

/** @purpose Add one fail-closed read finding without duplicating a path already reported by this run. */
function addReadIssue(findings: Finding[], issue: ReadIssue): void {
  if (
    findings.some(
      (finding) => finding.code === ERR_CLI_SDD_CHECK_READ_FAILED && finding.file === issue.path
    )
  )
    return;
  findings.push({
    severity: 'error',
    code: ERR_CLI_SDD_CHECK_READ_FAILED,
    file: issue.path,
    message: `Selected SDD evidence could not be read: ${issue.reason}`,
  });
}

/** @purpose Prove that one explicitly selected general-audit root is a real directory reached without a symlink alias. */
function selectedRootIssue(path: string): ReadIssue | null {
  const absolute = resolve(path);
  try {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) return { path, reason: 'selected root is a symlink' };
    if (!stat.isDirectory()) return { path, reason: 'selected root is not a directory' };
    // Relative selections have a meaningful trust anchor (cwd), so aliases in any selected
    // component are rejectable. An absolute path can legitimately enter macOS temp space through
    // the system `/var` → `/private/var` alias; for that grammar lstat still rejects the selected
    // leaf, while the SDD walker proves every descendant component independently.
    if (!isAbsolute(path) && path !== '.' && realpathSync(absolute) !== absolute) {
      return { path, reason: 'selected root path traverses a symlink component' };
    }
    return null;
  } catch (cause) {
    return { path, reason: readReason(cause) };
  }
}

/** @purpose Recursively collect .md files; an optional issue sink makes general modes fail closed while review keeps its own diagnostics. */
function walkMd(dir: string, acc: string[], issues?: ReadIssue[]): void {
  try {
    const stat = lstatSync(dir);
    if (stat.isSymbolicLink()) {
      issues?.push({ path: dir, reason: 'selected SDD directory is a symlink' });
      return;
    }
    if (!stat.isDirectory()) {
      issues?.push({ path: dir, reason: 'selected SDD path is not a directory' });
      return;
    }
  } catch (cause) {
    issues?.push({ path: dir, reason: readReason(cause) });
    return;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (cause) {
    issues?.push({ path: dir, reason: readReason(cause) });
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      issues?.push({ path: full, reason: 'selected SDD evidence is a symlink' });
      continue;
    }
    if (entry.isDirectory()) walkMd(full, acc, issues);
    else if (entry.isFile() && entry.name.endsWith('.md')) acc.push(full);
  }
}

/** @purpose Check that every `](…spec.md)` link in a spec resolves on disk. */
function checkSpecLinks(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const dir = dirname(file);
  for (const m of content.matchAll(/\]\(([^)`#]+\.spec\.md)(?:#[^)]*)?\)/g)) {
    const target = m[1];
    if (!target) continue;
    if (!existsSync(resolve(dir, target))) {
      findings.push({
        severity: 'error',
        code: 'SDD_BROKEN_SPEC_LINK',
        file,
        message: `Referenced spec does not resolve on disk: ${target}. Fix: create the spec at that path, or correct the link target.`,
      });
    }
  }
  return findings;
}

/** @purpose Check that every `](…research.md)` link in any spec/ticket/research doc resolves on disk (SDD_RESEARCH_REF_BROKEN) — checkSpecLinks mirror for research-doc references. | @param file File path (spec, ticket, or research doc). | @param content File markdown. | @returns Findings for unresolved research-doc links. */
function checkResearchRefs(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const dir = dirname(file);
  for (const target of findResearchLinks(content)) {
    if (!existsSync(resolve(dir, target))) {
      findings.push({
        severity: 'error',
        code: 'SDD_RESEARCH_REF_BROKEN',
        file,
        message: `Referenced research doc does not resolve on disk: ${target}. Fix: create the research doc at that path, or correct the link target.`,
      });
    }
  }
  return findings;
}

/** @purpose Optional authoring slice for rule evidence checks. */
type RuleCheckSelection = {
  /** @purpose Exact phases to inspect; absent means every overview phase. */
  phaseIds?: readonly string[];
  /** @purpose Address failures to the ticket's phase Rules block rather than the missing rule path. */
  authoring?: boolean;
};

/** @purpose Absolute one-based ticket line inside one phase, falling back to its section marker. */
function phaseRuleLine(content: string, phaseId: string, needle = '**Rules:**'): number {
  const bounds = findSectionBounds(content, `PHASE_${phaseId}`);
  if (!bounds) return 1;
  const lines = content.split('\n');
  for (let index = bounds.openLine + 1; index < bounds.closeLine; index++) {
    if ((lines[index] ?? '').includes(needle)) return index + 1;
  }
  return bounds.openLine + 1;
}

/** @purpose Parse only the requested phases through the canonical overview/phase parsers. */
function selectedRulePhases(
  content: string,
  phaseIds?: readonly string[]
): { id: string; rules: string[] }[] {
  const overview = extractSection(content, 'PHASES_OVERVIEW');
  if (overview.status !== 'ok') return [];
  const selected = phaseIds ? new Set(phaseIds) : null;
  return parsePhasesOverview(overview.content).flatMap((phase) => {
    if (selected && !selected.has(phase.id)) return [];
    const section = extractSection(content, `PHASE_${phase.id}`);
    return section.status === 'ok'
      ? [{ id: phase.id, rules: parsePhaseDetail(section.content).rules }]
      : [];
  });
}

/** @purpose Prove and safely read every direct `](….xml)` rule link through the same repository identity boundary used by its transitive dependencies. | @param file Ticket path. | @param content Ticket markdown. | @param repoRoot Canonical trust root for every rule identity. | @param [selection] Optional exact authoring phase slice. | @returns Typed read findings for missing, unsafe, special, symlinked, or unreadable rule evidence. */
function checkRuleLinks(
  file: string,
  content: string,
  repoRoot: string,
  selection?: RuleCheckSelection
): Finding[] {
  const findings: Finding[] = [];
  if (selection) {
    for (const phase of selectedRulePhases(content, selection.phaseIds)) {
      for (const target of phase.rules.filter((rule) => rule.endsWith('.xml'))) {
        const ruleId = normalizeRulePath(file, repoRoot, target);
        const observed = getRuleDeps(repoRoot, ruleId);
        if (observed.ok) continue;
        if (!selection.authoring) {
          addReadIssue(findings, observed.issue);
          continue;
        }
        findings.push({
          severity: 'error',
          code: ERR_CLI_SDD_CHECK_READ_FAILED,
          file,
          line: phaseRuleLine(content, phase.id, target),
          message: `[PHASE_${phase.id}] Fix: create or correct the direct rule link "${target}" so exact rule "${ruleId}" is a readable repo-local file. Detail: ${observed.issue.reason}.`,
        });
      }
    }
    return findings;
  }
  for (const m of content.matchAll(/\]\(([^)`#]+\.xml)(?:#[^)]*)?\)/g)) {
    const target = m[1];
    if (!target) continue;
    const ruleId = normalizeRulePath(file, repoRoot, target);
    const observed = getRuleDeps(repoRoot, ruleId);
    if (!observed.ok) addReadIssue(findings, observed.issue);
  }
  return findings;
}

// Cache: rule-file id (repo-root-relative path) → its declared <DependsOn> entries. Rule files are
// shared across many tickets in a --all run; read each one at most once.
const ruleDepsCache = new Map<string, ReadObservation<string[]>>();

/** @purpose Prove, identity-bind, safely read, and parse one rule file's `<DependsOn>` entries without conflating unsafe/I/O failure with a genuine empty declaration. | @param repoRoot Repository root. | @param ruleId Exact repo-root-relative rule-file path. | @returns Declared dependency ids, or the exact failed observation. */
function getRuleDeps(repoRoot: string, ruleId: string): ReadObservation<string[]> {
  const cacheKey = `${resolve(repoRoot)}\0${ruleId}`;
  const cached = ruleDepsCache.get(cacheKey);
  if (cached) return cached;
  const proven = proveRepoFile(repoRoot, ruleId);
  if (!proven.ok) {
    const failed: ReadObservation<string[]> = {
      ok: false,
      issue: {
        path: ruleId,
        reason: `rule '${ruleId}' is not trusted repository evidence: ${proven.detail}`,
      },
    };
    ruleDepsCache.set(cacheKey, failed);
    return failed;
  }
  const observed = readProvenRepoFile(proven.identity);
  if (!observed.ok) {
    const failed: ReadObservation<string[]> = {
      ok: false,
      issue: {
        path: proven.identity.relative,
        reason: `rule '${ruleId}' dependency evidence is unreadable: ${observed.detail}`,
      },
    };
    ruleDepsCache.set(cacheKey, failed);
    return failed;
  }
  const result: ReadObservation<string[]> = {
    ok: true,
    value: parseRuleDependsOn(observed.content),
  };
  ruleDepsCache.set(cacheKey, result);
  return result;
}

/** @purpose Expand a seed rule-id set into the full reachable `<DependsOn>` graph, retaining every failed rule observation. | @param repoRoot Repository root. | @param seeds A phase's Rules: ids (normalized). | @returns Complete readable graph plus exact I/O issues; failed nodes are never treated as proven leaves. */
function buildRuleDepsMap(
  repoRoot: string,
  seeds: string[]
): { map: RuleDepsMap; issues: ReadIssue[] } {
  const map: RuleDepsMap = new Map();
  const issues: ReadIssue[] = [];
  const stack = [...seeds];
  while (stack.length) {
    const id = stack.pop() as string;
    if (map.has(id)) continue;
    const observed = getRuleDeps(repoRoot, id);
    if (!observed.ok) {
      issues.push(observed.issue);
      continue;
    }
    const deps = observed.value;
    map.set(id, deps);
    for (const d of deps) if (!map.has(d)) stack.push(d);
  }
  return { map, issues };
}

/** @purpose RULES_CASCADE_CLOSURE for one ticket — per phase, verify the Rules: list is already the transitive `<DependsOn>` closure. | @param file Ticket path. | @param content Ticket markdown. | @param repoRoot Repository root (anchors rule-link resolution). | @param [selection] Optional exact authoring phase slice. | @returns SDD_RULES_CASCADE_UNRESOLVED findings, if any. */
function checkTicketRulesCascade(
  file: string,
  content: string,
  repoRoot: string,
  selection?: RuleCheckSelection
): Finding[] {
  const findings: Finding[] = [];
  for (const phase of selectedRulePhases(content, selection?.phaseIds)) {
    const ruleIds = phase.rules
      .filter((rule) => rule.endsWith('.xml'))
      .map((rule) => normalizeRulePath(file, repoRoot, rule));
    if (ruleIds.length === 0) continue;
    const deps = buildRuleDepsMap(repoRoot, ruleIds);
    // Direct entries were already validated by checkRuleLinks. Report only dependency-only nodes
    // here, so one failed identity produces one diagnostic while omitted transitive evidence still
    // fails closed.
    for (const issue of deps.issues) {
      if (ruleIds.includes(issue.path)) continue;
      if (!selection?.authoring) {
        addReadIssue(findings, issue);
        continue;
      }
      findings.push({
        severity: 'error',
        code: ERR_CLI_SDD_CHECK_READ_FAILED,
        file,
        line: phaseRuleLine(content, phase.id),
        message: `[PHASE_${phase.id}] Fix: create or correct transitive rule "${issue.path}" required by this Rules cascade, then list it in Rules. Detail: ${issue.reason}.`,
      });
    }
    const closure = checkRulesCascadeClosure(file, phase.id, ruleIds, deps.map);
    if (!selection?.authoring) {
      findings.push(...closure);
      continue;
    }
    for (const finding of closure) {
      const dependency = /rule dependency "([^"]+)"/.exec(finding.message)?.[1] ?? '<dependency>';
      if (deps.issues.some((issue) => !ruleIds.includes(issue.path) && issue.path === dependency))
        continue;
      const href = relative(dirname(file), resolve(repoRoot, dependency)).split(sep).join('/');
      findings.push({
        ...finding,
        line: phaseRuleLine(content, phase.id),
        message: `[PHASE_${phase.id}] Fix: add "- [rule](${href})" for exact dependency "${dependency}" to this phase's Rules list.`,
      });
    }
  }
  return findings;
}

/**
 * @purpose All test-file paths under a repo root, forward-slash normalized — what
 *   `resolveTestFileMatches` matches a declared test-file reference against.
 */
type TestFileIndex = string[];

// Cache: repoRoot → every test-file path (forward-slash normalized). Built once per run by a bounded
// walk (source-only extensions), reused by every ticket's BDD_COVERAGE lookup in a --all run.
const testFileIndexCache = new Map<string, TestFileIndex>();
// Cache: absolute test-file path → extracted it()/test() case names.
const testCaseNamesCache = new Map<string, string[]>();

/** @purpose Build (once) the flat, forward-slash-normalized list of `*.test.*`/`*.spec.*` files under `repoRoot`, for suffix matching. | @param repoRoot Repository root. | @returns The memoized flat list. */
function getTestFileIndex(repoRoot: string): TestFileIndex {
  const cached = testFileIndexCache.get(repoRoot);
  if (cached) return cached;
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      // Source walk: unlike the markdown walk (SKIP_DIRS), `__tests__` is exactly where test files
      // live — must not be skipped here.
      if (
        entry.name.startsWith('.') ||
        (SKIP_DIRS.has(entry.name) && entry.name !== '__tests__') ||
        entry.isSymbolicLink()
      )
        continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.(test|spec)\.(ts|tsx|js)$/.test(entry.name)) files.push(full);
    }
  };
  walk(repoRoot);
  const idx = files.map((f) => f.split(sep).join('/'));
  testFileIndexCache.set(repoRoot, idx);
  return idx;
}

/** @purpose Read + extract case names of one test file, memoized. | @param absPath Absolute test-file path. | @returns Extracted `it`/`test` case names; empty when unreadable. */
function getTestCaseNames(absPath: string): string[] {
  const cached = testCaseNamesCache.get(absPath);
  if (cached) return cached;
  let content = '';
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    // fall through with empty content
  }
  const names = extractTestCaseNames(content);
  testCaseNamesCache.set(absPath, names);
  return names;
}

/** @purpose BDD_COVERAGE for one ticket — canonical case names in Test Scenario Coverage vs real it()/test() names, self-deferral, and unparsed rows. | @invariant A TODO ticket may name a future test file, but once that file exists its canonical cases are checked immediately; DONE also fails when the declared file is absent. Format checks run regardless. | @param file Ticket path. | @param content Ticket markdown. | @param repoRoot Repository root (anchors the test-file basename search + flow-version detection). | @returns SDD_BDD_SCENARIO_UNTESTED (severity by the ticket's own flow version), SDD_BDD_TESTFILE_AMBIGUOUS, SDD_BDD_DEFERRED_TO_SELF, and SDD_BDD_COVERAGE_ROW_UNPARSED findings, if any. */
function checkTicketBddCoverage(file: string, content: string, repoRoot: string): Finding[] {
  const sec = extractSection(content, 'TEST_COVERAGE');
  if (sec.status !== 'ok') return [];
  const findings = checkUnparsedCoverageRows(file, sec.content);
  const entries = parseTestCoverage(sec.content);
  if (entries.length === 0) return findings;

  const metaSec = extractSection(content, 'META');
  const meta = metaSec.status === 'ok' ? parseMetaInfo(metaSec.content) : null;
  const selfTaskId = meta?.taskId ?? null;
  const isDone = /\bDONE\b/i.test(meta?.status ?? '');

  const caseNamesByFile = new Map<string, string[]>();
  const checkableEntries: typeof entries = [];
  const idx = getTestFileIndex(repoRoot);
  for (const e of entries) {
    if (e.deferred !== null) continue;
    const matches = resolveTestFileMatches(idx, e.testFile);
    if (matches.length === 0 && !isDone) continue;
    checkableEntries.push(e);
    if (caseNamesByFile.has(e.testFile)) continue;
    findings.push(...checkTestFileAmbiguity(file, e.testFile, matches));
    caseNamesByFile.set(
      e.testFile,
      matches.flatMap((m) => getTestCaseNames(m))
    );
  }
  findings.push(
    ...checkBddCoverage(
      file,
      entries,
      caseNamesByFile,
      ticketFlowVersion(file, repoRoot),
      selfTaskId,
      false
    ),
    ...checkBddCoverage(
      file,
      checkableEntries,
      caseNamesByFile,
      ticketFlowVersion(file, repoRoot),
      null,
      true
    )
  );
  return findings;
}

/** @purpose Validate the explicit ticket coverage applicability without inferring platform or paths. */
function checkTicketCoveragePolicy(file: string, content: string): Finding[] {
  const verification = extractSection(content, 'VERIFICATION');
  if (verification.status !== 'ok') return [];
  const table = parseVerificationTable(verification.content);
  const markerIndex = content.indexOf('<!--SECTION:VERIFICATION-->');
  const line = markerIndex < 0 ? undefined : content.slice(0, markerIndex).split('\n').length;
  if (!table.ok) {
    return [
      {
        severity: 'error',
        code: 'SDD_VERIFICATION_TABLE_INVALID',
        file,
        ...(line === undefined ? {} : { line }),
        message: table.issues.join('; '),
      },
    ];
  }
  const policy = parseTicketCoveragePolicy(verification.content);
  if (policy.status === 'legacy') return []; // Exact grandfather rule: no v1 marker/fields/role.
  if (policy.status === 'invalid') {
    return [
      {
        severity: 'error',
        code: 'SDD_COVERAGE_POLICY_INVALID',
        file,
        ...(line === undefined ? {} : { line }),
        message: policy.issues.join('; '),
      },
    ];
  }
  if (policy.status === 'required') {
    const overview = extractSection(content, 'PHASES_OVERVIEW');
    const owners =
      overview.status === 'ok'
        ? parsePhasesOverview(overview.content).filter((phase) => phase.id === policy.ownerPhase)
        : [];
    if (owners.length !== 1 || owners[0]?.kind.trim().toLowerCase() !== 'test') {
      return [
        {
          severity: 'error',
          code: 'SDD_COVERAGE_OWNER_INVALID',
          file,
          ...(line === undefined ? {} : { line }),
          message: `Coverage Owner Phase ${policy.ownerPhase} must resolve to exactly one test phase.`,
        },
      ];
    }
    const ownerSection = extractSection(content, `PHASE_${policy.ownerPhase}`);
    if (ownerSection.status !== 'ok') {
      return [
        {
          severity: 'error',
          code: 'SDD_COVERAGE_OWNER_INVALID',
          file,
          ...(line === undefined ? {} : { line }),
          message: `Coverage Owner Phase ${policy.ownerPhase} has no readable PHASE_${policy.ownerPhase} section.`,
        },
      ];
    }
    const ownerRules = new Set(
      parsePhaseDetail(ownerSection.content).rules.flatMap((rule) => [
        rule,
        basename(rule).replace(/\.xml$/i, ''),
      ])
    );
    const coverageRows = table.gates.filter((gate) => gate.role === 'coverage');
    const coverageReader = coverageRows[0];
    if (
      coverageReader &&
      /^(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+test:coverage(?:\s|$)/.test(
        coverageReader.command.trim()
      )
    ) {
      return [
        {
          severity: 'error',
          code: 'SDD_COVERAGE_READER_RERUNS_PRODUCER',
          file,
          ...(line === undefined ? {} : { line }),
          message:
            'Role=coverage must read/check the report produced by test:coverage; it must not invoke the test:coverage producer again.',
        },
      ];
    }
    if (!coverageReader?.requiredBy.some((rule) => ownerRules.has(rule))) {
      return [
        {
          severity: 'error',
          code: 'SDD_COVERAGE_READER_OWNER_MISMATCH',
          file,
          ...(line === undefined ? {} : { line }),
          message: `The one Role=coverage reader must be Required by a rule declared by owner phase ${policy.ownerPhase}.`,
        },
      ];
    }
  }
  return [];
}

/**
 * @purpose CONSUMERS_RESOLVABLE for one file — crude text-search grep per entry, why it's warn-only.
 * @param relPath File path relative to repoRoot (finding location).
 * @param content File source.
 * @param repoRoot Repository root.
 * @param absPath Absolute path of the file (excluded from its own resolution search).
 * @returns SDD_CONSUMERS_UNRESOLVED findings, if any.
 */
function checkFileConsumersResolvable(
  relPath: string,
  content: string,
  repoRoot: string,
  absPath: string
): Finding[] {
  const entries = parseConsumersHeader(content).map(classifyConsumerEntry);
  if (entries.length === 0) return [];
  const resolved = new Set<string>();
  for (const e of entries) {
    if (e.external || !e.name) continue;
    const scan = spawnSync(
      'grep',
      [
        '-rlF',
        '--include=*.ts',
        '--include=*.tsx',
        '--include=*.js',
        '--exclude-dir=node_modules',
        '--exclude-dir=dist',
        '--exclude-dir=.git',
        '--',
        e.name,
        repoRoot,
      ],
      { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }
    );
    if (scan.error || (scan.status !== 0 && scan.status !== 1)) {
      return [
        {
          severity: 'error',
          code: 'SDD_CONSUMERS_SCAN_FAILED',
          file: relPath,
          message: `Cannot prove @consumers resolution because grep failed (exit ${scan.status ?? 'spawn'}): ${scan.error?.message || scan.stderr || 'no stderr'}`,
        },
      ];
    }
    const files = (scan.stdout ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (files.some((f) => resolve(f) !== absPath)) resolved.add(e.name);
  }
  return checkConsumersResolvable(relPath, entries, resolved);
}

/** @purpose Walk up from `start` to the nearest `package.json` — the real repo root, since `--all`'s scanned root may be a scoped subtree. | @param start Directory to start from. | @returns Ancestor with `package.json`, or `start`. */
function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/** @purpose GitHub-style heading slug: lowercase, drop non-word chars (keep spaces/hyphens), spaces→hyphens. | @param heading Heading text. | @returns Anchor slug. */
function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** @purpose Check a ticket's spec references `](…spec.md#entity)` resolve: file on disk + anchor as heading-slug or SECTION marker (sdd-extract safety). | @param file Ticket path. | @param content Ticket markdown. | @returns SDD_BROKEN_SPEC_REF (error, file) / SDD_BROKEN_SPEC_ANCHOR (warn, anchor). */
function checkSpecRefs(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const dir = dirname(file);
  for (const m of content.matchAll(/\]\(([^)`#]+\.spec\.md)#([^)\s]+)\)/g)) {
    const target = m[1];
    const anchor = m[2];
    if (!target || !anchor) continue;
    const abs = resolve(dir, target);
    if (!existsSync(abs)) {
      findings.push({
        severity: 'error',
        code: 'SDD_BROKEN_SPEC_REF',
        file,
        message: `Spec reference does not resolve on disk: ${target}#${anchor}`,
      });
      continue;
    }
    const observed = readUtf8(abs);
    if (!observed.ok) {
      addReadIssue(findings, observed.issue);
      continue;
    }
    const spec = observed.value;
    const a = anchor.toLowerCase();
    const headings = [...spec.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((h) => slug(h[1] ?? ''));
    const sections = [...spec.matchAll(/<!--SECTION:([A-Z0-9_]+)-->/g)].map((s) =>
      (s[1] ?? '').toLowerCase()
    );
    if (!headings.includes(a) && !sections.includes(a)) {
      findings.push({
        severity: 'warn',
        code: 'SDD_BROKEN_SPEC_ANCHOR',
        file,
        message: `Spec anchor not found in ${target}: #${anchor} (entity renamed/moved? the worker's sdd-extract will miss it)`,
      });
    }
  }
  return findings;
}

/** @purpose Check one ticket's Meta Scope/Module against structural ownership proved by its path. | @param file Absolute ticket path. | @param content Ticket markdown. | @param repoRoot Canonical project root. | @returns One copy-ready ownership finding when metadata is absent or disagrees. */
function checkTicketOwnerMetadata(file: string, content: string, repoRoot: string): Finding[] {
  const metaSection = extractSection(content, 'META');
  if (metaSection.status !== 'ok') return [];
  const meta = parseMetaInfo(metaSection.content);
  const owner = resolveTaskOutputOwnership(relative(repoRoot, file), repoRoot);
  const expectedModule = owner.module ?? 'N/A';
  const expectedOwner = owner.module ? 'module' : 'infrastructure-flat';
  const structuralOwner = /\*\*Structural Owner:\*\*\s*([^\n]+)/
    .exec(metaSection.content)?.[1]
    ?.trim();
  const owningSpecClaim = /\*\*Owning Spec:\*\*\s*\[[^\]]+\]\(([^)#]+(?:#[^)]*)?)\)/.exec(
    metaSection.content
  )?.[1];
  const owningSpec = resolveOwningSpec(file);
  const expectedSpecHref = owningSpec.ok
    ? (() => {
        const href = relative(dirname(file), owningSpec.specPath).split(sep).join('/');
        return href.startsWith('.') ? href : `./${href}`;
      })()
    : null;
  const ownerLine = content
    .split('\n')
    .findIndex((sourceLine) => sourceLine.includes('**Structural Owner:**'));
  const scopeLine = content
    .split('\n')
    .findIndex((sourceLine) => sourceLine.includes('**Scope:**'));
  const line = Math.max(1, ownerLine >= 0 ? ownerLine + 1 : scopeLine + 1);
  if (owner.reason || !owner.scope) {
    return [
      {
        severity: 'error',
        code: 'SDD_TASK_OWNER_METADATA',
        file,
        line,
        message: `[META] Fix: recreate/move the ticket through its exact sdd-new owner call; the path has no unambiguous structural owner: ${owner.reason ?? 'scope missing'}.`,
      },
    ];
  }
  const scopeSpec = resolve(repoRoot, 'specs', owner.scope, `${owner.scope}.spec.md`);
  let structuralOwnerKind = expectedOwner;
  try {
    const decomposition = resolveScopeDecomposition(scopeSpec);
    structuralOwnerKind =
      decomposition.status === 'flat'
        ? 'infrastructure-flat'
        : owner.module
          ? 'module'
          : 'scope-bootstrap';
  } catch {
    // resolveTaskOutputOwnership already carries the fail-closed structural result used above.
  }
  if (
    meta.scope === owner.scope &&
    (meta.module ?? 'N/A') === expectedModule &&
    structuralOwner === structuralOwnerKind &&
    expectedSpecHref !== null &&
    owningSpecClaim === expectedSpecHref
  )
    return [];
  return [
    {
      severity: 'error',
      code: 'SDD_TASK_OWNER_METADATA',
      file,
      line,
      message: `[META] Fix: replace the owner block with "- **Scope:** ${owner.scope}\n- **Module:** ${expectedModule}\n- **Structural Owner:** ${structuralOwnerKind}\n- **Owning Spec:** [Owning spec](${expectedSpecHref ?? '<recreate through sdd-new>'})".`,
    },
  ];
}

/** @purpose Validate exact existing READ / future CREATE path claims for one authoring slice using the dispatch path validator. */
function checkAuthoringTargetPaths(
  file: string,
  content: string,
  repoRoot: string,
  phaseId?: string
): Finding[] {
  const overview = extractSection(content, 'PHASES_OVERVIEW');
  const phases = overview.status === 'ok' ? parsePhasesOverview(overview.content) : [];
  const phaseIds = phaseId ? [phaseId] : phases.map((phase) => phase.id);
  if (phaseIds.length === 0) return [];
  const validation = validateTicketReviewPaths(repoRoot, content, {
    phaseIds,
    targetExpectation: 'dispatch',
    deletedPhaseIds: phaseIds,
    handoffPhaseIds: [],
  });
  if (validation.ok) return [];
  const section =
    phaseIds.find((id) => {
      const extracted = extractSection(content, `PHASE_${id}`);
      return extracted.status === 'ok' && extracted.content.includes(validation.path);
    }) ??
    phaseId ??
    phaseIds[0] ??
    'P1';
  const lineIndex = content
    .split('\n')
    .findIndex((sourceLine) => sourceLine.includes(validation.path));
  return [
    {
      severity: 'error',
      code: 'SDD_AUTHORING_TARGET_PATH',
      file,
      line: lineIndex >= 0 ? lineIndex + 1 : 1,
      message: `[PHASE_${section}] Fix: replace "${validation.path}" with one exact repo-relative file path (existing = READ, absent = CREATE); no glob, directory, absolute path, traversal, or symlink. Detail: ${validation.detail}. Example: "src/toolchain.ts".`,
    },
  ];
}

/** @purpose Normalize every exact-ticket authoring diagnostic to the same line-addressed, copy-ready protocol. */
function normalizeAuthoringFinding(finding: Finding, content: string): Finding {
  const explicitSection = /^\[([A-Z0-9_]+)\]\s*/.exec(finding.message)?.[1];
  const section =
    explicitSection ??
    (finding.code.includes('TEST_COVERAGE') ||
    /SDD_BDD_(?:COVERAGE|TESTFILE|DEFERRED|PHASE)/.test(finding.code)
      ? 'TEST_COVERAGE'
      : finding.code.startsWith('SDD_BDD_')
        ? 'BDD'
        : /(?:META|TASK_ID|STATUS|SPEC_REF|OWNER_METADATA)/.test(finding.code)
          ? 'META'
          : /(?:PHASE|RULES_CASCADE)/.test(finding.code)
            ? 'PHASES_OVERVIEW'
            : /(?:VERIFICATION|COVERAGE_POLICY)/.test(finding.code)
              ? 'VERIFICATION'
              : finding.code.includes('EXECUTION')
                ? 'EXECUTION_LOG'
                : 'TICKET');
  const sectionLine =
    section === 'TICKET'
      ? 1
      : Math.max(
          1,
          content.split('\n').findIndex((line) => line.includes(`<!--SECTION:${section}-->`)) + 1
        );
  const detail = explicitSection
    ? finding.message.replace(/^\[[A-Z0-9_]+\]\s*/, '')
    : finding.message;
  const actionable = /^(?:Fix|Example):/.test(detail) ? detail : `Fix: ${detail}`;
  return {
    ...finding,
    line: finding.line ?? sectionLine,
    message: `[${section}] ${actionable}`,
  };
}

/**
 * @purpose Flow version governing ONE spec file — per-scope, so a mid-migration (mixed) repo checks
 * migrated scopes strictly while pre-migration scopes stay lenient.
 * @invariant Derived from the file's own path (repo root = before `specs`), so scoped runs
 *   (`--all specs/<scope>`) match full runs (`--all .`).
 * @param file Absolute spec path.
 * @returns The scope's flow version; falls back to repo-level detection when no scope segment exists.
 */
function specFlowVersion(file: string): FlowVersion {
  const parts = file.split(sep);
  const si = parts.lastIndexOf('specs');
  const repoRoot = si > 0 ? parts.slice(0, si).join(sep) : sep;
  if (si < 0 || parts.length - si < 3) return detectFlowVersion(repoRoot);
  return detectScopeFlowVersion(repoRoot, parts[si + 1] as string);
}

/**
 * @purpose True when a ticket is a genuine v2 artifact — under a `specs/` directory AND its scope resolves to v2.
 * @invariant SDD_TASK_ID_GRAMMAR's gate: with no `specs` segment, `specFlowVersion` defaults to `'v2'`
 * and wrongly grades ad-hoc test ids — a real `specs` segment fixes that.
 * @param file Ticket path (absolute or relative).
 * @returns Whether the grammar check should run against this ticket.
 */
function isV2SpecsTicket(file: string): boolean {
  return resolve(file).split(sep).includes('specs') && specFlowVersion(file) === 'v2';
}

/**
 * @purpose Flow version governing ONE ticket file — per-scope, from its `tasks/<scope>/` segment.
 * @invariant Unlike `specFlowVersion`, `repoRoot` is caller-supplied (see `findRepoRoot`), not
 *   re-derived from the ticket's path — a ticket has no `specs` segment to anchor on.
 * @param file Ticket path (absolute or relative — only the `tasks/<scope>/` segment matters).
 * @param repoRoot The repository root.
 * @returns The ticket's scope flow version; falls back to repo-level detection with no `tasks` segment.
 */
function ticketFlowVersion(file: string, repoRoot: string): FlowVersion {
  const parts = resolve(file).split(sep);
  const ti = parts.lastIndexOf('tasks');
  if (ti >= 0 && parts.length - ti >= 2) {
    return detectScopeFlowVersion(repoRoot, parts[ti + 1] as string);
  }
  return detectFlowVersion(repoRoot);
}

/** @purpose True when content is a Tracker Index (a Task-ID/Status table) — content-based, not filename-based, so a legacy `tasks/<scope>/README.md` tracker is not silently dropped. | @param content File markdown. | @returns Whether it parses as a tracker index. */
function isTrackerIndex(content: string): boolean {
  return parseTrackerRows(content).length > 0;
}

/** @purpose Names of top-level `specs/<dir>` directories that contain a `<dir>.spec.md`. | @param specsRoot Absolute path of the specs/ root. | @returns Scope-spec dir names. */
function scopeSpecDirs(specsRoot: string): string[] {
  let entries;
  try {
    entries = readdirSync(specsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
    .filter(
      (e) =>
        existsSync(join(specsRoot, e.name, `${e.name}.spec.md`)) ||
        existsSync(join(specsRoot, e.name, `${e.name}.1-spec.md`))
    )
    .map((e) => e.name);
}

/**
 * @purpose Execute gennady sdd-check — run mechanical checks over one ticket or the whole project tree.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param [ticketProjectRoot] Canonical ticket-resolution root; defaults to cwd.
 * @returns CheckResult — the ESLint-style report and exit code.
 */
export async function run(
  rawArgs: string[],
  ticketProjectRoot = process.cwd()
): Promise<CheckResult> {
  // The cache is one invocation's read-sharing only. A long-lived caller may run the command again
  // after repository bytes/identities changed; prior evidence must never authorize the next run.
  ruleDepsCache.clear();
  let args: Record<string, unknown> & { _: string[] };
  try {
    args = parseArgs(
      rawArgs,
      {
        task: { aliases: ['task'], takesValue: true },
        spec: { aliases: ['spec'], takesValue: true },
        authoring: ['authoring'],
        phase: { aliases: ['phase'], takesValue: true },
        format: { aliases: ['format'], takesValue: true },
        all: ['all'],
        changed: ['changed'],
      },
      { strict: true }
    );
  } catch (cause) {
    return badInvocation(cause instanceof Error ? cause.message : String(cause));
  }
  const parsedPositionals = args._ as string[];
  const positional =
    parsedPositionals[0] === 'sdd-check' ? parsedPositionals.slice(1) : parsedPositionals;
  const invalidValue = [
    ['--task', args.task],
    ['--spec', args.spec],
    ['--phase', args.phase],
    ['--format', args.format],
  ].find(([, value]) => value !== undefined && (typeof value !== 'string' || value.length === 0));
  if (invalidValue) return badInvocation(`${invalidValue[0]} requires exactly one value`);
  if (args.all !== undefined && args.all !== true)
    return badInvocation('--all does not take a value');
  if (args.changed !== undefined && args.changed !== true)
    return badInvocation('--changed does not take a value');
  if (args.authoring !== undefined && args.authoring !== true)
    return badInvocation('--authoring does not take a value');

  const taskPath = typeof args.task === 'string' ? args.task : undefined;
  const specPath = typeof args.spec === 'string' ? args.spec : undefined;
  const authoring = args.authoring === true;
  const authoringPhase = typeof args.phase === 'string' ? args.phase : undefined;
  const outputFormat = typeof args.format === 'string' ? args.format : 'text';
  const all = args.all === true;
  const changed = args.changed === true;
  const taskSelected = taskPath !== undefined;
  const specSelected = specPath !== undefined;
  const selectedModeCount = [taskSelected, specSelected, all, changed].filter(Boolean).length;
  if (outputFormat !== 'text' && outputFormat !== 'json')
    return badInvocation('--format must be text or json');
  if (
    selectedModeCount !== 1 ||
    (taskSelected && positional.length > 0) ||
    (authoring && !taskSelected && !specSelected) ||
    (specSelected && !authoring) ||
    (authoringPhase !== undefined && (!taskSelected || !authoring)) ||
    ((all || changed) && positional.length > 1)
  )
    return badInvocation(
      selectedModeCount !== 1
        ? 'choose exactly one mode'
        : authoring && !taskSelected
          ? '--authoring requires --task <ticket> or --spec <path>'
          : specSelected && !authoring
            ? '--spec requires --authoring'
            : authoringPhase !== undefined && (!taskSelected || !authoring)
              ? '--phase requires --authoring and --task <ticket>'
              : `unexpected positional argument(s): ${positional.join(' ')}`
    );

  if (authoringPhase !== undefined && !/^P[1-9][0-9]*$/.test(authoringPhase))
    return badInvocation('--phase must match P<N>, for example P1');

  if (authoring && taskPath && looksLikeTaskId(taskPath))
    return badInvocation(
      '--authoring requires the exact created ticket path returned by sdd-new, not a Task-ID'
    );

  const findings: Finding[] = [];
  let fileCount = 0;
  let taskBanner: string | null = null;

  if (specPath) {
    let repoRoot: string;
    try {
      repoRoot = realpathSync(resolve(ticketProjectRoot));
    } catch (cause) {
      return readFailed(ticketProjectRoot, readReason(cause));
    }
    const proven = proveRepoFile(repoRoot, specPath);
    if (!proven.ok) return readFailed(specPath, proven.detail);
    if (!/\.spec\.md$/.test(proven.identity.relative))
      return badInvocation('--spec requires an exact *.spec.md path');
    const observed = readProvenRepoFile(proven.identity);
    if (!observed.ok) return readFailed(specPath, observed.detail);
    const fixed = autoFixSpecAuthoringDraft(observed.content);
    if (fixed.content !== observed.content) {
      const write = writeProvenRepoFile(proven.identity, fixed.content);
      if (!write.ok) return readFailed(specPath, write.detail);
      findings.push({
        severity: 'warn',
        code: 'SDD_AUTHORING_AUTO_FIXED',
        file: proven.identity.relative,
        message: `Auto-fixed trivial format: ${fixed.fixes.join(', ')}.`,
      });
    }
    findings.push(...checkSpecAuthoringDraft(proven.identity.relative, fixed.content));
    fileCount = 1;
  } else if (taskPath) {
    let repoRoot: string;
    try {
      repoRoot = realpathSync(resolve(ticketProjectRoot));
    } catch (cause) {
      return readFailed(ticketProjectRoot, readReason(cause));
    }
    const resolved = resolveTicketArg(taskPath, repoRoot);
    if (!resolved.ok) {
      if (resolved.reason === 'unreadable') return fileError(taskPath);
      if (resolved.reason === 'unsafe-path' || resolved.reason === 'unsafe-corpus') {
        if (resolved.reason === 'unsafe-path' && resolved.detail === 'path is missing') {
          return fileError(taskPath);
        }
        return readFailed(taskPath, resolved.detail);
      }
      if (resolved.reason === 'unknown-id') return unknownIdError(taskPath, resolved.refs);
      if (resolved.reason === 'ambiguous-id') {
        return ambiguousIdError(taskPath, resolved.matches, repoRoot);
      }
      return fileError(taskPath);
    }
    const { content } = resolved;
    // Path-arg findings keep the caller's own path verbatim; an id-arg resolves to the ticket's
    // real, repo-root-relative path — a copy-pasteable file reference either way.
    const displayPath =
      resolved.resolvedFrom === 'id'
        ? relative(repoRoot, resolved.path) || resolved.path
        : taskPath;
    const effectivePath = resolved.path;
    const firstTaskFinding = findings.length;
    if (resolved.resolvedFrom === 'id') {
      taskBanner = resolutionLine('sdd-check', resolved.id, resolved.path, repoRoot);
    }
    if (!authoringPhase) findings.push(...checkTicket(effectivePath, content));
    if (authoring)
      findings.push(...checkTicketAuthoringStructure(effectivePath, content, authoringPhase));
    if (authoring && !authoringPhase)
      findings.push(...checkTicketOwnerMetadata(resolved.path, content, repoRoot));
    if (authoring)
      findings.push(...checkAuthoringTargetPaths(resolved.path, content, repoRoot, authoringPhase));
    if (!authoring)
      findings.push(...checkPhaseReceipts(effectivePath, resolved.path, content, repoRoot));
    findings.push(
      ...checkRuleLinks(
        effectivePath,
        content,
        repoRoot,
        authoring
          ? { phaseIds: authoringPhase ? [authoringPhase] : undefined, authoring: true }
          : undefined
      )
    );
    if (!authoringPhase) findings.push(...checkSpecRefs(effectivePath, content));
    if (!authoring) findings.push(...checkResearchRefs(effectivePath, content));
    if (!authoring) findings.push(...(await checkSpecMermaid(effectivePath, content)));
    findings.push(
      ...checkTicketRulesCascade(
        effectivePath,
        content,
        repoRoot,
        authoring
          ? { phaseIds: authoringPhase ? [authoringPhase] : undefined, authoring: true }
          : undefined
      )
    );
    if (!authoringPhase) findings.push(...checkTicketBddCoverage(effectivePath, content, repoRoot));
    if (!authoringPhase) findings.push(...checkTicketCoveragePolicy(effectivePath, content));
    if (!authoring && specFlowVersion(resolve(effectivePath)) === 'v2')
      findings.push(...checkSpecLanguage(effectivePath, content));
    if (!authoringPhase && isV2SpecsTicket(effectivePath))
      findings.push(...checkTaskIdGrammar(effectivePath, content));
    for (let index = firstTaskFinding; index < findings.length; index++) {
      const finding = findings[index] as Finding;
      if (resolve(finding.file) === resolved.path)
        finding.file = authoring ? relative(repoRoot, resolved.path) : displayPath;
      if (authoring) findings[index] = normalizeAuthoringFinding(finding, content);
    }
    fileCount = 1;
  } else if (changed) {
    // #region START_CHANGED — invariant: TASKS_APPEND_ONLY + CONSUMERS_RESOLVABLE run over changed source files, not the full spec/ticket tree
    const selectedRoot = positional[0] ?? '.';
    const root = resolve(selectedRoot);
    const rootIssue = selectedRootIssue(selectedRoot);
    if (rootIssue) return readFailed(rootIssue.path, rootIssue.reason);
    const changedSources = getChangedSourceFiles(root);
    if (changedSources.status === 'error')
      return gitEvidenceError(
        changedSources.operation,
        changedSources.exitCode,
        changedSources.stderr
      );
    for (const rel of changedSources.files) {
      const abs = join(root, rel);
      const baseline = readHeadContent(root, rel);
      if (baseline.status === 'error')
        return gitEvidenceError(baseline.operation, baseline.exitCode, baseline.stderr);
      let content: string;
      try {
        content = readFileSync(abs, 'utf-8');
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT' && baseline.status === 'ok') {
          findings.push(...checkTasksAppendOnly(rel, '', baseline.content));
          fileCount++;
          continue;
        }
        return readFailed(abs, readReason(cause));
      }
      findings.push(
        ...checkTasksAppendOnly(rel, content, baseline.status === 'ok' ? baseline.content : null)
      );
      findings.push(...checkFileConsumersResolvable(rel, content, root, resolve(abs)));
      fileCount++;
    }
    // #endregion END_CHANGED
  } else {
    // Strict v2 spec rules (mandatory diagram, module floor, folded detail, language lint) apply
    // per scope: a migrated scope (tasks/<scope>/ removed) is checked strictly while v1 neighbours stay lenient.
    // v1 sibling layout has tickets in tasks/, not specs/ — scan both when present; an explicitly
    // scoped root with neither (`--all specs/<scope>`, `--all tasks`) falls back to scanning itself.
    // The implicit repository root stays empty before `/sdd` creates specs/; scanning it would lint
    // bundled examples and unrelated Markdown as if they were the product specification.
    // #region START_ALL — invariant: scan specs/ AND tasks/ when present, or an explicit scoped root
    const root = resolve(positional[0] ?? '.');
    if (positional[0]) {
      const rootIssue = selectedRootIssue(positional[0]);
      if (rootIssue) return readFailed(rootIssue.path, rootIssue.reason);
    }
    const repoRoot = findRepoRoot(root);
    const specsRoot = join(root, 'specs');
    const tasksRoot = join(root, 'tasks');
    const walkIssues: ReadIssue[] = [];
    const bases = [specsRoot, tasksRoot].filter((path) => {
      try {
        lstatSync(path);
        return true;
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT')
          walkIssues.push({ path, reason: readReason(cause) });
        return false;
      }
    });
    if (bases.length === 0 && positional[0]) {
      try {
        lstatSync(root);
        bases.push(root);
      } catch (cause) {
        walkIssues.push({ path: root, reason: readReason(cause) });
      }
    }
    const portalFile = join(specsRoot, 'README.md');
    const mdFiles: string[] = [];
    for (const b of bases) walkMd(b, mdFiles, walkIssues);
    for (const issue of walkIssues) addReadIssue(findings, issue);
    // Pre-read the portal Scope Graph once — every scope spec is cross-checked against it (B5).
    let portalEdges: GraphEdge[] = [];
    if (existsSync(portalFile)) {
      const observed = readUtf8(portalFile);
      if (observed.ok) portalEdges = parseGraphEdges(observed.value);
      else addReadIssue(findings, observed.issue);
    }
    const ticketRefs: TicketRef[] = [];
    const trackerRowRefs: TrackerRowRef[] = [];
    const specEntries: SpecEntry[] = [];
    const moduleEdgesByScope = new Map<string, { edges: GraphEdge[]; scopeFile: string }>();
    // Every ```mermaid block is validated through the real parser after the walk (collected here, parsed once mermaid+jsdom load lazily).
    const mermaidTargets: { file: string; content: string }[] = [];
    const researchFiles: string[] = [];
    const referencedResearch = new Set<string>();
    const registeredResearch = new Set<string>();
    for (const file of mdFiles) {
      const observed = readUtf8(file);
      if (!observed.ok) {
        addReadIssue(findings, observed.issue);
        fileCount++;
        continue;
      }
      const content = observed.value;
      if (content.includes('```mermaid')) mermaidTargets.push({ file, content });
      findings.push(...checkResearchRefs(file, content));
      for (const target of findResearchLinks(content)) {
        referencedResearch.add(resolve(dirname(file), target));
      }
      for (const target of findRegisteredResearchLinks(content)) {
        registeredResearch.add(resolve(dirname(file), target));
      }
      if (file.endsWith('.research.md')) {
        researchFiles.push(file);
        findings.push(...checkResearchLifecycle(file, content));
        fileCount++;
      } else if (file === portalFile) {
        findings.push(
          ...checkPortal({
            scopes: parseScopes(content),
            edges: parseGraphEdges(content),
            specDirs: scopeSpecDirs(specsRoot),
          })
        );
        fileCount++;
      } else if (file.endsWith('.spec.md') || file.endsWith('.1-spec.md')) {
        findings.push(...checkSpecLinks(file, content));
        const specFlow = specFlowVersion(file);
        findings.push(...checkSpecStructure(file, content, specFlow));
        if (specFlow === 'v2') findings.push(...checkSpecLanguage(file, content));
        findings.push(...checkScopeDeps(file, content, portalEdges));
        findings.push(...checkRequirementIds(file, content));
        findings.push(
          ...checkRequirementBudgetsAgainstBaseline(
            file,
            content,
            getHeadContent(repoRoot, relative(repoRoot, file))
          )
        );
        findings.push(...checkDecisionLogIds(file, content));
        findings.push(...checkRequirementUnhappyPath(file, content));
        findings.push(...checkDiagramCaptions(file, content));
        findings.push(...checkScopeDataFlowDiagram(file, content));
        findings.push(...checkModuleCallChain(file, content));
        specEntries.push({ file, content, flowVersion: specFlow });
        // Module spec path .../specs/<scope>/<module>/.../<mod>.spec.md; group inter-module edges by scope for a per-scope cycle check (base-independent).
        const parts = file.split(sep);
        const si = parts.lastIndexOf('specs');
        if (si >= 0 && parts.length - si >= 4) {
          const scope = parts[si + 1] as string;
          const scopeFile = join(parts.slice(0, si + 2).join(sep), `${scope}.spec.md`);
          const entry = moduleEdgesByScope.get(scope) ?? { edges: [], scopeFile };
          entry.edges.push(...moduleGraphEdges(content));
          moduleEdgesByScope.set(scope, entry);
        }
        fileCount++;
      } else if (isTrackerIndex(content)) {
        const trackerFlow = ticketFlowVersion(file, repoRoot);
        for (const r of parseTrackerRows(content))
          trackerRowRefs.push({
            file,
            taskId: r.taskId,
            status: r.status,
            flowVersion: trackerFlow,
          });
        fileCount++;
      } else if (isTicket(content)) {
        findings.push(...checkTicket(file, content));
        findings.push(...checkPhaseReceipts(file, file, content, repoRoot));
        findings.push(...checkRuleLinks(file, content, repoRoot));
        findings.push(...checkSpecRefs(file, content));
        findings.push(...checkTicketRulesCascade(file, content, repoRoot));
        findings.push(...checkTicketBddCoverage(file, content, repoRoot));
        findings.push(...checkTicketCoveragePolicy(file, content));
        if (specFlowVersion(file) === 'v2') findings.push(...checkSpecLanguage(file, content));
        if (isV2SpecsTicket(file)) findings.push(...checkTaskIdGrammar(file, content));
        ticketRefs.push(ticketRef(file, content, ticketFlowVersion(file, repoRoot)));
        fileCount++;
      } else if (isLegacyTicket(content)) {
        findings.push(...checkLegacyTicket(file));
        ticketRefs.push(legacyTicketRef(file, content, ticketFlowVersion(file, repoRoot)));
        fileCount++;
      }
    }
    findings.push(...checkTaskGraph(ticketRefs));
    findings.push(...checkTrackers(ticketRefs, trackerRowRefs));
    findings.push(...checkSpecHierarchy(specEntries));
    findings.push(...checkResearchOrphans(researchFiles, referencedResearch, registeredResearch));
    for (const [scope, { edges, scopeFile }] of moduleEdgesByScope) {
      findings.push(...checkModuleGraph(scope, scopeFile, edges));
    }
    for (const t of mermaidTargets) {
      findings.push(...(await checkSpecMermaid(t.file, t.content)));
    }
    // #endregion END_ALL
  }

  // --all/--changed walk absolute paths internally (specFlowVersion et al. need the full path to
  // locate the `specs`/`tasks` segment) — only the reported Finding.file is shortened, relative to
  // cwd, so hundreds of findings don't each repeat the worktree's absolute prefix. --task keeps the
  // caller's own path verbatim (its Finding.file is never touched below).
  if (!taskPath && !specPath) {
    for (const f of findings) f.file = relative(process.cwd(), resolve(f.file)) || f.file;
  }

  if (authoring && taskPath) {
    for (const finding of findings) finding.severity = 'error';
  }

  logger.debug(`[SddCheckCommand#run] ${findings.length} finding(s) across ${fileCount} file(s)`);
  const result = formatFindings(
    findings,
    fileCount,
    authoring
      ? {
          maxFindings: 12,
          repairHint: specPath
            ? "fill the named sections from their local comments, remove consumed comments, then rerun the same authoring command; draft hints do not block this check's exit code, but sdd-log authoring-complete requires zero remaining findings."
            : 'fix only this ticket, then rerun the same authoring command.',
          format: outputFormat,
          authoring: true,
        }
      : { format: outputFormat }
  );
  return taskBanner && outputFormat === 'text'
    ? { text: `${taskBanner}\n${result.text}`, exitCode: result.exitCode }
    : result;
}

// Self-executing for CLI: gennady sdd-check (--task <ticket> | --all [root])
const result = await run(process.argv);
console.log(result.text);
process.exit(result.exitCode);
