// @file: SddCheckCommand — CLI entry for gennady sdd-check: mechanical audit of one ticket (--task) or the whole project (--all).
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { logger } from '#logger';
import { execSyncSafe } from '../../../shared/common/exec.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { getChangedSourceFiles, getHeadContent } from '../../../shared/common/changed-files.ts';
import {
  checkTicket,
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
import type { GraphEdge } from '../../../shared/sdd/portal.ts';
import { parseScopes, parseGraphEdges } from '../../../shared/sdd/portal.ts';
import {
  detectFlowVersion,
  detectScopeFlowVersion,
  type FlowVersion,
} from '../../../shared/sdd/flow.ts';
import { checkSpecMermaid } from '../../../shared/sdd/mermaid-check.ts';
import { parseTrackerRows } from '../../../shared/sdd/tracker.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import {
  parseMetaInfo,
  parsePhaseDetail,
  parsePhasesOverview,
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
import { badInvocation, fileError, formatFindings, type CheckResult } from './sdd-check.types.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
]);

/** @purpose Recursively collect .md files under a directory, skipping system/build dirs and symlinks. */
function walkMd(dir: string, acc: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, acc);
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

/** @purpose Check every `](….xml)` rule link in a ticket resolves on disk — checkSpecLinks mirror for phase Rules (shift-left for scaffold). | @param file Ticket path. | @param content Ticket markdown. | @returns Findings for unresolved rule links. */
function checkRuleLinks(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const dir = dirname(file);
  for (const m of content.matchAll(/\]\(([^)`#]+\.xml)(?:#[^)]*)?\)/g)) {
    const target = m[1];
    if (!target) continue;
    if (!existsSync(resolve(dir, target))) {
      findings.push({
        severity: 'error',
        code: 'SDD_BROKEN_RULE_LINK',
        file,
        message: `Referenced rule file does not resolve on disk: ${target}. Fix: correct the link to the real rule file under ai/directives/, or drop it from Rules: if it does not apply.`,
      });
    }
  }
  return findings;
}

// Cache: rule-file id (repo-root-relative path) → its declared <DependsOn> entries. Rule files are
// shared across many tickets in a --all run; read each one at most once.
const ruleDepsCache = new Map<string, string[]>();

/** @purpose Read + parse one rule file's `<DependsOn>` entries, memoized. | @param repoRoot Repository root. | @param ruleId Repo-root-relative rule-file path. | @returns Declared dependency ids; empty when the file is unreadable or has no `<DependsOn>`. */
function getRuleDeps(repoRoot: string, ruleId: string): string[] {
  const cached = ruleDepsCache.get(ruleId);
  if (cached) return cached;
  let content = '';
  try {
    content = readFileSync(resolve(repoRoot, ruleId), 'utf-8');
  } catch {
    ruleDepsCache.set(ruleId, []);
    return [];
  }
  const deps = parseRuleDependsOn(content);
  ruleDepsCache.set(ruleId, deps);
  return deps;
}

/** @purpose Expand a seed rule-id set into the full reachable `<DependsOn>` graph, reading each file at most once. | @param repoRoot Repository root. | @param seeds A phase's Rules: ids (normalized). | @returns rule id → its deps, covering every node reachable from `seeds`. */
function buildRuleDepsMap(repoRoot: string, seeds: string[]): RuleDepsMap {
  const map: RuleDepsMap = new Map();
  const stack = [...seeds];
  while (stack.length) {
    const id = stack.pop() as string;
    if (map.has(id)) continue;
    const deps = getRuleDeps(repoRoot, id);
    map.set(id, deps);
    for (const d of deps) if (!map.has(d)) stack.push(d);
  }
  return map;
}

/** @purpose RULES_CASCADE_CLOSURE for one ticket — per phase, verify the Rules: list is already the transitive `<DependsOn>` closure. | @param file Ticket path. | @param content Ticket markdown. | @param repoRoot Repository root (anchors rule-link resolution). | @returns SDD_RULES_CASCADE_UNRESOLVED findings, if any. */
function checkTicketRulesCascade(file: string, content: string, repoRoot: string): Finding[] {
  const overviewSec = extractSection(content, 'PHASES_OVERVIEW');
  if (overviewSec.status !== 'ok') return [];
  const findings: Finding[] = [];
  for (const p of parsePhasesOverview(overviewSec.content)) {
    const phaseSec = extractSection(content, `PHASE_${p.id}`);
    if (phaseSec.status !== 'ok') continue;
    const ruleIds = parsePhaseDetail(phaseSec.content)
      .rules.filter((r) => r.endsWith('.xml'))
      .map((r) => normalizeRulePath(file, repoRoot, r));
    if (ruleIds.length === 0) continue;
    const depsMap = buildRuleDepsMap(repoRoot, ruleIds);
    findings.push(...checkRulesCascadeClosure(file, p.id, ruleIds, depsMap));
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
    const out = execSyncSafe(
      `grep -rlF --include='*.ts' --include='*.tsx' --include='*.js' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git -- ${JSON.stringify(e.name)} ${JSON.stringify(repoRoot)} 2>/dev/null`,
      { expectedExitCodes: [1] }
    );
    const files = out
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
    let spec: string;
    try {
      spec = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
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
 * @returns CheckResult — the ESLint-style report and exit code.
 */
export async function run(rawArgs: string[]): Promise<CheckResult> {
  const args = parseArgs(rawArgs, { task: ['task'], all: ['all'], changed: ['changed'] });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-check'
  );
  // Accept both `--task=<path>` (value on the flag) and `--task <path>` (path as the next positional).
  let taskPath: string | undefined;
  if (typeof args.task === 'string') taskPath = args.task;
  else if (args.task === true) taskPath = positional[0];
  const all = args.all === true || args.all === 'true';
  const changed = args.changed === true || args.changed === 'true';

  if (!taskPath && !all && !changed) return badInvocation();

  const findings: Finding[] = [];
  let fileCount = 0;

  if (taskPath) {
    let content: string;
    try {
      content = readFileSync(resolve(taskPath), 'utf-8');
    } catch {
      return fileError(taskPath);
    }
    const repoRoot = process.cwd();
    findings.push(...checkTicket(taskPath, content));
    findings.push(...checkRuleLinks(taskPath, content));
    findings.push(...checkSpecRefs(taskPath, content));
    findings.push(...checkResearchRefs(taskPath, content));
    findings.push(...(await checkSpecMermaid(taskPath, content)));
    findings.push(...checkTicketRulesCascade(taskPath, content, repoRoot));
    findings.push(...checkTicketBddCoverage(taskPath, content, repoRoot));
    if (specFlowVersion(resolve(taskPath)) === 'v2')
      findings.push(...checkSpecLanguage(taskPath, content));
    if (isV2SpecsTicket(taskPath)) findings.push(...checkTaskIdGrammar(taskPath, content));
    fileCount = 1;
  } else if (changed) {
    // #region START_CHANGED — invariant: TASKS_APPEND_ONLY + CONSUMERS_RESOLVABLE run over changed source files, not the full spec/ticket tree
    const root = resolve(positional[0] ?? '.');
    for (const rel of getChangedSourceFiles(root)) {
      const abs = join(root, rel);
      let content: string;
      try {
        content = readFileSync(abs, 'utf-8');
      } catch {
        continue;
      }
      findings.push(...checkTasksAppendOnly(rel, content, getHeadContent(root, rel)));
      findings.push(...checkFileConsumersResolvable(rel, content, root, resolve(abs)));
      fileCount++;
    }
    // #endregion END_CHANGED
  } else {
    // Strict v2 spec rules (mandatory diagram, module floor, folded detail, language lint) apply
    // per scope: a migrated scope (tasks/<scope>/ removed) is checked strictly while v1 neighbours stay lenient.
    // v1 sibling layout has tickets in tasks/, not specs/ — scan both when present; a scoped root
    // with neither (`--all specs/<scope>`, `--all tasks`) falls back to scanning `root` itself.
    // #region START_ALL — invariant: scan specs/ AND tasks/ when both exist at `root`, else `root`
    const root = resolve(positional[0] ?? '.');
    const repoRoot = findRepoRoot(root);
    const specsRoot = join(root, 'specs');
    const tasksRoot = join(root, 'tasks');
    const bases = [specsRoot, tasksRoot].filter((d) => existsSync(d));
    if (bases.length === 0) bases.push(root);
    const portalFile = join(specsRoot, 'README.md');
    const mdFiles: string[] = [];
    for (const b of bases) walkMd(b, mdFiles);
    // Pre-read the portal Scope Graph once — every scope spec is cross-checked against it (B5).
    let portalEdges: GraphEdge[] = [];
    if (existsSync(portalFile)) {
      try {
        portalEdges = parseGraphEdges(readFileSync(portalFile, 'utf-8'));
      } catch {
        portalEdges = [];
      }
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
      let content: string;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
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
        findings.push(...checkRuleLinks(file, content));
        findings.push(...checkSpecRefs(file, content));
        findings.push(...checkTicketRulesCascade(file, content, repoRoot));
        findings.push(...checkTicketBddCoverage(file, content, repoRoot));
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

  logger.debug(`[SddCheckCommand#run] ${findings.length} finding(s) across ${fileCount} file(s)`);
  return formatFindings(findings, fileCount);
}

// Self-executing for CLI: gennady sdd-check (--task <ticket> | --all [root])
const result = await run(process.argv);
console.log(result.text);
process.exit(result.exitCode);
