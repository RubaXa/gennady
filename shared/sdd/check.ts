// @file: Pure mechanical SDD artifact checks (anchor balance, structure, status, exec-log integrity) — shared by sdd-check.
// @consumers: sdd-check.cmd
// @tasks: N/A

import { dirname, basename, join, resolve } from 'node:path';
import { extractSection } from './section.ts';
import { parseMetaInfo, parsePhasesOverview } from './ticket.ts';
import { legacyHeaderBody } from './anchor-inject.ts';
import { parseGraphEdges } from './portal.ts';
import type { Scope, GraphEdge } from './portal.ts';
import type { FlowVersion } from './flow.ts';
import { SCOPE_KINDS, loadBearingSections, foldSections } from './templates.ts';

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
  /** @purpose 1-based line the finding points at, when a precise location is known. */
  line?: number;
};

// Scaffold placeholder: `<` then a letter or ellipsis (e.g. <ts>, <cmd>, <TBD>, <…>) — NOT an HTML
// comment/marker (`<!--…-->`) or closing tag (`</…>`), which start with `!` or `/`.
const PLACEHOLDER = /<[A-Za-z…][^>\s]*>/;

// Inline-code span (`` `…` ``) — stripped before testing for a literal `[x]` checkbox so a prose
// hint like "A `` `[x]` `` line…" (TASK_SKELETON's own Execution Log note) never reads as a checked
// line. The placeholder test still runs against the original line — a real checked line's own
// placeholder (e.g. `` `<ts>` ``) is conventionally backticked too, and must still be caught.
const CODE_SPAN = /`[^`]*`/g;

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

/**
 * @purpose True when a file looks like a pre-migration (v1) ticket — plain-markdown Meta + Execution Log headers, no `<!--SECTION-->` markers.
 * @invariant Callers must check `isTicket` first — an anchored ticket keeps its old plain headers too, so the two are not mutually exclusive alone.
 * @param content Full file markdown.
 * @returns True when both canonical headers resolve via `legacyHeaderBody`.
 */
export function isLegacyTicket(content: string): boolean {
  return (
    legacyHeaderBody(content, 'META') !== null &&
    legacyHeaderBody(content, 'EXECUTION_LOG') !== null
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
 * @purpose Scan an Execution Log for 🛑 BLOCKED / ✅ RESOLVED pairs (FIFO) — shared by checkTicket and sdd-task's [BLOCKERS], one parser instead of two.
 * @param logBody The EXECUTION_LOG section body.
 * @returns Text of each still-unresolved 🛑 BLOCKED line, oldest first; empty when every blocker has a later ✅ RESOLVED.
 */
export function scanBlockerTrail(logBody: string): string[] {
  const active: string[] = [];
  for (const line of logBody.split('\n')) {
    if (/🛑|BLOCKED/.test(line)) active.push(line.trim());
    else if (/✅|RESOLVED/.test(line)) active.shift();
  }
  return active;
}

/**
 * @purpose Detect whether the Execution Log ends in an unresolved BLOCKED state.
 * @param logBody The EXECUTION_LOG section body.
 * @returns True when a 🛑 BLOCKED entry has no later ✅ RESOLVED.
 */
function hasActiveBlocker(logBody: string): boolean {
  return scanBlockerTrail(logBody).length > 0;
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
      const withoutCodeSpans = line.replace(CODE_SPAN, '');
      if (/\[x\]/.test(withoutCodeSpans) && PLACEHOLDER.test(line)) {
        err(
          'SDD_FABRICATED_DONE',
          `Checked [x] line with an unreplaced placeholder: "${line.trim()}"`
        );
      }
    }
    if (hasActiveBlocker(logSec.content)) {
      if (isDone) {
        err(
          'SDD_DONE_WITH_ACTIVE_BLOCKER',
          'Status is DONE but the Execution Log ends with an unresolved BLOCKED.'
        );
      } else {
        warn(
          'SDD_BLOCKER_OPEN',
          'Execution Log ends with an unresolved 🛑 BLOCKED — no later ✅ RESOLVED. Resolve or explicitly reopen before the orchestrator relies on this ticket.'
        );
      }
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
  /** @purpose The ticket's own scope flow version — grades SDD_TRACKER_MISSING_ROW severity. Defaults to `'v1'` (conservative) when the caller omits it. */
  flowVersion?: FlowVersion;
};

/** @purpose One Tracker-Index row plus the index file it came from. */
export type TrackerRowRef = {
  /** @purpose The `*.3-tasks.md` index file path (or a legacy `tasks/<scope>/README.md` carrying an embedded Tracker table). */
  file: string;
  /** @purpose Task-ID from the row. */
  taskId: string;
  /** @purpose Status cell text. */
  status: string;
  /** @purpose The tracker file's own scope flow version — grades SDD_TRACKER_ORPHAN_ROW severity. Defaults to `'v1'` (conservative) when the caller omits it. */
  flowVersion?: FlowVersion;
};

/**
 * @purpose Build the task-graph fields of a ticket from its content.
 * @param file Ticket file path.
 * @param content Full ticket markdown.
 * @param [flowVersion] The ticket's own scope flow version (caller-supplied; not derivable from content alone).
 * @returns A TicketRef: the Meta Task-ID + dependencies (null / empty when absent).
 */
export function ticketRef(file: string, content: string, flowVersion?: FlowVersion): TicketRef {
  const metaSec = extractSection(content, 'META');
  const meta = metaSec.status === 'ok' ? parseMetaInfo(metaSec.content) : null;
  return {
    file,
    taskId: meta?.taskId ?? null,
    status: meta?.status ?? null,
    dependencies: meta?.dependencies ?? [],
    flowVersion,
  };
}

/**
 * @purpose Build a legacy ticket's task-graph fields — same shape as `ticketRef`, sourced from its plain-markdown Meta header instead of a SECTION marker.
 * @invariant This is what lights up the tracker cross-check and task DAG for legacy tickets.
 * @param file Ticket file path.
 * @param content Full ticket markdown (v1, plain headers).
 * @param [flowVersion] The ticket's own scope flow version.
 * @returns A TicketRef; null/empty fields when the Meta header is absent or unparseable.
 */
export function legacyTicketRef(
  file: string,
  content: string,
  flowVersion?: FlowVersion
): TicketRef {
  const metaBody = legacyHeaderBody(content, 'META');
  const meta = metaBody !== null ? parseMetaInfo(metaBody) : null;
  return {
    file,
    taskId: meta?.taskId ?? null,
    status: meta?.status ?? null,
    dependencies: meta?.dependencies ?? [],
    flowVersion,
  };
}

/**
 * @purpose Single advisory finding for a legacy ticket, in place of `checkTicket` (marker-dependent, would just drown the file in format-mismatch noise).
 * @param file Ticket file path.
 * @returns One SDD_LEGACY_TICKET_UNANCHORED warn.
 */
export function checkLegacyTicket(file: string): Finding[] {
  return [
    {
      severity: 'warn',
      code: 'SDD_LEGACY_TICKET_UNANCHORED',
      file,
      message:
        'Legacy ticket format (plain headers, no <!--SECTION--> markers) — only Task-ID/Status are checked here. Run `gennady sdd-migrate anchors` to enable the full structural check.',
    },
  ];
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
 * @invariant Pure — matched by Task-ID. STATUS_DRIFT is always `error`; MISSING_ROW/ORPHAN_ROW grade by
 *   `flowVersion` (default `'v1'`, like `checkBddCoverage`) — `warn` on legacy, `error` once migrated.
 * @param tickets Every ticket's graph fields (Task-ID + Status + scope flow version).
 * @param rows Every Tracker-Index row across the tree (+ its tracker file's scope flow version).
 * @returns Findings (possibly empty); errors fail the gate.
 */
export function checkTrackers(tickets: TicketRef[], rows: TrackerRowRef[]): Finding[] {
  const findings: Finding[] = [];
  // parseTrackerRows keeps the Status cell raw (backticks and all — sdd-sync's write-back needs the
  // byte-identical cell); the ticket Meta Status never carries backticks. Strip them here so a
  // formatting-only difference (`` `[x]` DONE `` vs `[x] DONE`) doesn't read as drift.
  const norm = (s: string): string => s.replace(/`/g, '').replace(/\s+/g, ' ').trim();
  const severityOf = (v: FlowVersion | undefined): 'error' | 'warn' =>
    v === 'v2' ? 'error' : 'warn';

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
        severity: severityOf(t.flowVersion),
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
        severity: severityOf(r.flowVersion),
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
 * @invariant Keyed by `scope-type`; a spec may carry MORE sections but never fewer. Derived from
 * `shared/sdd/templates.ts`'s `loadBearing:true` sections per kind — see templates.ts docs.
 */
