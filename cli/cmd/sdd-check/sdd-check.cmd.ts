// @file: SddCheckCommand — CLI entry for gennady sdd-check: mechanical audit of one ticket (--task) or the whole project (--all).
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, readdirSync, existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, isAbsolute, join, resolve, relative, dirname, sep } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { proveRepoFile, readProvenRepoFile } from '../../../shared/common/repo-file-identity.ts';
import {
  getChangedFiles,
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
  checkSpecLanguage,
  checkTaskIdGrammar,
  checkReviewState,
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
  checkDeltaDiagram,
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
import {
  checkCriticReadinessForTargetSet,
  hasCriticRoundsSection,
  latestCriticTargetSet,
  latestCriticWriteSet,
  formatCriticTargetSet,
  formatCriticChangedState,
} from '../../../shared/sdd/critic-readiness.ts';
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
import {
  collectTicketCorpus,
  resolveTicketArg,
  resolutionLine,
} from '../../../shared/sdd/ticket-resolve.ts';
import {
  checkScaffoldFeasibility,
  deriveScaffoldCriticContext,
  materializedScaffoldPlanNodes,
} from '../../../shared/sdd/scaffold-feasibility.ts';
import {
  checkProjectFeasibility,
  checkScaffoldDraftPlan,
  checkScaffoldPlanMaterialization,
  deriveProjectFeasibilityContext,
  type ProjectSpecRef,
  type ScaffoldDraftPlan,
} from '../../../shared/sdd/project-feasibility.ts';
import { phaseVerificationArtifactPaths } from '../../../shared/sdd/phase-verification-plan.ts';
import { deriveCapabilityAdapterContract } from '../../../shared/sdd/capability-adapter.ts';
import { looksLikeTaskId } from '../../../shared/sdd/task-id.ts';
import {
  resolveModuleScopeOwnership,
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
  reviewPublicationError,
  reviewStateError,
  reviewTargetError,
  readFailed,
  ERR_CLI_SDD_CHECK_READ_FAILED,
  unknownIdError,
  type CheckResult,
} from './sdd-check.types.ts';
import { checkPhaseReceipts } from './phase-receipt-check.ts';
import { deriveReviewPublicationSet } from './review-publication.ts';

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

/** @purpose Collect the portal-declared scope specs and their exact dependency edges for project proof. */
function collectProjectSpecRefs(
  repoRoot: string
): { ok: true; refs: ProjectSpecRef[] } | { ok: false; issue: ReadIssue } {
  const portalPath = join(repoRoot, 'specs', 'README.md');
  const portal = readUtf8(portalPath);
  if (!portal.ok) return portal;
  const scopes = parseScopes(portal.value);
  const edges = parseGraphEdges(portal.value);
  const refs: ProjectSpecRef[] = [];
  for (const scope of scopes) {
    if (!scope.specPath) {
      return {
        ok: false,
        issue: {
          path: portalPath,
          reason: `scope '${scope.name}' has no canonical spec path`,
        },
      };
    }
    const repoRelative = `specs/${scope.specPath.replace(/^\.\//, '')}`;
    const identity = proveRepoFile(repoRoot, repoRelative);
    if (!identity.ok) {
      return {
        ok: false,
        issue: { path: repoRelative, reason: identity.detail },
      };
    }
    const observed = readProvenRepoFile(identity.identity);
    if (!observed.ok) {
      return {
        ok: false,
        issue: { path: repoRelative, reason: observed.detail },
      };
    }
    refs.push({
      file: identity.identity.relative,
      scope: scope.name,
      dependencies: edges.filter((edge) => edge.from === scope.name).map((edge) => edge.to),
      content: observed.content,
    });
  }
  return { ok: true, refs };
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** @purpose Fail closed on hand-authored pre-Gate-1 JSON before semantic plan checks run. */
function isScaffoldDraftPlan(value: unknown): value is ScaffoldDraftPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Record<string, unknown>;
  if (plan.schema !== 'sdd-scaffold-plan/v1') return false;
  if (
    !Array.isArray(plan.specs) ||
    !plan.specs.every(
      (spec) =>
        spec !== null &&
        typeof spec === 'object' &&
        typeof (spec as Record<string, unknown>).path === 'string' &&
        typeof (spec as Record<string, unknown>).digest === 'string'
    )
  )
    return false;
  return (
    Array.isArray(plan.nodes) &&
    plan.nodes.every((node) => {
      if (!node || typeof node !== 'object') return false;
      const item = node as Record<string, unknown>;
      return (
        typeof item.id === 'string' &&
        typeof item.scope === 'string' &&
        stringArray(item.dependencies) &&
        stringArray(item.requirementRefs) &&
        typeof item.adapter === 'string' &&
        (item.action === null || item.action === 'dependency-install') &&
        stringArray(item.targets) &&
        stringArray(item.provides) &&
        stringArray(item.requires)
      );
    })
  );
}

function loadScaffoldDraftPlan(
  repoRoot: string,
  path: string
): { ok: true; plan: ScaffoldDraftPlan; content: string } | { ok: false; result: CheckResult } {
  const candidate = isAbsolute(path) ? relative(repoRoot, path) : path;
  const identity = proveRepoFile(repoRoot, candidate);
  if (!identity.ok) return { ok: false, result: readFailed(path, identity.detail) };
  const observed = readProvenRepoFile(identity.identity);
  if (!observed.ok) return { ok: false, result: readFailed(path, observed.detail) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(observed.content);
  } catch (cause) {
    return {
      ok: false,
      result: readFailed(
        path,
        `invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`
      ),
    };
  }
  if (!isScaffoldDraftPlan(parsed)) {
    return {
      ok: false,
      result: readFailed(
        path,
        'expected schema sdd-scaffold-plan/v1 with specs[] and fully typed nodes[]'
      ),
    };
  }
  return { ok: true, plan: parsed, content: observed.content };
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

/** @purpose Strict review-bundle walk: unreadable directories and spec symlinks are evidence errors, never silent omissions. */
function walkReviewMd(dir: string, acc: string[], findings: Finding[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    findings.push({
      severity: 'error',
      code: 'SDD_REVIEW_READY_MEMBER_UNREADABLE',
      file: dir,
      message: 'Review target contains an unreadable directory; readiness cannot prove its bundle.',
    });
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (entry.name.endsWith('.spec.md')) {
        findings.push({
          severity: 'error',
          code: 'SDD_REVIEW_READY_MEMBER_UNREADABLE',
          file: full,
          message:
            'Review target contains a symlinked spec; readiness requires a readable regular bundle member.',
        });
      }
      continue;
    }
    if (entry.isDirectory()) walkReviewMd(full, acc, findings);
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

/** @purpose BDD_COVERAGE for one ticket — canonical case names in Test Scenario Coverage vs real it()/test() names, self-deferral, and unparsed rows. | @invariant Existence checks (SCENARIO_UNTESTED, TESTFILE_AMBIGUOUS) run only once Status is DONE — the test file may not exist yet mid-implementation. Format checks run regardless. | @param file Ticket path. | @param content Ticket markdown. | @param repoRoot Repository root (anchors the test-file basename search + flow-version detection). | @returns SDD_BDD_SCENARIO_UNTESTED (severity by the ticket's own flow version), SDD_BDD_TESTFILE_AMBIGUOUS, SDD_BDD_DEFERRED_TO_SELF, and SDD_BDD_COVERAGE_ROW_UNPARSED findings, if any. */
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
  if (isDone) {
    const idx = getTestFileIndex(repoRoot);
    for (const e of entries) {
      if (e.deferred !== null || caseNamesByFile.has(e.testFile)) continue;
      const matches = resolveTestFileMatches(idx, e.testFile);
      findings.push(...checkTestFileAmbiguity(file, e.testFile, matches));
      caseNamesByFile.set(
        e.testFile,
        matches.flatMap((m) => getTestCaseNames(m))
      );
    }
  }
  findings.push(
    ...checkBddCoverage(
      file,
      entries,
      caseNamesByFile,
      ticketFlowVersion(file, repoRoot),
      selfTaskId,
      isDone
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
    if (!coverageRows[0]?.requiredBy.some((rule) => ownerRules.has(rule))) {
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

type ScopeReviewSet =
  | { status: 'not-required' }
  | { status: 'invalid'; subject: 'scope' | 'module'; reason: string }
  | { status: 'wrong-primary'; owner: string; targetSet: string }
  | { status: 'complete'; targetSet: string };

/** @purpose Derive the one product/library integrated review set from structural decomposition. */
function scopeReviewTargetSet(repoRoot: string, primary: string, content: string): ScopeReviewSet {
  if (content.includes('<!--SECTION:MODULE_VISION-->')) {
    const ownership = resolveModuleScopeOwnership(resolve(repoRoot, primary));
    if (ownership.status === 'invalid') return { ...ownership, subject: 'module' };
    const owner = relative(repoRoot, ownership.decomposition.scopeSpec);
    return {
      status: 'wrong-primary',
      owner,
      targetSet: formatCriticTargetSet([
        owner,
        ...ownership.decomposition.moduleSpecs.map((path) => relative(repoRoot, path)),
      ]),
    };
  }
  if (!content.includes('<!--SECTION:SCOPE_TYPE-->')) return { status: 'not-required' };
  const decomposition = resolveScopeDecomposition(resolve(repoRoot, primary));
  if (decomposition.scopeType !== 'product' && decomposition.scopeType !== 'library') {
    return { status: 'not-required' };
  }
  if (decomposition.status !== 'complete') {
    return {
      status: 'invalid',
      subject: 'scope',
      reason: decomposition.reason ?? 'unknown module state',
    };
  }
  return {
    status: 'complete',
    targetSet: formatCriticTargetSet([
      primary,
      ...decomposition.moduleSpecs.map((path) => relative(repoRoot, path)),
    ]),
  };
}

type ReviewWriteSet = { status: 'ok'; paths: string[] } | { status: 'invalid'; reason: string };

/** @purpose Derive the explicit writable subset from valid CHANGE_MANIFEST sections only. */
function reviewWriteSet(members: { path: string; content: string }[]): ReviewWriteSet {
  const paths: string[] = [];
  for (const member of members) {
    const manifest = extractSection(member.content, 'CHANGE_MANIFEST');
    const markerVisible =
      member.content.includes('SECTION:CHANGE_MANIFEST') || /^[ \t]*[✚~] /m.test(member.content);
    if (manifest.status === 'ok') paths.push(member.path);
    else if (markerVisible) {
      return {
        status: 'invalid',
        reason: `member \`${member.path}\` has ${manifest.status} CHANGE_MANIFEST evidence; repair it before deriving the write-set.`,
      };
    }
  }
  if (paths.length === 0) {
    return {
      status: 'invalid',
      reason:
        'write-set is empty; at least one reviewed member must carry a valid CHANGE_MANIFEST while context-only members stay unmarked.',
    };
  }
  return { status: 'ok', paths: Array.from(new Set(paths)).sort() };
}

type ResolvedReviewBundle = {
  status: 'ok';
  repoRoot: string;
  members: { path: string; content: string; primary: boolean }[];
  primary: { path: string; content: string; primary: boolean };
  targetSet: string;
  writeSetPaths: string[];
  writeSet: string;
};

type ReviewBundleResolution = ResolvedReviewBundle | { status: 'error'; result: CheckResult };

/** @purpose Resolve one complete critic bundle once so review-state and publication derivation cannot disagree. */
function resolveReviewBundle(
  requestedPaths: string[],
  contractError: (message: string) => CheckResult
): ReviewBundleResolution {
  const absolute = requestedPaths.map((path) => resolve(path));
  if (absolute.length === 0) {
    return { status: 'error', result: contractError('the review bundle is empty.') };
  }
  if (new Set(absolute).size !== absolute.length) {
    return {
      status: 'error',
      result: contractError(
        'duplicate target arguments resolve to the same path; pass each integrated member exactly once.'
      ),
    };
  }

  const repoRoot = findRepoRoot(dirname(absolute[0] as string));
  const realRepoRoot = realpathSync(repoRoot);
  const members: { path: string; content: string; primary: boolean }[] = [];
  for (let index = 0; index < absolute.length; index++) {
    const file = absolute[index] as string;
    const rel = relative(repoRoot, file).split(sep).join('/');
    if (rel.startsWith('..') || !file.endsWith('.spec.md')) {
      return { status: 'error', result: reviewTargetError(file) };
    }
    try {
      if (lstatSync(file).isSymbolicLink() || !statSync(file).isFile()) {
        return { status: 'error', result: reviewTargetError(file) };
      }
      const realRel = relative(realRepoRoot, realpathSync(file));
      if (realRel.startsWith('..')) {
        return { status: 'error', result: reviewTargetError(file) };
      }
      members.push({ path: rel, content: readFileSync(file, 'utf-8'), primary: index === 0 });
    } catch {
      return { status: 'error', result: reviewTargetError(file) };
    }
  }

  const targetSet = formatCriticTargetSet(members.map((member) => member.path));
  for (const secondary of members.slice(1)) {
    if (hasCriticRoundsSection(secondary.content)) {
      return {
        status: 'error',
        result: contractError(
          `secondary \`${secondary.path}\` contains parser-visible Critic Rounds; keep history only in primary \`${members[0]?.path}\`.`
        ),
      };
    }
  }

  const primary = members[0] as ResolvedReviewBundle['primary'];
  const scopeSet = scopeReviewTargetSet(repoRoot, primary.path, primary.content);
  if (scopeSet.status === 'invalid') {
    return {
      status: 'error',
      result: contractError(
        scopeSet.subject === 'scope'
          ? `primary \`${primary.path}\` is not completely decomposed (${scopeSet.reason}); continue through /sdd into the module flow before critic dispatch.`
          : `module primary \`${primary.path}\` has invalid scope ownership (${scopeSet.reason}); resolve its one declared owning scope and use that scope as primary.`
      ),
    };
  }
  if (scopeSet.status === 'wrong-primary') {
    return {
      status: 'error',
      result: contractError(
        `module \`${primary.path}\` cannot own Critic Rounds; use owning scope \`${scopeSet.owner}\` as primary with exact target-set \`${scopeSet.targetSet}\`.`
      ),
    };
  }
  if (scopeSet.status === 'complete' && scopeSet.targetSet !== targetSet) {
    return {
      status: 'error',
      result: contractError(
        `product/library review must use the complete integrated target-set \`${scopeSet.targetSet}\`; pass the scope primary plus every declared module spec.`
      ),
    };
  }

  const currentWriteSet = reviewWriteSet(members);
  if (currentWriteSet.status === 'invalid') {
    return { status: 'error', result: contractError(currentWriteSet.reason) };
  }
  return {
    status: 'ok',
    repoRoot,
    members,
    primary,
    targetSet,
    writeSetPaths: currentWriteSet.paths,
    writeSet: formatCriticTargetSet(currentWriteSet.paths),
  };
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
        authoring: ['authoring'],
        phase: { aliases: ['phase'], takesValue: true },
        all: ['all'],
        changed: ['changed'],
        projectFeasibility: ['project-feasibility'],
        plan: { aliases: ['plan'], takesValue: true },
        scaffoldPlan: { aliases: ['scaffold-plan'], takesValue: true },
        scaffoldFeasibility: ['scaffold-feasibility'],
        reviewPublication: { aliases: ['review-publication'], takesValue: true },
        reviewReady: { aliases: ['review-ready'], takesValue: true },
        reviewState: { aliases: ['review-state'], takesValue: true },
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
    ['--phase', args.phase],
    ['--plan', args.plan],
    ['--scaffold-plan', args.scaffoldPlan],
    ['--review-publication', args.reviewPublication],
    ['--review-ready', args.reviewReady],
    ['--review-state', args.reviewState],
  ].find(([, value]) => value !== undefined && (typeof value !== 'string' || value.length === 0));
  if (invalidValue) return badInvocation(`${invalidValue[0]} requires exactly one value`);
  if (args.all !== undefined && args.all !== true)
    return badInvocation('--all does not take a value');
  if (args.changed !== undefined && args.changed !== true)
    return badInvocation('--changed does not take a value');
  if (args.authoring !== undefined && args.authoring !== true)
    return badInvocation('--authoring does not take a value');
  if (args.scaffoldFeasibility !== undefined && args.scaffoldFeasibility !== true)
    return badInvocation('--scaffold-feasibility does not take a value');
  if (args.projectFeasibility !== undefined && args.projectFeasibility !== true)
    return badInvocation('--project-feasibility does not take a value');

  const taskPath = typeof args.task === 'string' ? args.task : undefined;
  const authoring = args.authoring === true;
  const authoringPhase = typeof args.phase === 'string' ? args.phase : undefined;
  const all = args.all === true;
  const changed = args.changed === true;
  const projectFeasibility = args.projectFeasibility === true;
  const approvedPlanPath = typeof args.plan === 'string' ? args.plan : undefined;
  const scaffoldPlanPath = typeof args.scaffoldPlan === 'string' ? args.scaffoldPlan : undefined;
  const scaffoldFeasibility = args.scaffoldFeasibility === true;
  const reviewPublicationSelected = typeof args.reviewPublication === 'string';
  const reviewPublicationPaths = reviewPublicationSelected
    ? [args.reviewPublication as string, ...positional]
    : [];
  const reviewReadyPath = typeof args.reviewReady === 'string' ? args.reviewReady : undefined;
  const reviewStateSelected = typeof args.reviewState === 'string';
  const reviewStatePaths = reviewStateSelected ? [args.reviewState as string, ...positional] : [];

  const taskSelected = taskPath !== undefined;
  const reviewReadySelected = reviewReadyPath !== undefined;
  const selectedModeCount = [
    taskSelected,
    all,
    changed,
    projectFeasibility,
    scaffoldPlanPath !== undefined,
    scaffoldFeasibility,
    reviewPublicationSelected,
    reviewReadySelected,
    reviewStateSelected,
  ].filter(Boolean).length;
  if (
    selectedModeCount !== 1 ||
    (taskSelected && positional.length > 0) ||
    (authoring && !taskSelected) ||
    (authoringPhase !== undefined && (!taskSelected || !authoring)) ||
    (approvedPlanPath !== undefined && !scaffoldFeasibility) ||
    (reviewReadySelected && positional.length > 0) ||
    ((all || changed || projectFeasibility || scaffoldFeasibility || scaffoldPlanPath) &&
      positional.length > 1)
  )
    return badInvocation(
      selectedModeCount !== 1
        ? 'choose exactly one mode'
        : authoring && !taskSelected
          ? '--authoring requires --task <ticket>'
          : authoringPhase !== undefined && (!taskSelected || !authoring)
            ? '--phase requires --authoring and --task <ticket>'
            : approvedPlanPath !== undefined && !scaffoldFeasibility
              ? '--plan requires --scaffold-feasibility'
              : `unexpected positional argument(s): ${positional.join(' ')}`
    );

  if (authoringPhase !== undefined && !/^P[1-9][0-9]*$/.test(authoringPhase))
    return badInvocation('--phase must match P<N>, for example P1');

  if (authoring && taskPath && looksLikeTaskId(taskPath))
    return badInvocation(
      '--authoring requires the exact created ticket path returned by sdd-new, not a Task-ID'
    );

  if (projectFeasibility) {
    const selectedRoot = positional[0] ?? ticketProjectRoot;
    const rootIssue = selectedRootIssue(selectedRoot);
    if (rootIssue) return readFailed(rootIssue.path, rootIssue.reason);
    const repoRoot = realpathSync(resolve(selectedRoot));
    const project = collectProjectSpecRefs(repoRoot);
    if (!project.ok) return readFailed(project.issue.path, project.issue.reason);
    const feasibility = checkProjectFeasibility(project.refs);
    const formatted = formatFindings(feasibility, project.refs.length, {
      repairHint:
        'resume evolve-scope at the external-dependencies audit, repair the named project capability facts, and rerun --project-feasibility before spec approval.',
    });
    const context =
      formatted.exitCode === 0
        ? `\nproject-context: ${JSON.stringify(deriveProjectFeasibilityContext(project.refs))}`
        : '';
    const adapterContract = `\ncapability-contract: ${JSON.stringify(deriveCapabilityAdapterContract())}`;
    return {
      text: `[sdd-check] project feasibility (spec graph)\n${formatted.text}${context}${adapterContract}`,
      exitCode: formatted.exitCode,
    };
  }

  if (scaffoldPlanPath) {
    const selectedRoot = positional[0] ?? ticketProjectRoot;
    const rootIssue = selectedRootIssue(selectedRoot);
    if (rootIssue) return readFailed(rootIssue.path, rootIssue.reason);
    const repoRoot = realpathSync(resolve(selectedRoot));
    const project = collectProjectSpecRefs(repoRoot);
    if (!project.ok) return readFailed(project.issue.path, project.issue.reason);
    const loadedPlan = loadScaffoldDraftPlan(repoRoot, scaffoldPlanPath);
    if (!loadedPlan.ok) return loadedPlan.result;
    const feasibility = checkScaffoldDraftPlan(project.refs, loadedPlan.plan);
    const formatted = formatFindings(feasibility, loadedPlan.plan.nodes.length, {
      repairHint:
        'repair the named draft-plan mapping/order facts and rerun the same --scaffold-plan command before presenting Gate 1.',
    });
    const planDigest = `sha256:${createHash('sha256').update(loadedPlan.content).digest('hex')}`;
    return {
      text: `[sdd-check] scaffold draft plan (pre-Gate-1)\n${formatted.text}\nplan-digest: ${planDigest}`,
      exitCode: formatted.exitCode,
    };
  }

  if (scaffoldFeasibility) {
    const selectedRoot = positional[0] ?? ticketProjectRoot;
    const rootIssue = selectedRootIssue(selectedRoot);
    if (rootIssue) return readFailed(rootIssue.path, rootIssue.reason);
    const repoRoot = realpathSync(resolve(selectedRoot));
    const corpus = collectTicketCorpus(repoRoot);
    if (!corpus.ok) return readFailed(selectedRoot, corpus.detail);

    const packageHead = readHeadContent(repoRoot, 'package.json');
    if (packageHead.status === 'error')
      return gitEvidenceError(packageHead.operation, packageHead.exitCode, packageHead.stderr);
    let packageContent = packageHead.status === 'ok' ? packageHead.content : '{}';
    if (packageHead.status === 'no-head') {
      const observed = readUtf8(join(repoRoot, 'package.json'));
      if (observed.ok) packageContent = observed.value;
    }
    let parsedPackage: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    try {
      parsedPackage = JSON.parse(packageContent) as typeof parsedPackage;
    } catch {
      return readFailed('package.json@HEAD', 'clean-HEAD package.json is not valid JSON');
    }
    const declaredPackages = new Set([
      ...Object.keys(parsedPackage.dependencies ?? {}),
      ...Object.keys(parsedPackage.devDependencies ?? {}),
      ...Object.keys(parsedPackage.optionalDependencies ?? {}),
    ]);
    const activeLockfiles: string[] = [];
    for (const lockfile of [
      'package-lock.json',
      'npm-shrinkwrap.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
    ]) {
      const head = readHeadContent(repoRoot, lockfile);
      if (head.status === 'error')
        return gitEvidenceError(head.operation, head.exitCode, head.stderr);
      if (head.status === 'ok') activeLockfiles.push(lockfile);
      else if (head.status === 'no-head' && existsSync(join(repoRoot, lockfile)))
        activeLockfiles.push(lockfile);
    }
    const baseline = {
      declaredPackages,
      activeLockfiles,
      scripts: parsedPackage.scripts ?? {},
      availableArtifacts: new Set(
        phaseVerificationArtifactPaths().filter((path) => existsSync(join(repoRoot, path)))
      ),
    };
    const feasibility = checkScaffoldFeasibility(corpus.refs, baseline);
    let approvedPlanDigest = '';
    if (approvedPlanPath) {
      const project = collectProjectSpecRefs(repoRoot);
      if (!project.ok) return readFailed(project.issue.path, project.issue.reason);
      const loadedPlan = loadScaffoldDraftPlan(repoRoot, approvedPlanPath);
      if (!loadedPlan.ok) return loadedPlan.result;
      feasibility.push(...checkScaffoldDraftPlan(project.refs, loadedPlan.plan));
      feasibility.push(
        ...checkScaffoldPlanMaterialization(
          loadedPlan.plan,
          materializedScaffoldPlanNodes(corpus.refs)
        )
      );
      approvedPlanDigest = `\napproved-plan-digest: sha256:${createHash('sha256').update(loadedPlan.content).digest('hex')}`;
    }
    for (const item of feasibility) {
      if (item.file !== '(scaffold graph)') item.file = relative(repoRoot, item.file) || item.file;
    }
    const formatted = formatFindings(feasibility, corpus.refs.length, {
      repairHint:
        'repair the named scaffold graph facts, then rerun the same --scaffold-feasibility command before the semantic critic.',
    });
    const criticContext =
      formatted.exitCode === 0
        ? `\ncritic-context: ${JSON.stringify(
            deriveScaffoldCriticContext(corpus.refs, baseline, (file) =>
              relative(repoRoot, file).split(sep).join('/')
            )
          )}`
        : '';
    return {
      text: `[sdd-check] scaffold feasibility (clean HEAD)\n${formatted.text}${approvedPlanDigest}${criticContext}`,
      exitCode: formatted.exitCode,
    };
  }

  if (reviewPublicationSelected) {
    const bundle = resolveReviewBundle(reviewPublicationPaths, reviewPublicationError);
    if (bundle.status === 'error') return bundle.result;
    const publication = deriveReviewPublicationSet(
      bundle.repoRoot,
      bundle.members,
      bundle.writeSetPaths
    );
    if (!publication.ok) {
      if ('git' in publication) {
        return gitEvidenceError(
          publication.git.operation,
          publication.git.exitCode,
          publication.git.stderr
        );
      }
      return reviewPublicationError(publication.reason);
    }
    return {
      text: [
        '[sdd-check] review-publication',
        `primary: ${bundle.primary.path}`,
        `target-set: ${bundle.targetSet}`,
        `write-set: ${bundle.writeSet}`,
        `publication-set: ${JSON.stringify(publication.entries)}`,
        `publication-state: ${publication.fingerprint}`,
      ].join('\n'),
      exitCode: 0,
    };
  }

  if (reviewStateSelected) {
    const bundle = resolveReviewBundle(reviewStatePaths, reviewStateError);
    if (bundle.status === 'error') return bundle.result;
    if (hasCriticRoundsSection(bundle.primary.content)) {
      const latest = latestCriticTargetSet(bundle.primary.content);
      if (latest === null) {
        return reviewStateError(
          `primary \`${bundle.primary.path}\` has malformed Critic Rounds; repair or remove the broken history before dispatch.`
        );
      }
      if (formatCriticTargetSet(latest) !== bundle.targetSet) {
        return reviewStateError(
          `primary \`${bundle.primary.path}\` history targets \`${formatCriticTargetSet(latest)}\`, but this invocation targets \`${bundle.targetSet}\`; start a fresh target-set cycle instead of continuing ambiguous history.`
        );
      }
      const latestWriteSet = latestCriticWriteSet(bundle.primary.content);
      if (latestWriteSet === null) {
        return reviewStateError(
          `primary \`${bundle.primary.path}\` has malformed or missing Write-set evidence; repair or restart that history before dispatch.`
        );
      }
      if (formatCriticTargetSet(latestWriteSet) !== bundle.writeSet) {
        return reviewStateError(
          `primary \`${bundle.primary.path}\` history writes \`${formatCriticTargetSet(latestWriteSet)}\`, but current manifests derive \`${bundle.writeSet}\`; promote/demote members only by restarting at Round 1.`
        );
      }
      const readiness = checkCriticReadinessForTargetSet(
        bundle.primary.path,
        bundle.primary.content,
        latest,
        formatCriticChangedState(bundle.members),
        bundle.writeSetPaths
      );
      if (readiness.length === 0) {
        return reviewStateError(
          `primary \`${bundle.primary.path}\` critic cycle is already complete; run \`npx gennady sdd-check --review-ready ${bundle.primary.path}\` and do not dispatch another critic round.`
        );
      }
      const malformed = readiness.find((finding) => finding.code !== 'SDD_CRITIC_NOT_CLEAN');
      if (malformed) {
        return reviewStateError(
          `primary \`${bundle.primary.path}\` has invalid Critic Rounds (${malformed.code}): ${malformed.message}`
        );
      }
    }
    return {
      text: [
        '[sdd-check] review-state',
        `primary: ${bundle.primary.path}`,
        `target-set: ${bundle.targetSet}`,
        `write-set: ${bundle.writeSet}`,
        `changed-state: ${formatCriticChangedState(bundle.members)}`,
      ].join('\n'),
      exitCode: 0,
    };
  }

  const findings: Finding[] = [];
  let fileCount = 0;
  let taskBanner: string | null = null;

  if (reviewReadyPath) {
    const target = resolve(reviewReadyPath);
    if (!existsSync(target)) return reviewTargetError(reviewReadyPath);
    let targetIsDirectory = false;
    try {
      targetIsDirectory = statSync(target).isDirectory();
    } catch {
      return reviewTargetError(reviewReadyPath);
    }
    const repoRoot = findRepoRoot(targetIsDirectory ? target : dirname(target));
    const targetRel = relative(repoRoot, target);
    const candidates: string[] = [];
    try {
      if (targetIsDirectory) walkReviewMd(target, candidates, findings);
      else {
        const specsRoot = join(repoRoot, 'specs');
        const targetInsideSpecs =
          existsSync(specsRoot) &&
          (target === specsRoot || target.startsWith(`${specsRoot}${sep}`));
        // File mode scans only to discover the primary whose manifest names this member. Unrelated
        // review bundles must not make this exact target red; the resolved target-set is checked
        // fail-closed below.
        walkMd(targetInsideSpecs ? specsRoot : dirname(target), candidates);
      }
    } catch {
      candidates.push(target);
    }
    const reviewChanges = getChangedFiles(repoRoot);
    if (reviewChanges.status === 'error') {
      return gitEvidenceError(
        reviewChanges.operation,
        reviewChanges.exitCode,
        reviewChanges.stderr
      );
    }
    const changedSpecs = new Set(
      reviewChanges.files
        .filter((path) => path.endsWith('.spec.md'))
        .map((path) => resolve(repoRoot, path))
    );
    const reviewMembers: { file: string; content: string | null; manifestOk: boolean }[] = [];
    for (const file of candidates.filter((candidate) => candidate.endsWith('.spec.md')).sort()) {
      let content: string | null = null;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        findings.push({
          severity: 'error',
          code: 'SDD_REVIEW_READY_MEMBER_UNREADABLE',
          file,
          message: 'Review target contains an unreadable `*.spec.md`; readiness cannot skip it.',
        });
        reviewMembers.push({ file, content: null, manifestOk: false });
        fileCount++;
        continue;
      }
      const manifest = extractSection(content, 'CHANGE_MANIFEST');
      if (!targetIsDirectory) {
        const isRequestedFile = resolve(file) === target;
        const isOwningPrimary =
          hasCriticRoundsSection(content) &&
          latestCriticTargetSet(content)?.includes(targetRel) === true;
        if (!isRequestedFile && !isOwningPrimary) continue;
      }
      const historyVisible = hasCriticRoundsSection(content);
      const reviewHint =
        manifest.status === 'ok' ||
        content.includes('SECTION:CHANGE_MANIFEST') ||
        /^[ \t]*[✚~] /m.test(content) ||
        historyVisible;
      if (!reviewHint && !changedSpecs?.has(resolve(file))) continue;
      const manifestOk = manifest.status === 'ok';
      reviewMembers.push({ file, content, manifestOk });
      if (!manifestOk && (manifest.status !== 'not_found' || !historyVisible)) {
        findings.push({
          severity: 'error',
          code: 'SDD_REVIEW_READY_MEMBER_MALFORMED',
          file,
          message: changedSpecs?.has(resolve(file))
            ? 'Changed spec has no valid CHANGE_MANIFEST; enter review-state before integrated readiness.'
            : `Review-state marker is ${manifest.status}; repair CHANGE_MANIFEST before readiness can be evaluated.`,
        });
      } else {
        findings.push(...checkReviewState(file, content));
      }
      fileCount++;
    }
    let primary: (typeof reviewMembers)[number] | null = null;
    const evidenceMembers = reviewMembers.filter((member) => {
      if (member.content === null || !hasCriticRoundsSection(member.content)) return false;
      if (targetIsDirectory) return true;
      return latestCriticTargetSet(member.content)?.includes(targetRel) === true;
    });
    if (evidenceMembers.length !== 1) {
      findings.push({
        severity: 'error',
        code: 'SDD_CRITIC_PRIMARY_COUNT_INVALID',
        file: reviewReadyPath,
        message: targetIsDirectory
          ? `Review bundle must contain exactly one primary artifact with Critic Rounds evidence; found ${evidenceMembers.length}.`
          : `Secondary/file invocation must resolve to exactly one primary whose integrated target-set contains \`${targetRel}\`; found ${evidenceMembers.length}.`,
      });
    } else {
      primary = evidenceMembers[0] as (typeof reviewMembers)[number];
    }
    const expectedTargetSet =
      primary?.content === null || primary === null ? null : latestCriticTargetSet(primary.content);
    if (primary?.content !== null && primary !== null) {
      const primaryRel = relative(repoRoot, primary.file);
      const scopeSet = scopeReviewTargetSet(repoRoot, primaryRel, primary.content);
      if (scopeSet.status === 'invalid') {
        findings.push({
          severity: 'error',
          code:
            scopeSet.subject === 'scope'
              ? 'SDD_SCOPE_DECOMPOSITION_INCOMPLETE'
              : 'SDD_MODULE_SCOPE_OWNERSHIP_INVALID',
          file: primary.file,
          message:
            scopeSet.subject === 'scope'
              ? `Product/library review cannot finish before module decomposition is complete: ${scopeSet.reason}. Continue through /sdd into the module flow.`
              : `Module primary has invalid scope ownership: ${scopeSet.reason}. Resolve one declared owning scope and use that scope as primary.`,
        });
      } else if (scopeSet.status === 'wrong-primary') {
        findings.push({
          severity: 'error',
          code: 'SDD_CRITIC_PRIMARY_SCOPE_REQUIRED',
          file: primary.file,
          message: `Module cannot own Critic Rounds; use owning scope \`${scopeSet.owner}\` as primary with exact target-set \`${scopeSet.targetSet}\`.`,
        });
      } else if (
        scopeSet.status === 'complete' &&
        (expectedTargetSet === null ||
          formatCriticTargetSet(expectedTargetSet) !== scopeSet.targetSet)
      ) {
        findings.push({
          severity: 'error',
          code: 'SDD_CRITIC_TARGET_SET_INCOMPLETE',
          file: primary.file,
          message: `Product/library readiness requires the complete integrated target-set \`${scopeSet.targetSet}\`.`,
        });
      }
    }
    if (expectedTargetSet) {
      const expectedSet = new Set(expectedTargetSet);
      for (const member of targetIsDirectory ? reviewMembers : []) {
        if (member.content === null) continue;
        const rel = relative(repoRoot, member.file);
        if (!expectedSet.has(rel)) {
          findings.push({
            severity: 'error',
            code: 'SDD_CRITIC_TARGET_SET_INCOMPLETE',
            file: member.file,
            message: `Changed review-state member \`${rel}\` is absent from the integrated critic target-set.`,
          });
        }
      }
      for (const rel of expectedTargetSet) {
        const abs = resolve(repoRoot, rel);
        let valid = abs.startsWith(`${repoRoot}${sep}`) && abs.endsWith('.spec.md');
        try {
          valid = valid && statSync(abs).isFile();
        } catch {
          valid = false;
        }
        if (!valid) {
          findings.push({
            severity: 'error',
            code: 'SDD_CRITIC_TARGET_SET_INVALID',
            file: reviewReadyPath,
            message: `Critic target-set entry does not resolve to a repo-local spec file: ${rel}.`,
          });
        }
      }
    }
    let expectedChangedState: string | null = null;
    let expectedWriteSet: string[] | null = null;
    if (primary?.content !== null && primary !== null && expectedTargetSet) {
      const primaryRel = relative(repoRoot, primary.file);
      const stateMembers: { path: string; content: string; primary: boolean }[] = [];
      for (const rel of expectedTargetSet) {
        try {
          const abs = resolve(repoRoot, rel);
          const content = readFileSync(abs, 'utf-8');
          stateMembers.push({
            path: rel,
            content,
            primary: rel === primaryRel,
          });
          if (!targetIsDirectory && !reviewMembers.some((member) => resolve(member.file) === abs)) {
            const manifest = extractSection(content, 'CHANGE_MANIFEST');
            const reviewHint =
              manifest.status === 'ok' ||
              content.includes('SECTION:CHANGE_MANIFEST') ||
              /^[ \t]*✚ /m.test(content);
            if (reviewHint || changedSpecs?.has(abs)) {
              fileCount++;
              if (manifest.status !== 'ok') {
                findings.push({
                  severity: 'error',
                  code: 'SDD_REVIEW_READY_MEMBER_MALFORMED',
                  file: abs,
                  message: changedSpecs?.has(abs)
                    ? 'Changed spec has no valid CHANGE_MANIFEST; enter review-state before integrated readiness.'
                    : `Review-state marker is ${manifest.status}; repair CHANGE_MANIFEST before readiness can be evaluated.`,
                });
              } else {
                findings.push(...checkReviewState(abs, content));
              }
            }
          }
        } catch {
          // The invalid target-set finding above already owns the unreadable/missing member.
        }
      }
      const historyCount = stateMembers.filter((member) =>
        hasCriticRoundsSection(member.content)
      ).length;
      if (historyCount !== 1) {
        findings.push({
          severity: 'error',
          code: 'SDD_CRITIC_PRIMARY_COUNT_INVALID',
          file: reviewReadyPath,
          message: `Integrated target-set must carry Critic Rounds in exactly one primary artifact; found ${historyCount}.`,
        });
      }
      if (stateMembers.length === expectedTargetSet.length)
        expectedChangedState = formatCriticChangedState(stateMembers);
      const derivedWriteSet = reviewWriteSet(stateMembers);
      if (derivedWriteSet.status === 'invalid') {
        findings.push({
          severity: 'error',
          code: 'SDD_CRITIC_WRITE_SET_INVALID',
          file: reviewReadyPath,
          message: derivedWriteSet.reason,
        });
      } else {
        expectedWriteSet = derivedWriteSet.paths;
      }
    }
    if (primary?.content !== null && primary !== null) {
      findings.push(
        ...checkCriticReadinessForTargetSet(
          primary.file,
          primary.content,
          expectedTargetSet ?? null,
          expectedChangedState,
          expectedWriteSet
        )
      );
    }
    if (fileCount === 0) {
      findings.push({
        severity: 'error',
        code: 'SDD_REVIEW_READY_NO_REVIEW_STATE',
        file: reviewReadyPath,
        message: 'Target contains no review-state `*.spec.md` with a CHANGE_MANIFEST.',
      });
    }
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
    if (!authoring) findings.push(...checkTicketCoveragePolicy(effectivePath, content));
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
        findings.push(...checkReviewState(file, content));
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
        findings.push(...checkDeltaDiagram(file, content));
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
  if (!taskPath) {
    for (const f of findings) f.file = relative(process.cwd(), resolve(f.file)) || f.file;
  }

  if (authoring) {
    for (const finding of findings) finding.severity = 'error';
  }

  logger.debug(`[SddCheckCommand#run] ${findings.length} finding(s) across ${fileCount} file(s)`);
  const result = formatFindings(
    findings,
    fileCount,
    authoring
      ? {
          maxFindings: 12,
          repairHint: 'fix only this ticket, then rerun the same authoring command.',
        }
      : {}
  );
  return taskBanner ? { text: `${taskBanner}\n${result.text}`, exitCode: result.exitCode } : result;
}

// Self-executing for CLI: gennady sdd-check (--task <ticket> | --all [root])
const result = await run(process.argv);
console.log(result.text);
process.exit(result.exitCode);
