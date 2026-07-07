// @file: Pure mechanical SDD artifact checks (anchor balance, structure, status, exec-log integrity) — shared by sdd-check.
// @consumers: sdd-check.cmd
// @tasks: N/A

import { extractSection } from './section.ts';
import { parseMetaInfo, parsePhasesOverview } from './ticket.ts';
import { parseGraphEdges } from './portal.ts';
import type { Scope, GraphEdge } from './portal.ts';

/**
 * @purpose One audit finding.
 * @invariant `error` fails the gate; `warn` is advisory (reported, non-fatal).
 */
export type Finding = {
  /** @purpose Severity — error fails the gate, warn is advisory. */
  severity: 'error' | 'warn';
  /** @purpose Stable finding code token. */
  code: string;
  /** @purpose File the finding refers to. */
  file: string;
  /** @purpose Description with the issue and a location hint. */
  message: string;
};

// Scaffold placeholder: `<` then a letter or ellipsis (e.g. <ts>, <cmd>, <TBD>, <…>) — NOT an HTML
// comment/marker (`<!--…-->`) or closing tag (`</…>`), which start with `!` or `/`.
const PLACEHOLDER = /<[A-Za-z…][^>\s]*>/;

/**
 * @purpose True when a file looks like a ticket (carries both META and EXECUTION_LOG sections).
 * @param content Full file markdown.
 * @returns True when both section markers are present.
 */
export function isTicket(content: string): boolean {
  return (
    content.includes('<!--SECTION:META-->') && content.includes('<!--SECTION:EXECUTION_LOG-->')
  );
}

/** @purpose Collect section names whose open/close marker counts disagree. */
function unbalancedAnchors(content: string): string[] {
  const opens = new Map<string, number>();
  const closes = new Map<string, number>();
  for (const line of content.split('\n')) {
    const t = line.trim();
    const o = /^<!--SECTION:([A-Z][A-Z0-9_]*)-->$/.exec(t);
    const c = /^<!--\/SECTION:([A-Z][A-Z0-9_]*)-->$/.exec(t);
    if (o?.[1]) opens.set(o[1], (opens.get(o[1]) ?? 0) + 1);
    if (c?.[1]) closes.set(c[1], (closes.get(c[1]) ?? 0) + 1);
  }
  const names = new Set([...opens.keys(), ...closes.keys()]);
  return [...names].filter((n) => (opens.get(n) ?? 0) !== (closes.get(n) ?? 0));
}

/** @purpose Detect nested / interleaved SECTION markers — overlaps that balanced open/close counts miss. | @invariant SDD sections are FLAT (one open at a time); any open-while-open or cross-close breaks sdd-extract. | @param content Full markdown. | @returns Descriptions of each overlap (empty when sections are flat). */
function sectionOverlaps(content: string): string[] {
  const issues: string[] = [];
  const stack: string[] = [];
  for (const line of content.split('\n')) {
    const t = line.trim();
    const o = /^<!--SECTION:([A-Z][A-Z0-9_]*)-->$/.exec(t);
    const c = /^<!--\/SECTION:([A-Z][A-Z0-9_]*)-->$/.exec(t);
    if (o?.[1]) {
      const top = stack[stack.length - 1];
      if (top)
        issues.push(`${o[1]} opens while ${top} is still open — sections must be flat, not nested`);
      stack.push(o[1]);
    } else if (c?.[1]) {
      const top = stack[stack.length - 1];
      if (top === c[1]) stack.pop();
      else if (stack.includes(c[1])) {
        issues.push(
          `/${c[1]} closes while ${top} is the innermost open section — interleaved sections`
        );
        while (stack.length && stack[stack.length - 1] !== c[1]) stack.pop();
        stack.pop();
      }
    }
  }
  return issues;
}

/**
 * @purpose Detect whether the Execution Log ends in an unresolved BLOCKED state.
 * @param logBody The EXECUTION_LOG section body.
 * @returns True when a 🛑 BLOCKED entry has no later ✅ RESOLVED.
 */