export const REQUIRED_SECTIONS: Record<string, string[]> = Object.fromEntries(
  SCOPE_KINDS.map((k) => [k, loadBearingSections(k)])
);

/**
 * @purpose v2 module-spec load-bearing sections (AX_MODULE_SPEC_FLOOR).
 * @invariant v2-only; diagram presence is checked separately (SDD_NO_DIAGRAM_BLOCK). Derived from
 * `shared/sdd/templates.ts` (module kind, `loadBearing:true` sections).
 */
export const MODULE_REQUIRED_V2: string[] = loadBearingSections('module');

/**
 * @purpose v2 heavy/reference sections whose detail must fold under `<details>` (AX_SPEC_PROGRESSIVE_DISCLOSURE) — the machine part of the two-part spec (module AND scope specs).
 * @invariant Checked only when present; `PUBLIC_OPTIONS` excluded (real specs carry it unfolded). Derived
 * from `shared/sdd/templates.ts` — union of `fold:true` sections across scope-type kinds plus module.
 */
export const FOLD_REQUIRED_V2: string[] = Array.from(
  new Set([...SCOPE_KINDS, 'module' as const].flatMap((k) => foldSections(k)))
);

// Per-section hard line cap (v2 only) — the human-readable half of a spec must stay short; a section
// that blows past this is reference/machine detail masquerading as prose and must decompose (split
// into a module/sub-scope) or fold (join FOLD_REQUIRED_V2), not just grow. Sections already in
// FOLD_REQUIRED_V2 are exempt — folding is their containment mechanism, not a line count.
// Calibrated against 210 non-folded top-level sections across specs/**/*.spec.md: median 15, P75 22,
// P90 43, P95 55, P99 110, max 286. 120 sits just above P99 — it catches only the two genuine
// outliers in the corpus today (REQUIREMENTS_AND_CONSTRAINTS at 286 lines in agent-inbox.spec.md,
// MODULE_USAGE_EXAMPLE at 140 lines in cli/e2e/e2e.spec.md) without touching the routine tail.
const SECTION_LINE_HARD_LIMIT_V2 = 120;

