/**
 * Delta-assembly for sdd-v2 directives.
 *
 * A directive reachable ONLY via `READ_AND_USE_DIRECTIVE(...)` from inside another directive
 * already running in the same session (never a direct entry point, never a fresh subagent world)
 * re-renders every `axiom/*` / `contract/*` partial the loading directive already put in
 * context — nested loading (router → migration-v1-v2, router → readiness, …) then re-reads the
 * same conduct/process bricks 2–3× per session. This module computes, per directive, the set of
 * partials GUARANTEED already present no matter which of its callers loaded it, so
 * build-directives.ts can subtract exactly that set on its second render pass.
 *
 * Node classes (see AUTHORING.md §11 for the short version, and
 * specs/ai-skills/directive-assembly/directive-assembly.spec.md — the formalization of assembly,
 * DA-DL-8 for why lazy partial-splitting runs AFTER delta subtraction, over the `partials_ORIGINAL
 * − ctx` remainder rather than independently of it):
 * - Class 1 — direct entry points (named in some `ai/skills/*​/SKILL.md`). May be entered with
 *   no loading directive at all, so ctx = ∅. Always rendered FULL.
 * - Class 3 — subagent worlds (`CLASS_3_DIRECTIVES` below). A dispatched worker/critic reads
 *   these directly into a FRESH isolated context — never nested inside an already-running
 *   session via READ_AND_USE_DIRECTIVE — so "already in context" never holds. ctx = ∅. Always
 *   rendered FULL.
 * - Class 2 — everything else with at least one incoming READ_AND_USE_DIRECTIVE edge. ctx(child)
 *   is the intersection, over every incoming edge, of (ctx(parent) ∪ partials_ORIGINAL(parent)) —
 *   a partial only counts as guaranteed when EVERY path that can reach the child already carries
 *   it. `partials_ORIGINAL` is always the loading directive's full, undeleted partial set — a
 *   partial deducted from an ancestor by ITS OWN delta pass is still real context, inherited from
 *   whoever loaded the ancestor.
 *
 * A node inside a READ_AND_USE_DIRECTIVE cycle is exempted from delta entirely (ctx = ∅, rendered
 * FULL) — the fixpoint has no well-defined answer for a cycle, and "render everything" is the
 * only universally safe fallback. The real sdd-v2 graph is acyclic (guarded by a test); this
 * exists so a future template that accidentally introduces a cycle degrades safely instead of
 * computing nonsense.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { KIT, UNIT } from './render.ts';

export const SDD_V2_NS = 'ai/directives/sdd-v2/';

/** The two partial namespaces with a citable `id=` — the only ones eligible for delta subtraction. */
const DELTA_PARTIAL_RE = /^(axiom|contract)\//;

/**
 * Class 3 — see the module doc above. Kept as an explicit list, not inferred from "has no
 * incoming edge": that property is a GUARD (a test asserts it), not a derivation — a future
 * template wiring a READ_AND_USE_DIRECTIVE into one of these must fail a test, not silently
 * reclassify the node back to class 2.
 */
export const CLASS_3_DIRECTIVES: readonly string[] = [
  `${SDD_V2_NS}phase-execution-protocol.directive.xml`,
  `${SDD_V2_NS}critic-protocol.directive.xml`,
];

/** `ai/directives/sdd-v2/router.directive.xml` from a template-relative rel path (posix, `.hbs` already swapped for `.xml`). */
export function directiveIdFromRel(rel: string): string {
  return 'ai/directives/' + rel.split(sep).join('/');
}

/** Direct `{{> "axiom/…"}}` / `{{> "contract/…"}}` partial names a template invokes, first-seen order, deduped. No sdd-v2 directive template uses `{{#if}}`/`{{#each}}` around a partial call (checked — the static build renders one fixed shape), so a source scan equals the rendered set. */
export function directPartialsOf(hbsSource: string): string[] {
  const seen = new Set<string>();
  for (const m of hbsSource.matchAll(/\{\{>\s*"([^"]+)"\s*\}\}/g)) {
    const name = m[1] as string;
    if (DELTA_PARTIAL_RE.test(name)) seen.add(name);
  }
  return [...seen];
}

/** `READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/<x>.directive.xml")` targets in rendered text — the graph edges. Matched against the RENDERED text (not the template source) because a reference can live inside a partial, e.g. `contract/process/readiness-preflight-gate` routes into migration-v1-v2 / readiness from 5 different loading directives. */
export function extractReadAndUseTargets(renderedText: string): string[] {
  const targets = new Set<string>();
  const re = /READ_AND_USE_DIRECTIVE\("(ai\/directives\/sdd-v2\/[^"]+\.directive\.xml)"\)/g;
  for (const m of renderedText.matchAll(re)) targets.add(m[1] as string);
  return [...targets];
}

