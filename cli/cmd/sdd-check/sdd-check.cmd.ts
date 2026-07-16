// @file: SddCheckCommand — CLI entry for gennady sdd-check: mechanical audit of one ticket (--task) or the whole project (--all).
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  checkTicket,
  isTicket,
  checkPortal,
  checkTaskGraph,
  checkTrackers,
  checkSpecStructure,
  checkSpecLanguage,
  checkReviewState,
  checkModuleGraph,
  checkScopeDeps,
  moduleGraphEdges,
  ticketRef,
  type Finding,
  type TicketRef,
  type TrackerRowRef,
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
        message: `Referenced spec does not resolve on disk: ${target}`,
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
        message: `Referenced rule file does not resolve on disk: ${target}`,
      });
    }
  }
  return findings;
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
  const args = parseArgs(rawArgs, { task: ['task'], all: ['all'] });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-check'
  );
  // Accept both `--task=<path>` (value on the flag) and `--task <path>` (path as the next positional).
  let taskPath: string | undefined;
  if (typeof args.task === 'string') taskPath = args.task;
  else if (args.task === true) taskPath = positional[0];
  const all = args.all === true || args.all === 'true';

  if (!taskPath && !all) return badInvocation();

  const findings: Finding[] = [];
  let fileCount = 0;

  if (taskPath) {
    let content: string;
    try {
      content = readFileSync(resolve(taskPath), 'utf-8');
    } catch {
      return fileError(taskPath);
    }
    findings.push(...checkTicket(taskPath, content));
    findings.push(...checkRuleLinks(taskPath, content));
    findings.push(...checkSpecRefs(taskPath, content));
    findings.push(...(await checkSpecMermaid(taskPath, content)));
    if (specFlowVersion(resolve(taskPath)) === 'v2')
      findings.push(...checkSpecLanguage(taskPath, content));
    fileCount = 1;
  } else {
    // Strict v2 spec rules (mandatory diagram, module floor, folded detail, language lint) apply
    // per scope: a migrated scope (tasks/<scope>/ removed) is checked strictly while v1 neighbours stay lenient.
    // #region START_ALL — invariant: scan specs/ when present, else the given root
    const root = resolve(positional[0] ?? '.');
    const specsRoot = join(root, 'specs');
    const base = existsSync(specsRoot) ? specsRoot : root;
    const portalFile = join(specsRoot, 'README.md');
    const mdFiles: string[] = [];
    walkMd(base, mdFiles);
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
    const moduleEdgesByScope = new Map<string, { edges: GraphEdge[]; scopeFile: string }>();
    // Every ```mermaid block is validated through the real parser after the walk (collected here, parsed once mermaid+jsdom load lazily).
    const mermaidTargets: { file: string; content: string }[] = [];
    for (const file of mdFiles) {
      let content: string;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      if (content.includes('```mermaid')) mermaidTargets.push({ file, content });
      if (file === portalFile) {
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
      } else if (file.endsWith('.3-tasks.md') || file.endsWith('.2-tasks.md')) {
        for (const r of parseTrackerRows(content))
          trackerRowRefs.push({ file, taskId: r.taskId, status: r.status });
        fileCount++;
      } else if (isTicket(content)) {
        findings.push(...checkTicket(file, content));
        findings.push(...checkRuleLinks(file, content));
        findings.push(...checkSpecRefs(file, content));
        if (specFlowVersion(file) === 'v2') findings.push(...checkSpecLanguage(file, content));
        ticketRefs.push(ticketRef(file, content));
        fileCount++;
      }
    }
    findings.push(...checkTaskGraph(ticketRefs));
    findings.push(...checkTrackers(ticketRefs, trackerRowRefs));
    for (const [scope, { edges, scopeFile }] of moduleEdgesByScope) {
      findings.push(...checkModuleGraph(scope, scopeFile, edges));
    }
    for (const t of mermaidTargets) {
      findings.push(...(await checkSpecMermaid(t.file, t.content)));
    }
    // #endregion END_ALL
  }

  logger.debug(`[SddCheckCommand#run] ${findings.length} finding(s) across ${fileCount} file(s)`);
  return formatFindings(findings, fileCount);
}

// Self-executing for CLI: gennady sdd-check (--task <ticket> | --all [root])
const result = await run(process.argv);
console.log(result.text);
process.exit(result.exitCode);