function hasActiveBlocker(logBody: string): boolean {
  const lines = logBody.split('\n');
  let lastBlocked = -1;
  let lastResolved = -1;
  lines.forEach((line, i) => {
    if (/🛑|BLOCKED/.test(line)) lastBlocked = i;
    if (/✅|RESOLVED/.test(line)) lastResolved = i;
  });
  return lastBlocked !== -1 && lastBlocked > lastResolved;
}

/**
 * @purpose Run the mechanical checks against one ticket's content.
 * @invariant Pure — no I/O; cross-file checks (spec-link resolution, walking) live in the command.
 * @param file Path used in finding locations.
 * @param content Full ticket markdown.
 * @returns Findings (possibly empty); errors fail the gate.
 */
export function checkTicket(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const err = (code: string, message: string): void =>
    void findings.push({ severity: 'error', code, file, message });
  const warn = (code: string, message: string): void =>
    void findings.push({ severity: 'warn', code, file, message });

  // #region START_ANCHORS — invariant: every section's markers balance
  for (const name of unbalancedAnchors(content)) {
    err('SDD_ANCHOR_UNBALANCED', `Section ${name}: open/close markers do not balance.`);
  }
  for (const ov of sectionOverlaps(content)) {
    err('SDD_SECTION_OVERLAP', `${ov}. sdd-extract pulls one flat section — fix the marker order.`);
  }
  // #endregion END_ANCHORS

  // #region START_STRUCTURE — a ticket carries META and EXECUTION_LOG
  const metaSec = extractSection(content, 'META');
  const logSec = extractSection(content, 'EXECUTION_LOG');
  if (metaSec.status !== 'ok') err('SDD_MISSING_META', 'No usable META section.');
  if (logSec.status !== 'ok') err('SDD_MISSING_EXECUTION_LOG', 'No usable EXECUTION_LOG section.');
  // #endregion END_STRUCTURE

  // #region START_META — Task-ID present; Status parseable
  let isDone = false;
  if (metaSec.status === 'ok') {
    const meta = parseMetaInfo(metaSec.content);
    if (!meta.taskId) warn('SDD_MISSING_TASK_ID', 'Meta has no parseable Task-ID.');
    if (!meta.status)
      warn('SDD_STATUS_UNPARSEABLE', 'Meta Status is missing or not in `[x] STATE` form.');
    isDone = meta.status?.includes('[x]') ?? false;
  }
  // #endregion END_META

  // #region START_EXEC_LOG — invariant: no fabricated DONE; DONE implies no active blocker
  if (logSec.status === 'ok') {
    const logLines = logSec.content.split('\n');
    for (const line of logLines) {
      if (/\[x\]/.test(line) && PLACEHOLDER.test(line)) {
        err(
          'SDD_FABRICATED_DONE',
          `Checked [x] line with an unreplaced placeholder: "${line.trim()}"`
        );
      }
    }
    if (isDone && hasActiveBlocker(logSec.content)) {
      err(
        'SDD_DONE_WITH_ACTIVE_BLOCKER',
        'Status is DONE but the Execution Log ends with an unresolved BLOCKED.'
      );
    }
  }
  // #endregion END_EXEC_LOG

  // #region START_DONE_PLACEHOLDERS — a DONE ticket has no scaffold placeholders left
  if (isDone && PLACEHOLDER.test(content)) {
    warn(
      'SDD_DONE_WITH_PLACEHOLDERS',
      'Status is DONE but unreplaced <…> scaffold placeholders remain.'
    );
  }
  // #endregion END_DONE_PLACEHOLDERS

  // #region START_PHASES — phase graph resolves + is acyclic; overview ↔ sections; DONE ⇒ all phases checked
  const overviewSec = extractSection(content, 'PHASES_OVERVIEW');
  if (overviewSec.status === 'ok') {
    const phases = parsePhasesOverview(overviewSec.content);
    const ids = new Set(phases.map((p) => p.id));

    for (const p of phases) {
      for (const d of p.deps) {
        if (!ids.has(d))
          err('SDD_PHASE_DEP_UNRESOLVED', `Phase ${p.id} depends on unknown phase ${d}.`);
      }
    }

    if (hasCycle(phases.flatMap((p) => p.deps.map((d) => ({ from: p.id, to: d }))))) {
      err('SDD_PHASE_DAG_CYCLE', 'Phase dependency graph has a cycle.');
    }

    const sectionIds = new Set<string>();
    for (const m of content.matchAll(/<!--SECTION:PHASE_(P[0-9]+)-->/g))
      sectionIds.add(m[1] as string);
    for (const p of phases) {
      if (!sectionIds.has(p.id))
        err(
          'SDD_PHASE_SECTION_MISSING',
          `Phase ${p.id} in the overview has no PHASE_${p.id} section.`
        );
    }
    for (const s of sectionIds) {
      if (!ids.has(s))
        err('SDD_PHASE_SECTION_ORPHAN', `PHASE_${s} section has no row in the Phases Overview.`);
    }

    if (isDone) {
      for (const p of phases) {
        if (!p.status.includes('[x]'))
          err('SDD_DONE_PHASE_UNCHECKED', `Status is DONE but phase ${p.id} is not checked ([x]).`);
      }
    }
  }
  // #endregion END_PHASES

  return findings;
}