// Table-cell policy (AX_SPEC_TABLE_IS_INDEX, v2 only): a table is an index, not text — one short
// line per cell; expanded content moves to a subsection below the table (as Entity Surfaces already
// does under Entity Inventory).
//
// TABLE_CELL_MAX_CHARS=120 — calibrated against every table cell in specs/**/*.spec.md (n=7078,
// fence-aware): median 15, P75 42, P90 74, P95 101, P99 201. 120 flags 3.2% of cells (229/7078);
// manual inspection of the flagged cells showed uniformly genuine paragraph-in-cell prose (e.g.
// cli/cli.spec.md, mr-stats.spec.md, dbc/lint.spec.md — the same class of pain as messenger's
// tessell-data FR table), not legitimate long single tokens (paths, commands). Both messenger pain
// examples sit far above this (tessell-data P90=197, host P90=190) — the threshold catches the
// examples that motivated this rule without touching this repo's already-short label/purpose cells.
const TABLE_CELL_MAX_CHARS = 120;

// TABLE_MAX_COLUMNS=6 — every table in specs/**/*.spec.md tops out at 5 columns (77 tables at 2, 137
// at 3, 26 at 4, 1 at 5); both messenger pain-example specs top out at 4. 6 is a ceiling above every
// observed table — it never fires on today's repo, only on a genuinely wide table added later.
const TABLE_MAX_COLUMNS = 6;