/** Class 1 — every directive named as a direct entry point in some `ai/skills/*​/SKILL.md`. */
export function scanClass1FromSkills(skillsRoot: string): Set<string> {
  const ids = new Set<string>();
  const re = /ai\/directives\/sdd-v2\/[\w./-]+\.directive\.xml/g;
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let text: string;
    try {
      text = readFileSync(join(skillsRoot, entry.name, 'SKILL.md'), 'utf8');
    } catch {
      continue; // no SKILL.md in this dir — not a skill entry point
    }
    for (const m of text.matchAll(re)) ids.add(m[0]);
  }
  return ids;
}

export interface Graph {
  nodes: string[];
  /** parent -> children */
  edges: Map<string, Set<string>>;
  /** child -> parents */
  incoming: Map<string, Set<string>>;
}

export function buildGraph(nodeIds: string[], edgeList: readonly (readonly [string, string])[]): Graph {
  const edges = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    edges.set(id, new Set());
    incoming.set(id, new Set());
  }
  for (const [p, c] of edgeList) {
    if (p === c) continue; // a self-reference is not a real nested-load edge
    if (!edges.has(p) || !edges.has(c)) continue; // target outside the known node set — ignore
    edges.get(p)!.add(c);
    incoming.get(c)!.add(p);
  }
  return { nodes: nodeIds, edges, incoming };
}

/** DFS cycle detection. Returns every node that participates in at least one cycle. */
export function findCyclicNodes(graph: Graph): Set<string> {
  const color = new Map<string, 0 | 1 | 2>();
  const cyclic = new Set<string>();
  const stack: string[] = [];
  function dfs(u: string): void {
    color.set(u, 1);
    stack.push(u);
    for (const v of graph.edges.get(u) ?? []) {
      if (color.get(v) === 1) {
        const idx = stack.indexOf(v);
        for (const n of stack.slice(idx)) cyclic.add(n);
      } else if (color.get(v) !== 2) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, 2);
  }
  for (const n of graph.nodes) if (!color.has(n)) dfs(n);
  return cyclic;
}

export interface ClassifiedGraph {
  graph: Graph;
  class1: Set<string>;
  class3: Set<string>;
  cyclic: Set<string>;
}

/** Nodes always rendered FULL: direct entry points, subagent worlds, and (conservatively) any cycle participant. */
export function fullNodes(c: ClassifiedGraph): Set<string> {
  return new Set([...c.class1, ...c.class3, ...c.cyclic]);
}

/**
 * ctx(n) for every node — see the module doc for the fixpoint definition. Processes nodes in a
 * Kahn's-algorithm order where every full node is a ready source from the start (its ctx is ∅
 * regardless of its own parents), which is always sufficient because `cyclic ⊆ fullNodes`:
 * removing cycle participants from the dependency wait leaves a genuine DAG for the rest.
 */
export function computeContexts(
  c: ClassifiedGraph,
  partialsOriginal: Map<string, Set<string>>
): Map<string, Set<string>> {
  const full = fullNodes(c);
  const ctx = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();
  for (const n of c.graph.nodes) indeg.set(n, (c.graph.incoming.get(n) ?? new Set()).size);

  const queue: string[] = [];
  const queued = new Set<string>();
  const enqueue = (n: string) => {
    if (!queued.has(n)) {
      queued.add(n);
      queue.push(n);
    }
  };
  for (const n of [...c.graph.nodes].sort()) {
    if (full.has(n) || indeg.get(n) === 0) enqueue(n);
  }

  let qi = 0;
  while (qi < queue.length) {
    const n = queue[qi++] as string;
    if (full.has(n)) {
      ctx.set(n, new Set());
    } else {
      let acc: Set<string> | null = null;
      for (const p of [...(c.graph.incoming.get(n) ?? [])].sort()) {
        const contribution = new Set([...(ctx.get(p) ?? new Set()), ...(partialsOriginal.get(p) ?? new Set())]);
        acc = acc === null ? contribution : new Set([...acc].filter((x) => contribution.has(x)));
      }
      ctx.set(n, acc ?? new Set());
    }
    for (const child of [...(c.graph.edges.get(n) ?? [])].sort()) {
      indeg.set(child, (indeg.get(child) ?? 0) - 1);
      if (!full.has(child) && (indeg.get(child) ?? 0) <= 0) enqueue(child);
    }
  }
  // Defensive only — unreachable given cyclic ⊆ fullNodes, kept so a future graph shape fails
  // loud (missing ctx crashes the caller) rather than silently rendering everything full.
  for (const n of c.graph.nodes) if (!ctx.has(n)) ctx.set(n, new Set());
  return ctx;
}