/**
 * @purpose Gathered portal facts for the integrity check — the command supplies the fs-derived spec dirs.
 * @invariant `specDirs` are the names of `specs/<dir>` directories that hold a `<dir>.spec.md` (top-level scope specs only).
 */
export type PortalInput = {
  /** @purpose Scopes parsed from the portal Scopes table. */
  scopes: Scope[];
  /** @purpose Depends-on edges parsed from the portal Scope Graph. */
  edges: GraphEdge[];
  /** @purpose Names of top-level `specs/<dir>` directories that contain a `<dir>.spec.md` on disk. */
  specDirs: string[];
};

/**
 * @purpose Detect a dependency cycle in the directed depends-on graph.
 * @param edges The graph edges.
 * @returns True when any cycle exists.
 */
function hasCycle(edges: GraphEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.from);
    if (list) list.push(e.to);
    else adj.set(e.from, [e.to]);
  }
  const state = new Map<string, 1 | 2>(); // 1 = on the current stack, 2 = fully explored
  const dfs = (n: string): boolean => {
    state.set(n, 1);
    for (const m of adj.get(n) ?? []) {
      const s = state.get(m);
      if (s === 1) return true;
      if (s === undefined && dfs(m)) return true;
    }
    state.set(n, 2);
    return false;
  };
  for (const n of adj.keys()) {
    if (state.get(n) === undefined && dfs(n)) return true;
  }
  return false;
}

/**
 * @purpose Run the mechanical integrity checks against the project portal (specs/README.md).
 * @invariant Pure — fs-derived `specDirs` are supplied by the caller; reports against the fixed `specs/README.md` path.
 * @param input The gathered portal facts: table scopes, graph edges, on-disk spec dirs.
 * @returns Findings (possibly empty); errors fail the gate.
 */
export function checkPortal(input: PortalInput): Finding[] {
  const { scopes, edges, specDirs } = input;
  const file = 'specs/README.md';
  const findings: Finding[] = [];
  const err = (code: string, message: string): void =>
    void findings.push({ severity: 'error', code, file, message });
  const names = new Set(scopes.map((s) => s.name));

  // The depends-on graph must be a DAG.
  if (hasCycle(edges)) err('SDD_PORTAL_GRAPH_CYCLE', 'Scope Graph has a dependency cycle.');

  // #region START_DANGLING — invariant: every graph edge connects scopes that exist in the table
  for (const e of edges) {
    if (!names.has(e.from))
      err(
        'SDD_PORTAL_DANGLING_DEP',
        `Graph edge from a scope not in the table: ${e.from} --> ${e.to}`
      );
    if (!names.has(e.to))
      err(
        'SDD_PORTAL_DANGLING_DEP',
        `Graph edge to a scope not in the table: ${e.from} --> ${e.to}`
      );
  }
  // #endregion END_DANGLING

  // #region START_COHERENCE — invariant: spec dirs ↔ table rows, and a done scope has its spec
  for (const d of specDirs) {
    if (!names.has(d))
      err('SDD_PORTAL_ORPHAN_SPEC', `Spec dir has no row in the portal Scopes table: specs/${d}/`);
  }
  for (const s of scopes) {
    if (s.status === 'done' && !specDirs.includes(s.name)) {
      err('SDD_PORTAL_SPEC_MISSING', `Scope marked done has no spec on disk: ${s.name}`);
    }
  }
  // #endregion END_COHERENCE

  return findings;
}