// A second sentence inside a cell (terminator + whitespace + capital letter) means the cell stopped
// being an index entry and became prose. Cheap and imperfect (misses trailing-sentence cells with no
// second clause; the "т.к."/"e.g." abbreviation case is rare and low-risk) but the false-positive
// rate on this repo's own tables is 1.4% (85/6092 cells), and every sampled hit was genuine
// multi-sentence prose, not a decimal/abbreviation/version-number false alarm.
const SENTENCE_BREAK = /[.!?]\s+[A-ZА-ЯЁ]/;

/** @purpose True when a section body carries at least one fenced code block (a diagram: mermaid or ASCII). | @param body Section markdown. | @returns Whether ≥1 ``` fence pair is present. */
function hasFencedBlock(body: string): boolean {
  return (body.match(/^```/gm) ?? []).length >= 2;
}

// Curated Cyrillic-anglicism list (AX_OPERATOR_DIALOGUE_STYLE): each entry is a hybrid
// English-root verb (or a translated idiom) a spec must not carry, plus the plain Russian to use
// instead. Deliberately short — only unambiguous calques, so the deterministic pre-filter never
// cries wolf; judgement calls stay with the audit's semantic language check.
//
// Boundary (revised): an established loanword-noun that engineers actually say aloud to each
// other — «пайплайн», «джоба» — is not a calque, it is just vocabulary; flagging it invites the
// false positives the module's own docstring warns against, so it stays OFF this list. A
// suржик hybrid — an English root wearing a Russian verb ending («чекать», «фиксить»,
// «имплементить», «фанаутить», «зафейлить», «засабмитить», «мёржит», «дропать», «линкует») reads
// as broken, not as vocabulary, and stays banned. «тула» (tool + «-а») is the same hybrid pattern
// as a noun, not an established borrowing the way «джоба» is — stays banned. «аппрув» /
// «реифицир-» stay banned: the regex also catches their verb-hybrid forms («аппрувить»,
// «реифицировать»), and `AX_OPERATOR_DIALOGUE_STYLE` itself uses both as its canonical
// anglicism-to-avoid examples.
const CALQUE_PATTERNS: { re: RegExp; say: string }[] = [
  { re: /аппрув[а-яё]*/giu, say: 'подтверждение' },
  { re: /реифицир[а-яё]*/giu, say: 'вынести в данные' },
  { re: /чек(ать|нуть|аем|ается)[а-яё]*/giu, say: 'проверить' },
  { re: /(по)?фиксить|фиксим|фиксят/giu, say: 'починить' },
  { re: /дроп(ать|нуть|аем|нем)[а-яё]*/giu, say: 'удалить' },
  { re: /юза(ть|ем|ю|ется)[а-яё]*/giu, say: 'использовать' },
  { re: /(за)?имплементи[а-яё]*/giu, say: 'реализовать' },
  { re: /фанаут[а-яё]*/giu, say: 'делает fan-out / рассылает' },
  { re: /зафейли?[а-яё]*/giu, say: 'упасть / завершиться ошибкой' },
  { re: /засабмити?[а-яё]*/giu, say: 'отправить' },
  { re: /линку(ет|ют|ем|я)[а-яё]*/giu, say: 'связывает / сопоставляет' },
  { re: /м[её]рж[а-яё]*/giu, say: 'объединяет' },
  { re: /(?<![а-яё])тул[аеуы](?![а-яё])/giu, say: 'инструмент' },
  { re: /под\s+капотом/giu, say: 'внутри / как устроено' },
  { re: /подня[а-яё]*\s+сервис[а-яё]*/giu, say: 'запустить сервис' },
  { re: /на\s+проводе/giu, say: 'в ответе / запросе сервера' },
  { re: /разв(о|е)д[а-яё]*\s+провод[а-яё]*/giu, say: 'явно связать зависимости' },
];

// Chancellery (канцелярит) markers — the AX_OPERATOR_DIALOGUE_STYLE ban on a noun standing in for
// a verb («осуществляется», «производится») and on the bookish connector prose that replaces a
// plain preposition («посредством», «имеет место быть»). Deliberately conservative: each one is
// unambiguous in operator-facing prose (unlike «является» / «в рамках», which are too frequent in
// legitimate use to flag). Reuses SDD_LANGUAGE_CALQUE — same class of finding, dead/bureaucratic
// register the reader has to decode instead of reading straight — rather than adding a second code
// for what is the same lint at the call site (sdd-check, the audit) and the same fix (flatten to a
// plain subject + verb).
const CHANCELLERY_PATTERNS: { re: RegExp; say: string }[] = [
  {
    re: /осуществля[а-яё]*/giu,
    say: 'подставить подлежащее и обычный глагол, напр. «модуль делает X»',
  },
  { re: /посредством/giu, say: 'через' },
  {
    re: /(?<![а-яё])производ(ится|ятся|илось)/giu,
    say: 'подставить обычный глагол, напр. «модуль строит X»',
  },
  { re: /имеет\s+место\s+быть/giu, say: 'есть / происходит' },
];

/**
 * @purpose Locate the 1-based line and enclosing sentence for one regex match, for a targeted `Edit`.
 * @invariant Never crosses a `\n`; boundary is nearest `.` (kept) / line start-end / table `|`
 * (dropped). Trims only whitespace off edges — never mid-word.
 * @param content Full file content the match was found in.
 * @param start Match start offset (`RegExpMatchArray.index`).
 * @param end Match end offset (`start + match[0].length`).
 * @returns 1-based line number and the trimmed sentence text enclosing the match.
 */
function locateSentence(
  content: string,
  start: number,
  end: number
): { line: number; sentence: string } {
  const before = content.slice(0, start);
  const line = before.split('\n').length;
  const lineStart = before.lastIndexOf('\n') + 1;
  const nextNewline = content.indexOf('\n', end);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;

  let left = lineStart;
  for (let i = start - 1; i >= lineStart; i--) {
    const c = content[i];
    if (c === '.' || c === '|') {
      left = i + 1;
      break;
    }
  }
  let right = lineEnd;
  for (let i = end; i < lineEnd; i++) {
    const c = content[i];
    if (c === '.') {
      right = i + 1;
      break;
    }
    if (c === '|') {
      right = i;
      break;
    }
  }
  return { line, sentence: content.slice(left, right).trim() };
}

/**
 * @purpose Run one pattern group over `content`, one finding per match — each carries its line and sentence.
 * @param file Artifact path (copied onto every finding).
 * @param content Full artifact content.
 * @param patterns Either CALQUE_PATTERNS or CHANCELLERY_PATTERNS.
 * @returns One SDD_LANGUAGE_CALQUE warning per match, in document order.
 */
function findCalqueMatches(
  file: string,
  content: string,
  patterns: { re: RegExp; say: string }[]
): Finding[] {
  const findings: Finding[] = [];
  for (const { re, say } of patterns) {
    for (const m of content.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const { line, sentence } = locateSentence(content, start, end);
      findings.push({
        severity: 'warn',
        code: 'SDD_LANGUAGE_CALQUE',
        file,
        line,
        message: `«${m[0]}» → ${say} | предложение: «${sentence}»`,
      });
    }
  }
  return findings;
}

/**
 * @purpose Deterministic language lint for operator-facing prose — flag anglicisms and chancellery
 * phrasing the language policy bans.
 * @invariant Warn-only pre-filter. One finding per occurrence, each with its own line + sentence quote.
 * @param file Artifact path.
 * @param content Full artifact markdown.
 * @returns SDD_LANGUAGE_CALQUE warnings, one per calque/chancellery occurrence found.
 */
export function checkSpecLanguage(file: string, content: string): Finding[] {
  return [
    ...findCalqueMatches(file, content, CALQUE_PATTERNS),
    ...findCalqueMatches(file, content, CHANCELLERY_PATTERNS),
  ];
}

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
 * @purpose Mechanical structure checks for a spec file (.spec.md) — anchor balance, required sections, and (v2) mandatory diagrams + folded heavy detail.
 * @invariant Pure. Scope required-sections apply to any scope spec (SCOPE_TYPE present). v2-only rules (module floor, mandatory diagram, `<details>` folding) stay dormant under `flowVersion='v1'`.
 * @param file Spec file path.
 * @param content Full spec markdown.
 * @param [flowVersion] SDD flow generation; `'v2'` enables the strict spec rules. Defaults to `'v1'`.
 * @returns Findings (possibly empty); errors fail the gate.
 */
export function checkSpecStructure(
  file: string,
  content: string,
  flowVersion: FlowVersion = 'v1'
): Finding[] {
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

  // v2-only strict rules — dormant under v1 so a pre-migration repo stays clean.
  if (flowVersion === 'v2') {
    const present = new Set(
      [...content.matchAll(/<!--SECTION:([A-Z_]+)-->/g)].map((m) => m[1] as string)
    );

    // Module-spec floor: modules were never section-checked in v1. Under v2 a module spec must carry
    // its load-bearing sections (AX_MODULE_SPEC_FLOOR).
    if (isModuleSpec) {
      for (const req of MODULE_REQUIRED_V2) {
        if (!present.has(req)) {
          findings.push({
            severity: 'error',
            code: 'SDD_SPEC_SECTION_MISSING',
            file,
            message: `module spec is missing required section ${req}.`,
          });
        }
      }
    }

    // Mandatory diagram: every scope and module spec carries an Overview section with ≥1 diagram
    // (AX_SPEC_MANDATORY_DIAGRAM). Presence + non-emptiness; the agent adds more diagrams by judgment.
    if (isScopeSpec || isModuleSpec) {
      const diag = extractSection(content, 'OVERVIEW');
      if (diag.status !== 'ok') {
        findings.push({
          severity: 'error',
          code: 'SDD_NO_DIAGRAM_BLOCK',
          file,
          message:
            'Spec has no Overview section — every spec opens with an Overview carrying at least one diagram (AX_SPEC_MANDATORY_DIAGRAM).',
        });
      } else if (!hasFencedBlock(diag.content)) {
        findings.push({
          severity: 'error',
          code: 'SDD_DIAGRAM_BLOCK_EMPTY',
          file,
          message:
            'Overview section has no diagram — add at least one fenced mermaid or ASCII diagram (AX_SPEC_MANDATORY_DIAGRAM).',
        });
      }
    }

    // Progressive disclosure: heavy sections (module AND scope) fold their detail under `<details>`
    // so the human-readable summary stays on top (AX_SPEC_PROGRESSIVE_DISCLOSURE). Checked when present.
    if (isModuleSpec || isScopeSpec) {
      for (const s of FOLD_REQUIRED_V2) {
        const sec = extractSection(content, s);
        if (sec.status === 'ok' && !/<details[\s>]/i.test(sec.content)) {
          findings.push({
            severity: 'error',
            code: 'SDD_SECTION_NOT_FOLDED',
            file,
            message: `Section ${s} does not fold its detail under \`<details>\` — collapse the contract body so the summary stays readable (AX_SPEC_PROGRESSIVE_DISCLOSURE).`,
          });
        }
      }
    }

    // Per-section size cap: a non-folded section ballooning past the human-readable budget is
    // reference detail hiding in the top half — decompose (split scope/module) or fold (move it into
    // FOLD_REQUIRED_V2), not just grow (AX_SPEC_PROGRESSIVE_DISCLOSURE).
    if (isModuleSpec || isScopeSpec) {
      for (const name of present) {
        if (FOLD_REQUIRED_V2.includes(name)) continue;
        const sec = extractSection(content, name);
        if (sec.status !== 'ok') continue;
        const lines = sec.content.split('\n').length;
        if (lines > SECTION_LINE_HARD_LIMIT_V2) {
          findings.push({
            severity: 'error',
            code: 'SDD_SECTION_TOO_LONG',
            file,
            message: `Section ${name} is ${lines} lines (> ${SECTION_LINE_HARD_LIMIT_V2}) — decompose (split into a module/sub-scope) or fold the reference detail into a foldable section (AX_SPEC_PROGRESSIVE_DISCLOSURE).`,
          });
        }
      }
    }

    // Table-cell policy: a table is an index, not text (AX_SPEC_TABLE_IS_INDEX).
    findings.push(...checkTableCells(file, content));
  }

  return findings;
}

