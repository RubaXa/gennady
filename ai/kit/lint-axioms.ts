/**
 * Dangling-axiom lint for rendered directives.
 *
 * Rule (AUTHORING.md §7): every Axiom defined in a <BeliefState> must be referenced at least
 * once OUTSIDE BeliefState — by an ExecutionPlan step, a HaltCondition, a LogicSwitch route or a
 * contract. An axiom nobody points to dies silently when the file is trimmed.
 *
 * Exemptions:
 * - `cross-cutting="true"` on the <Axiom> tag — conduct/style axioms that apply to every line of
 *   output and legitimately have no single anchoring step.
 * - deps inheritance: an axiom defined in file A counts as used when another file lists it in
 *   `<BeliefState deps="…">` AND mentions it outside its own BeliefState.
 */

export interface RenderedDirective {
  /** Path (relative or absolute) used only for reporting. */
  file: string;
  /** Full rendered directive text. */
  text: string;
}

export interface DanglingAxiom {
  file: string;
  id: string;
}

interface ParsedDirective {
  file: string;
  axioms: { id: string; crossCutting: boolean }[];
  deps: Set<string>;
  /** Directive text with every BeliefState block removed. */
  outside: string;
}

const BELIEF_BLOCK = /<BeliefState\b([^>]*)>[\s\S]*?<\/BeliefState>/g;
const AXIOM_OPEN = /<Axiom\b([^>]*?)\/?>/g;
const ID_ATTR = /\bid="([^"]+)"/;
const DEPS_ATTR = /\bdeps="([^"]*)"/;
const CROSS_CUTTING_ATTR = /\bcross-cutting="true"/;

export function parseDirective(d: RenderedDirective): ParsedDirective {
  const axioms: ParsedDirective['axioms'] = [];
  const deps = new Set<string>();
  const outside = d.text.replace(BELIEF_BLOCK, (block, beliefAttrs: string) => {
    const depsMatch = beliefAttrs.match(DEPS_ATTR);
    if (depsMatch) {
      for (const id of depsMatch[1].split(',')) {
        const trimmed = id.trim();
        if (trimmed) deps.add(trimmed);
      }
    }
    for (const m of block.matchAll(AXIOM_OPEN)) {
      const attrs = m[1] as string;
      const id = attrs.match(ID_ATTR)?.[1];
      if (id) axioms.push({ id, crossCutting: CROSS_CUTTING_ATTR.test(attrs) });
    }
    return '';
  });
  return { file: d.file, axioms, deps, outside };
}

/** True when `id` occurs as a whole token (not as a prefix of a longer id) in `text`. */
function mentions(text: string, id: string): boolean {
  return new RegExp(`\\b${id}\\b`).test(text);
}

/**
 * Lint a set of rendered directives together (the whole build output — deps inheritance is
 * cross-file). Returns every non-cross-cutting axiom that no step/halt/switch/contract references.
 */
export function lintDanglingAxioms(rendered: RenderedDirective[]): DanglingAxiom[] {
  const parsed = rendered.map(parseDirective);
  const dangling: DanglingAxiom[] = [];
  for (const p of parsed) {
    for (const ax of p.axioms) {
      if (ax.crossCutting) continue;
      const usedLocally = mentions(p.outside, ax.id);
      const usedByHeir =
        !usedLocally &&
        parsed.some((q) => q !== p && q.deps.has(ax.id) && mentions(q.outside, ax.id));
      if (!usedLocally && !usedByHeir) dangling.push({ file: p.file, id: ax.id });
    }
  }
  return dangling;
}

/** Format lint results as build-output warning lines (empty array → empty string). */
export function formatDanglingReport(dangling: DanglingAxiom[]): string {
  if (dangling.length === 0) return '';
  const byFile = new Map<string, string[]>();
  for (const d of dangling) {
    const list = byFile.get(d.file) ?? [];
    list.push(d.id);
    byFile.set(d.file, list);
  }
  const lines = [
    `⚠ ${dangling.length} dangling axiom(s) — defined in BeliefState, referenced by no step/halt/switch/contract`,
    `  (mark conduct-style axioms cross-cutting="true", or anchor the axiom from a step — AUTHORING.md §7)`,
  ];
  for (const [file, ids] of byFile) lines.push(`  ${file}: ${ids.join(', ')}`);
  return lines.join('\n');
}