/** @purpose The graph-relevant fields of one ticket, built by the command from each ticket file. */
export type TicketRef = {
  /** @purpose Ticket file path (for finding locations). */
  file: string;
  /** @purpose Task-ID from Meta, or null when unparseable. */
  taskId: string | null;
  /** @purpose Status token from Meta (e.g. `[x] DONE`), or null. */
  status: string | null;
  /** @purpose Dependency Task-IDs declared in Meta. */
  dependencies: string[];
};

/** @purpose One Tracker-Index row plus the index file it came from. */
export type TrackerRowRef = {
  /** @purpose The `*.3-tasks.md` index file path. */
  file: string;
  /** @purpose Task-ID from the row. */
  taskId: string;
  /** @purpose Status cell text. */
  status: string;
};

/**
 * @purpose Build the task-graph fields of a ticket from its content.
 * @param file Ticket file path.
 * @param content Full ticket markdown.
 * @returns A TicketRef: the Meta Task-ID + dependencies (null / empty when absent).
 */
export function ticketRef(file: string, content: string): TicketRef {
  const metaSec = extractSection(content, 'META');
  const meta = metaSec.status === 'ok' ? parseMetaInfo(metaSec.content) : null;
  return {
    file,
    taskId: meta?.taskId ?? null,
    status: meta?.status ?? null,
    dependencies: meta?.dependencies ?? [],
  };
}

/** @purpose True when a Status token marks completion. | @param status Meta Status token (e.g. `[x] DONE`). | @returns True for a DONE status. */
function isDone(status: string | null | undefined): boolean {
  return status != null && /\bDONE\b/i.test(status);
}

/**
 * @purpose Compute the pickable task set — the deterministic execution map: which tickets are ready to run now.
 * @invariant Pickable = Status TODO (not DONE / not blocked) AND every dependency is DONE. Pure — derived from the gathered TicketRefs, never eyeballed.
 * @param refs Every ticket's graph fields (taskId, status, dependencies).
 * @returns The TicketRefs ready to execute, in input order.
 */
export function pickableTasks(refs: TicketRef[]): TicketRef[] {
  const statusById = new Map(
    refs.filter((r) => r.taskId).map((r) => [r.taskId as string, r.status])
  );
  // A placeholder "None" / "N/A" / "—" dependencies value means no real dependency.
  const realDeps = (deps: string[]): string[] =>
    deps.filter((d) => !/^(none|n\/a|[—-])\b/i.test(d.trim()));
  return refs.filter(
    (r) =>
      r.taskId != null &&
      /\bTODO\b/i.test(r.status ?? '') &&
      realDeps(r.dependencies).every((d) => isDone(statusById.get(d)))
  );
}

/**
 * @purpose Check the cross-ticket task DAG — Task-ID collisions, unresolved dependencies, cycles.
 * @invariant Pure — operates on the gathered TicketRefs; graph-wide findings use `(task graph)` as the location.
 * @param tickets Every ticket's graph fields, from the project tree.
 * @returns Findings (possibly empty); errors fail the gate.
 */