/** @purpose True when a markdown table row line (starts/ends with `|`) is the header/data separator (`|---|---|`), not a content row. | @param line Trimmed line. | @returns Whether it is a separator row. */
function isSeparatorRow(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line);
}

/** @purpose Split a markdown table row into its trimmed, non-empty cells. | @param line Trimmed `|`-delimited row. | @returns Cell texts. */
function rowCells(line: string): string[] {
  return line
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * @purpose Mechanical table-cell checks — a table is an index, not text (AX_SPEC_TABLE_IS_INDEX, v2 only).
 * @invariant Pure. Fence-aware — pipes in fenced code are never rows. A row before a separator row is a header; its cell count gates SDD_TABLE_TOO_MANY_COLUMNS.
 * @param file Spec file path.
 * @param content Full spec markdown.
 * @returns Findings (possibly empty); all entries are errors (the caller gates this behind flowVersion='v2').
 */
export function checkTableCells(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] as string).trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line.startsWith('|') || !line.endsWith('|') || isSeparatorRow(line)) continue;

    const nextLine = (lines[i + 1] ?? '').trim();
    if (isSeparatorRow(nextLine)) {
      const headerCols = rowCells(line).length;
      if (headerCols > TABLE_MAX_COLUMNS) {
        findings.push({
          severity: 'error',
          code: 'SDD_TABLE_TOO_MANY_COLUMNS',
          file,
          message: `Table header has ${headerCols} columns (> ${TABLE_MAX_COLUMNS}) — a table is an index; split it or move detail into a subsection (AX_SPEC_TABLE_IS_INDEX).`,
        });
      }
    }

    for (const cell of rowCells(line)) {
      if (/<br/i.test(cell)) {
        findings.push({
          severity: 'error',
          code: 'SDD_TABLE_CELL_HAS_BR',
          file,
          message: `Table cell has a \`<br>\` line break — move the expanded content into a subsection below the table, not a multi-line cell (AX_SPEC_TABLE_IS_INDEX): "${cell.slice(0, 60)}"`,
        });
        continue;
      }
      if (cell.length > TABLE_CELL_MAX_CHARS) {
        findings.push({
          severity: 'error',
          code: 'SDD_TABLE_CELL_TOO_LONG',
          file,
          message: `Table cell is ${cell.length} chars (> ${TABLE_CELL_MAX_CHARS}) — a cell is one short line; move the detail into a subsection below the table (AX_SPEC_TABLE_IS_INDEX): "${cell.slice(0, 60)}..."`,
        });
      } else if (SENTENCE_BREAK.test(cell)) {
        findings.push({
          severity: 'error',
          code: 'SDD_TABLE_CELL_MULTI_SENTENCE',
          file,
          message: `Table cell carries more than one sentence — a cell is one short line, not a paragraph; move the detail into a subsection below the table (AX_SPEC_TABLE_IS_INDEX): "${cell.slice(0, 60)}..."`,
        });
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

/** @purpose Classify spec content as module vs scope, mirroring checkSpecStructure's own classification (MODULE_VISION present ⇒ module; SCOPE_TYPE present and MODULE_VISION absent ⇒ scope). | @param content Full spec markdown. | @returns 'module' \| 'scope' \| 'other'. */
function classifySpecKind(content: string): 'module' | 'scope' | 'other' {
  const isModuleSpec = /<!--SECTION:MODULE_VISION-->/.test(content);
  const isScopeSpec = /<!--SECTION:SCOPE_TYPE-->/.test(content) && !isModuleSpec;
  if (isModuleSpec) return 'module';
  if (isScopeSpec) return 'scope';
  return 'other';
}

/**
 * @purpose One `.spec.md` file's graph-relevant fields, gathered by the command from the project tree.
 * @invariant `file` paths across one `checkSpecHierarchy` call must share the same root form
 *   (all-absolute or all-relative) — the ancestor walk compares them structurally.
 */
export type SpecEntry = {
  /** @purpose Spec file path (module or scope spec). */
  file: string;
  /** @purpose Full spec markdown. */
  content: string;
  /** @purpose This spec's own scope flow version — grades hierarchy-check severity, like checkBddCoverage. */
  flowVersion?: FlowVersion;
};

/**
 * @purpose Find the nearest ancestor spec above a module's own directory — the parent that indexes it.
 * @invariant A directory with no `<dir-name>.spec.md` is a legal namespace dir (AX_HIERARCHICAL_SPECS),
 *   skipped transparently; the walk climbs until a spec-bearing directory or the root.
 * @param file The module spec file's path.
 * @param specFiles Every spec file path known to this run (module + scope).
 * @returns The nearest ancestor spec's path, or null when none is found.
 */
function nearestAncestorSpec(file: string, specFiles: Set<string>): string | null {
  let dir = dirname(dirname(file)); // parent of the module's own directory
  let prev = '';
  while (dir !== prev) {
    const candidate = join(dir, `${basename(dir)}.spec.md`);
    if (candidate !== file && specFiles.has(candidate)) return candidate;
    prev = dir;
    dir = dirname(dir);
  }
  return null;
}

/** @purpose True when `content` (read from directory `fromDir`) carries a markdown link resolving to `target`. | @param content Source spec markdown. | @param fromDir Directory the link is resolved relative to (dirname of the source file). | @param target Absolute-comparable target path. | @returns Whether any `](…spec.md)` link resolves to `target`. */
function linksTo(content: string, fromDir: string, target: string): boolean {
  for (const m of content.matchAll(/\]\(([^)`#]+\.spec\.md)(?:#[^)]*)?\)/g)) {
    const linkTarget = m[1];
    if (linkTarget && resolve(fromDir, linkTarget) === resolve(target)) return true;
  }
  return false;
}

/**
 * @purpose Spec-hierarchy verification (AX_HIERARCHICAL_SPECS / AX_SCOPE_STAYS_THIN): every module
 *   spec is linked from its nearest ancestor index; a parent with children became a thin index.
 * @invariant Pure — no I/O; the command supplies every spec from the walk. Severity per entry
 *   graded by its own `flowVersion` (default `'v1'`), like `checkBddCoverage`.
 * @param specs Every module + scope spec in the tree, from the project walk.
 * @returns SDD_MODULE_NOT_IN_INDEX / SDD_PARENT_MODULE_NOT_INDEX findings (possibly empty).
 */
export function checkSpecHierarchy(specs: SpecEntry[]): Finding[] {
  const findings: Finding[] = [];
  const byFile = new Map(specs.map((s) => [s.file, s]));
  const specFiles = new Set(specs.map((s) => s.file));
  const moduleSpecs = specs.filter((s) => classifySpecKind(s.content) === 'module');

  const parentOf = new Map<string, string>();
  for (const m of moduleSpecs) {
    const parent = nearestAncestorSpec(m.file, specFiles);
    if (parent) parentOf.set(m.file, parent);
  }

  for (const m of moduleSpecs) {
    const parent = parentOf.get(m.file);
    if (!parent) continue;
    const parentEntry = byFile.get(parent);
    if (!parentEntry) continue;
    if (!linksTo(parentEntry.content, dirname(parent), m.file)) {
      findings.push({
        severity: m.flowVersion === 'v2' ? 'error' : 'warn',
        code: 'SDD_MODULE_NOT_IN_INDEX',
        file: parent,
        message: `Module spec ${m.file} is not linked from its parent index ${parent} — every module must appear in the parent's Module Map / links (AX_HIERARCHICAL_SPECS).`,
      });
    }
  }

  const parentsWithChildren = new Set(parentOf.values());
  for (const parentFile of parentsWithChildren) {
    const parentEntry = byFile.get(parentFile);
    if (!parentEntry || classifySpecKind(parentEntry.content) !== 'module') continue;
    for (const sec of ['ENTITY_INVENTORY', 'MODULE_CONTRACTS'] as const) {
      if (new RegExp(`<!--SECTION:${sec}-->`).test(parentEntry.content)) {
        findings.push({
          severity: parentEntry.flowVersion === 'v2' ? 'error' : 'warn',
          code: 'SDD_PARENT_MODULE_NOT_INDEX',
          file: parentFile,
          message: `Module spec has child module specs beneath it but still carries module-level section ${sec} — a parent module must become a thin index over its children (AX_SCOPE_STAYS_THIN).`,
        });
      }
    }
  }

  return findings;
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