/** The Axiom/Contract `id=` a partial's own file declares. Falls back to the file's own basename for the rare brick with no citable id (e.g. `contract/process/readiness-preflight-gate`, a `<LogicSwitch>` block) — never silently drops it from the Inherited line. */
export function idOfPartial(name: string): string {
  const text = readFileSync(join(KIT, `${name}.xml`), 'utf8');
  const m = text.match(/<(?:Axiom|Contract)\s+id="([^"]+)"/);
  return m ? (m[1] as string) : (name.split('/').pop() as string);
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface DeltaResult {
  /** hbs source with the excluded partials' lines removed and the Inherited line added — identical to the input when `excluded` is empty or none of it was actually present. */
  source: string;
  /** ids actually removed (sorted, deduped) — empty when nothing changed. */
  inheritedIds: string[];
}

/**
 * Removes each excluded partial's standalone `{{> "name"}}` line (plus one trailing blank line,
 * so the gap does not double) and, only if at least one was actually present, inserts one
 * "Inherited from…" line right after the `<BeliefState …>` open tag, indented one `UNIT` deeper
 * than the tag itself (the established body-indent convention across every sdd-v2 directive).
 */
export function applyDelta(hbsSource: string, excluded: readonly string[]): DeltaResult {
  let out = hbsSource;
  const removedIds: string[] = [];
  for (const name of excluded) {
    const re = new RegExp(
      `[ \\t]*\\{\\{>\\s*"${escapeRegExp(name)}"\\s*\\}\\}[ \\t]*\\r?\\n(?:[ \\t]*\\r?\\n)?`,
      'g'
    );
    if (re.test(out)) removedIds.push(idOfPartial(name));
    out = out.replace(re, '');
  }
  if (removedIds.length === 0) return { source: hbsSource, inheritedIds: [] };

  const sortedIds = [...new Set(removedIds)].sort();
  const beliefTag = out.match(/([ \t]*)(<BeliefState\b[^>]*>)\r?\n/);
  if (!beliefTag) return { source: out, inheritedIds: sortedIds }; // no anchor found — surfaced by a build-time test, never silent in production output
  const tagIndent = beliefTag[1] as string;
  const bodyIndent = tagIndent + UNIT;
  const insertion = `${tagIndent}${beliefTag[2]}\n${bodyIndent}Inherited from the loading directive (already in context): ${sortedIds.join(', ')}\n\n`;
  out = out.replace(beliefTag[0], insertion);
  return { source: out, inheritedIds: sortedIds };
}

export interface PlanNodeInput {
  /** `ai/directives/<rel>` identity, e.g. `ai/directives/sdd-v2/router.directive.xml`. */
  id: string;
  hbsSource: string;
  renderedFull: string;
}

export interface DeltaPlan {
  graph: Graph;
  class1: Set<string>;
  class3: Set<string>;
  cyclic: Set<string>;
  partialsOriginal: Map<string, Set<string>>;
  ctx: Map<string, Set<string>>;
}

/**
 * Builds the full plan from already-rendered (pass-1) directive nodes: classifies every node,
 * extracts the READ_AND_USE_DIRECTIVE graph from the rendered text, and computes ctx(n) for all
 * of them. Pure and side-effect-free (besides reading skill/brick files) — build-directives.ts
 * drives the actual pass-2 re-render; tests call this directly to assert on the plan itself.
 */
export function buildDeltaPlan(nodes: readonly PlanNodeInput[], skillsRoot: string): DeltaPlan {
  const nodeIds = nodes.map((n) => n.id);
  const known = new Set(nodeIds);

  const class1 = new Set([...scanClass1FromSkills(skillsRoot)].filter((id) => known.has(id)));
  const class3 = new Set(CLASS_3_DIRECTIVES.filter((id) => known.has(id)));

  const edgeList: [string, string][] = [];
  for (const n of nodes) {
    for (const target of extractReadAndUseTargets(n.renderedFull)) edgeList.push([n.id, target]);
  }
  const graph = buildGraph(nodeIds, edgeList);
  const cyclic = findCyclicNodes(graph);

  const partialsOriginal = new Map<string, Set<string>>();
  for (const n of nodes) partialsOriginal.set(n.id, new Set(directPartialsOf(n.hbsSource)));

  const ctx = computeContexts({ graph, class1, class3, cyclic }, partialsOriginal);
  return { graph, class1, class3, cyclic, partialsOriginal, ctx };
}

/** The partials to actually exclude when re-rendering node `id` — ctx(id) narrowed to what it truly includes, sorted for determinism. */
export function excludedPartialsFor(plan: DeltaPlan, id: string): string[] {
  const ctx = plan.ctx.get(id) ?? new Set();
  const own = plan.partialsOriginal.get(id) ?? new Set();
  return [...ctx].filter((p) => own.has(p)).sort();
}