export function checkTaskGraph(tickets: TicketRef[]): Finding[] {
  const findings: Finding[] = [];

  const byId = new Map<string, string[]>();
  for (const t of tickets) {
    if (!t.taskId) continue;
    const seen = byId.get(t.taskId);
    if (seen) seen.push(t.file);
    else byId.set(t.taskId, [t.file]);
  }

  for (const [id, files] of byId) {
    if (files.length > 1) {
      findings.push({
        severity: 'error',
        code: 'SDD_TASK_ID_COLLISION',
        file: files[0] as string,
        message: `Task-ID ${id} is used by ${files.length} tickets: ${files.join(', ')}.`,
      });
    }
  }

  for (const t of tickets) {
    for (const d of t.dependencies) {
      if (!byId.has(d)) {
        findings.push({
          severity: 'error',
          code: 'SDD_DEP_UNRESOLVED',
          file: t.file,
          message: `Dependency ${d} resolves to no ticket in the tree.`,
        });
      }
    }
  }

  const edges = tickets
    .filter((t) => t.taskId)
    .flatMap((t) => t.dependencies.map((d) => ({ from: t.taskId as string, to: d })));
  if (hasCycle(edges)) {
    findings.push({
      severity: 'error',
      code: 'SDD_DAG_CYCLE',
      file: '(task graph)',
      message: 'Task dependency graph has a cycle.',
    });
  }

  return findings;
}

/**
 * @purpose Cross-check tickets against their Tracker-Index rows — status drift, missing rows, orphan rows.
 * @invariant Pure — set/status comparison over the gathered tickets + tracker rows, matched by Task-ID.
 * @param tickets Every ticket's graph fields (Task-ID + Status).
 * @param rows Every Tracker-Index row across the tree.
 * @returns Findings (possibly empty); errors fail the gate.
 */
export function checkTrackers(tickets: TicketRef[], rows: TrackerRowRef[]): Finding[] {
  const findings: Finding[] = [];
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

  const ticketIds = new Set(tickets.map((t) => t.taskId).filter((id): id is string => id !== null));
  const rowsById = new Map<string, TrackerRowRef[]>();
  for (const r of rows) {
    const seen = rowsById.get(r.taskId);
    if (seen) seen.push(r);
    else rowsById.set(r.taskId, [r]);
  }

  for (const t of tickets) {
    if (!t.taskId) continue;
    const trackerRows = rowsById.get(t.taskId);
    if (!trackerRows) {
      findings.push({
        severity: 'error',
        code: 'SDD_TRACKER_MISSING_ROW',
        file: t.file,
        message: `Ticket ${t.taskId} has no row in any Tracker Index.`,
      });
      continue;
    }
    if (t.status) {
      for (const r of trackerRows) {
        if (norm(r.status) !== norm(t.status)) {
          findings.push({
            severity: 'error',
            code: 'SDD_TRACKER_STATUS_DRIFT',
            file: r.file,
            message: `Tracker row for ${t.taskId} says "${norm(r.status)}" but the ticket Status is "${norm(t.status)}".`,
          });
        }
      }
    }
  }

  for (const r of rows) {
    if (!ticketIds.has(r.taskId)) {
      findings.push({
        severity: 'error',
        code: 'SDD_TRACKER_ORPHAN_ROW',
        file: r.file,
        message: `Tracker row ${r.taskId} points to no ticket on disk.`,
      });
    }
  }

  return findings;
}

/**
 * @purpose Minimal required section-anchor skeleton per scope-type — the load-bearing sections only.
 * @invariant Keyed by the `scope-type` value; a spec may carry MORE sections (the format grows) but never fewer.
 */
const REQUIRED_SECTIONS: Record<string, string[]> = {
  product: [
    'VISION',
    'GOLDEN_DX',
    'REQUIREMENTS_AND_CONSTRAINTS',
    'ARCHITECTURE',
    'DECISION_LOG',
    'MODULE_MAP',
  ],
  library: [
    'VISION',
    'GOLDEN_DX',
    'REQUIREMENTS_AND_CONSTRAINTS',
    'PUBLIC_API_SURFACE',
    'DECISION_LOG',
  ],
  infrastructure: ['VISION', 'TOOL_STACK', 'VERIFICATION_COMMANDS', 'DECISION_LOG'],
  interface: [
    'VISION',
    'INTERFACE_DECLARATION',
    'VERSIONING_POLICY',
    'COMPATIBILITY_MATRIX',
    'DECISION_LOG',
  ],
};

// Module size budget — soft signals (warn, never a gate) per AX_HIERARCHICAL_SPECS. Tunable, conservative.
// Many entities → the world is big → decompose into sub-modules. A long spec with a cohesive inventory
// → not too big, just verbose → compress the spec.
// Both budgets sit at the TAIL (~P90) of a real distribution so they flag genuine outliers, not the
// routine upper quartile — an advisory nudge that fires on a quarter of specs is just noise.
// ENTITY threshold calibrated against 63 module inventories: median 9, Q3 14, P90 20, max 50. The old
// value 12 sat between median and Q3 → fired on ~third of modules (the healthy core). 20 = P90: catches
// only the real outliers (the 16-30 bucket's top + the 3 monsters: activity-monitor 50, types 44, utils 32).
const MODULE_ENTITY_WARN_THRESHOLD = 20;
const MODULE_SPEC_VERBOSE_LINES = 750;

/** @purpose Count data rows of the first markdown table in a section (excludes header + `|---|` separator). | @param section Section body markdown. | @returns Entity-row count (0 when no table). */
function countInventoryRows(section: string): number {
  const rows = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && !/^\|[\s:|-]+$/.test(l));
  return Math.max(0, rows.length - 1);
}

/**
 * @purpose Mechanical structure checks for a spec file (.spec.md) — anchor balance + required sections per scope-type.
 * @invariant Pure; the required-sections check applies ONLY to scope specs (those carrying a SCOPE_TYPE section).
 * @param file Spec file path.
 * @param content Full spec markdown.
 * @returns Findings (possibly empty); errors fail the gate.
 */
export function checkSpecStructure(file: string, content: string): Finding[] {
  const findings: Finding[] = unbalancedAnchors(content).map((name) => ({
    severity: 'error' as const,
    code: 'SDD_ANCHOR_UNBALANCED',
    file,
    message: `Section ${name}: open/close markers do not balance.`,
  }));
  for (const ov of sectionOverlaps(content)) {
    findings.push({
      severity: 'error',
      code: 'SDD_SECTION_OVERLAP',
      file,
      message: `${ov}. sdd-extract pulls one flat section — fix the marker order.`,
    });
  }

  // Classify by the genuine module marker MODULE_VISION (a module spec also carries its parent's SCOPE_TYPE,
  // so SCOPE_TYPE alone does not make a scope). A scope = SCOPE_TYPE present, MODULE_VISION absent.
  const isModuleSpec = /<!--SECTION:MODULE_VISION-->/.test(content);
  const isScopeSpec = /<!--SECTION:SCOPE_TYPE-->/.test(content) && !isModuleSpec;

  // Scope bloat (warn, exit 0): a scope must stay a thin index — entity inventory / DbC contracts are
  // module-level detail (AX_SCOPE_STAYS_THIN). Categorical, not a fuzzy size threshold.
  if (isScopeSpec) {
    for (const sec of ['ENTITY_INVENTORY', 'MODULE_CONTRACTS'] as const) {
      if (new RegExp(`<!--SECTION:${sec}-->`).test(content)) {
        findings.push({
          severity: 'warn',
          code: 'SDD_SCOPE_BLOATED',
          file,
          message: `Scope spec carries module-level section ${sec} — move that detail into a module spec; a scope stays a thin index of modules (AX_SCOPE_STAYS_THIN).`,
        });
      }
    }
  }

  // Soft bloat signals (warn, exit 0): nudge toward decomposition (big world) or compression (verbose spec).
  if (isModuleSpec) {
    const inv = extractSection(content, 'ENTITY_INVENTORY');
    const entities = inv.status === 'ok' ? countInventoryRows(inv.content) : 0;
    if (entities > MODULE_ENTITY_WARN_THRESHOLD) {
      findings.push({
        severity: 'warn',
        code: 'SDD_MODULE_OVERSIZED',
        file,
        message: `Entity Inventory has ${entities} entities (> ${MODULE_ENTITY_WARN_THRESHOLD}) — decompose into sub-modules (AX_HIERARCHICAL_SPECS).`,
      });
    } else if (content.split('\n').length > MODULE_SPEC_VERBOSE_LINES) {
      findings.push({
        severity: 'warn',
        code: 'SDD_MODULE_SPEC_VERBOSE',
        file,
        message: `Module spec is ${content.split('\n').length} lines (> ${MODULE_SPEC_VERBOSE_LINES}) with a cohesive inventory — compress the spec (AX_HIERARCHICAL_SPECS).`,
      });
    }
  }

  const typeSec = extractSection(content, 'SCOPE_TYPE');
  if (typeSec.status === 'ok' && !isModuleSpec) {
    const type = Object.keys(REQUIRED_SECTIONS).find((t) =>
      new RegExp(`\\b${t}\\b`).test(typeSec.content)
    );
    if (type) {
      const present = new Set(
        [...content.matchAll(/<!--SECTION:([A-Z_]+)-->/g)].map((m) => m[1] as string)
      );
      for (const req of REQUIRED_SECTIONS[type] as string[]) {
        if (!present.has(req)) {
          findings.push({
            severity: 'error',
            code: 'SDD_SPEC_SECTION_MISSING',
            file,
            message: `${type} scope spec is missing required section ${req}.`,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * @purpose Parse a module spec's Inter-Module Dependencies (## 9) Mermaid graph into edges.
 * @invariant Reads ONLY the INTER_MODULE_DEPENDENCIES section; cross-scope dotted edges (`.->`) are ignored by parseGraphEdges.
 * @param content Full module-spec markdown.
 * @returns Edges (empty when the section or graph is absent).
 */
export function moduleGraphEdges(content: string): GraphEdge[] {
  const sec = extractSection(content, 'INTER_MODULE_DEPENDENCIES');
  return sec.status === 'ok' ? parseGraphEdges(sec.content) : [];
}

/** @purpose Extract scope-name tokens from a Scope Dependencies "Depends on" line (names + `prefix-*` wildcards; prose words are harmless extras). | @param section SCOPE_DEPENDENCIES section body. | @returns Tokens (empty when no "Depends on" line). */
function parseDependsOn(section: string): string[] {
  const m = /\*\*Depends on:\*\*\s*(.*)/i.exec(section);
  return m?.[1] ? [...m[1].matchAll(/[a-z][a-z0-9-]*\*?/gi)].map((x) => x[0]) : [];
}

/** @purpose True when a declared-deps token set covers a concrete dependency — exact match or a `prefix-*` wildcard. | @param tokens Tokens from "Depends on". | @param dep A concrete scope name from the portal graph. | @returns Whether the spec acknowledges the dependency. */
function coversDep(tokens: string[], dep: string): boolean {
  return tokens.some((t) => (t.endsWith('*') ? dep.startsWith(t.slice(0, -1)) : t === dep));
}

/**
 * @purpose Cross-check a scope spec's declared dependencies against the portal Scope Graph (B5) — the graph is authoritative, the spec must acknowledge each outgoing edge.
 * @invariant Warn-only; graph→spec direction only (reverse is too noisy). No SCOPE_DEPENDENCIES section → [] (module/legacy specs). Pure.
 * @param file Spec file path — error location and the source of the scope name (basename stem).
 * @param content Full scope-spec markdown.
 * @param portalEdges Edges parsed from the portal Scope Graph (specs/README.md).
 * @returns One warn per portal edge `<scope> --> <dep>` not acknowledged in the spec; empty when all covered or no deps section.
 */
export function checkScopeDeps(file: string, content: string, portalEdges: GraphEdge[]): Finding[] {
  const sec = extractSection(content, 'SCOPE_DEPENDENCIES');
  if (sec.status !== 'ok') return [];
  const scopeName = /([^/\\]+)\.(?:spec|1-spec)\.md$/.exec(file)?.[1];
  if (!scopeName) return [];
  const tokens = parseDependsOn(sec.content);
  const findings: Finding[] = [];
  for (const e of portalEdges) {
    if (e.from === scopeName && !coversDep(tokens, e.to)) {
      findings.push({
        severity: 'warn',
        code: 'SDD_SCOPE_DEP_UNDECLARED',
        file,
        message: `Portal Scope Graph has \`${scopeName} --> ${e.to}\` but the scope spec's Scope Dependencies does not list ${e.to} (AX_SCOPE_GRAPH_DISCIPLINE). Add it under "Depends on" (a name or a \`prefix-*\` wildcard), or fix the portal graph.`,
      });
    }
  }
  return findings;
}

/**
 * @purpose Detect a cycle in a scope's module dependency graph (edges unioned from every module's ## 9).
 * @invariant Cycle only — no dangling-ref check (the graph legitimately carries non-module nodes: entry points, shared libs).
 * @param scope Scope name (for the message).
 * @param scopeFile Scope spec path the finding is reported against.
 * @param edges Unioned inter-module edges for the scope.
 * @returns One SDD_MODULE_DAG_CYCLE error when cyclic, else empty.
 */
export function checkModuleGraph(scope: string, scopeFile: string, edges: GraphEdge[]): Finding[] {
  return hasCycle(edges)
    ? [
        {
          severity: 'error',
          code: 'SDD_MODULE_DAG_CYCLE',
          file: scopeFile,
          message: `Scope ${scope}: module dependency graph (## 9) has a cycle.`,
        },
      ]
    : [];
}

// An orphaned change-mark: a line beginning with ✚ (new) + space. Only ✚ is matched — it is unambiguous;
// ~ (changed) collides with legitimate markdown (file trees, diffs), so it is not used for detection.
const CHANGE_MARK = /^[ \t]*✚ /m;

/**
 * @purpose Track a spec's lifecycle state (master vs review-state) and flag broken or stuck review-states.
 * @invariant master = no CHANGE_MANIFEST and no ✚/~ marks; review-state = manifest (marks optional for greenfield). Mismatches surfaced per AX_SPEC_LIFECYCLE.
 * @param file Spec file path.
 * @param content Full spec markdown.
 * @returns Findings: SDD_REVIEW_INCONSISTENT (error) for a malformed review-state; SDD_REVIEW_STATE_STUCK (warn) for a lingering manifest.
 */
export function checkReviewState(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const manifest = extractSection(content, 'CHANGE_MANIFEST');
  const hasManifest = manifest.status === 'ok';
  const hasMarks = CHANGE_MARK.test(content);

  if (hasMarks && !hasManifest) {
    findings.push({
      severity: 'error',
      code: 'SDD_REVIEW_INCONSISTENT',
      file,
      message: `Found a ✚ change-mark but no CHANGE_MANIFEST — review-state is malformed (compress half-ran, or marks added without entering review-state). Add the manifest (CHANGE_MANIFEST_FORMAT) or strip the marks. AX_SPEC_LIFECYCLE.`,
    });
  }
  if (hasManifest) {
    if (!/ТИП ИЗМЕНЕНИЯ/.test(manifest.content)) {
      findings.push({
        severity: 'error',
        code: 'SDD_REVIEW_INCONSISTENT',
        file,
        message: `CHANGE_MANIFEST is missing the «ТИП ИЗМЕНЕНИЯ» field — the manifest is incomplete and cannot be reviewed or compressed. Fill the required fields (CHANGE_MANIFEST_FORMAT). AX_SPEC_LIFECYCLE.`,
      });
    }
    findings.push({
      severity: 'warn',
      code: 'SDD_REVIEW_STATE_STUCK',
      file,
      message: `Spec is in review-state (CHANGE_MANIFEST present). Finalize it: once external review approves («no comments»), run compress — remove the manifest + ✚/~ marks; if the change was abandoned, remove the manifest. A spec must not linger in review-state. AX_SPEC_LIFECYCLE.`,
    });
  }
  return findings;
}
