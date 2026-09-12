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
 *
 * This module also lints the OPPOSITE direction (T-B6-08): every `AX_*` token MENTIONED anywhere
 * in the rendered build must have a real DEFINITION somewhere in that same build — an
 * `<Axiom id="AX_*">` tag in some rendered file, connected with `{{> "axiom/<dir>/<name>"}}`
 * (see `lintUndefinedAxiomRefs`). Unlike the direction above, this one is NOT a warning: a
 * reference with no definition anywhere is either a made-up name or a real library axiom
 * (`ai/kit/axiom/**`) nobody ever connected — a lie told to the agent reading the directive
 * (AUTHORING.md §7) — so `build-directives.ts` treats it as a build error, subject to
 * `KNOWN_DANGLING_AXIOM_REFS`, a temporary, named-owner allowlist (L-10 / Q2 option b) that only
 * shrinks as the axioms it lists get connected by their owning tasks.
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

/* -------------------------------------------------------------------------------------------- */
/* referenced-but-undefined (T-B6-08) — the opposite direction, error-severity                    */
/* -------------------------------------------------------------------------------------------- */

export interface UndefinedAxiomRef {
  file: string;
  id: string;
}

const AXIOM_ID_TAG = /<Axiom\s+id="(AX_[A-Z0-9_]+)"/g;
const ID_ATTR_VALUE = /\bid="AX_[A-Z0-9_]+"/g;
const AX_TOKEN = /\bAX_[A-Z0-9_]+\b/g;

/** Every id this directive's own rendered text DEFINES (an `<Axiom id="…">` tag), anywhere in the file. */
function ownDefinitions(text: string): Set<string> {
  const ids = new Set<string>();
  for (const m of text.matchAll(AXIOM_ID_TAG)) ids.add(m[1] as string);
  return ids;
}

/** Every `AX_*` token this directive's rendered text MENTIONS, excluding the `id="…"` attribute values themselves (those are definitions, not references). */
function mentionedIds(text: string): Set<string> {
  const withoutIdAttrs = text.replace(ID_ATTR_VALUE, '');
  const ids = new Set<string>();
  for (const m of withoutIdAttrs.matchAll(AX_TOKEN)) ids.add(m[0]);
  return ids;
}

/**
 * Every `AX_*` MENTIONED anywhere in `rendered` must have a DEFINITION somewhere in that same
 * rendered set — an `<Axiom id="…">` tag in its own file, in the file that loads it (an inherited
 * axiom already `{{> "axiom/…"}}`-included there), or in any other file of the build. This is
 * deliberately corpus-wide rather than traced through the READ_AND_USE_DIRECTIVE graph: the
 * mechanical check this lint replaces (`files scanned / defined in tree / mentioned ids /
 * dangling`, independently reproduced against the live tree — 40-TRACK-DIRECTIVES-SKILLS.md §4.1)
 * is "does this AX_* correspond to a real, connected definition ANYWHERE", not "is this
 * SPECIFIC directive's inheritance path correct" — the latter is a structural-placement concern
 * (one home per axiom, the right loader declaring `deps=`) owned by other tasks (T-B6-02/11/18/26
 * etc.), not this lint. A reference to an id with NO `<Axiom id>` tag anywhere in the build is
 * either a made-up name or a library axiom that exists under `ai/kit/axiom/**` but was never
 * connected with `{{> "axiom/<dir>/<name>"}}` — either way, a real defect this lint must catch;
 * `allowlist` names the ones already known and not yet this task's to fix.
 */
export function lintUndefinedAxiomRefs(
  rendered: RenderedDirective[],
  options: { allowlist?: ReadonlySet<string> } = {}
): UndefinedAxiomRef[] {
  const allowlist = options.allowlist ?? new Set<string>();

  const definedAnywhere = new Set<string>();
  for (const d of rendered) for (const id of ownDefinitions(d.text)) definedAnywhere.add(id);

  const dangling: UndefinedAxiomRef[] = [];
  for (const d of rendered) {
    for (const id of mentionedIds(d.text)) {
      if (definedAnywhere.has(id)) continue;
      if (allowlist.has(`${d.file}::${id}`)) continue;
      dangling.push({ file: d.file, id });
    }
  }
  return dangling;
}

/**
 * Temporary allowlist (L-10 / Q2 option b) — every `${file}::${id}` pair that was already
 * referenced-but-undefined on the live tree the moment this lint went live (T-B6-08), grouped by
 * axiom id and diffed against the independently-reproduced inventory in
 * `40-TRACK-DIRECTIVES-SKILLS.md` §4.1 (`files scanned: 55 | defined in tree: 164 | mentioned
 * ids: 174 | dangling: 20` on this tree — the 20 ids below). Connecting an axiom (or authoring
 * and connecting one that has no library file yet) is each row's own listed task, not this one —
 * T-B6-08's job is only the lint + gate. THIS LIST ONLY SHRINKS: when an owning task connects its
 * axiom (or a `status="draft"` decision retires it per T-B6-19), delete that id's block; never add
 * an entry for a NEW dangling reference introduced after this commit — that is exactly what the
 * gate below exists to refuse.
 */
export const KNOWN_DANGLING_AXIOM_REFS: ReadonlySet<string> = new Set(
  (
    [
      // Class I (library file exists under ai/kit/axiom/**, never connected with {{> }}) — owner
      // named where a later task in the plan explicitly claims the id; "unassigned" otherwise
      // (still recorded in 40-TRACK-DIRECTIVES-SKILLS.md §4.1 for the next triage pass).
      ['AX_AUDIT_HOOK', ['audit.directive.xml', 'code-review.directive.xml', 'execute.directive.xml', 'scaffold.directive.xml'], 'T-B6-25'],
      // AX_STALE_AFTER_PIVOT_VERIFICATION connected (T-B6-17, Пачка 15): now {{> "axiom/audit/ax-
      // stale-after-pivot-verification"}} in audit.directive.hbs — a real <Axiom id> definition
      // exists in the rendered build, so its mentions in formats/pivot-formats.xml,
      // infra.directive.xml, interface.directive.xml, migration-v1-v2.directive.xml are no longer
      // dangling. Row removed.
      ['AX_CLOSED_WORLD_INVENTORY', ['audit.directive.xml', 'code-review.directive.xml'], 'T-B6-02'],
      ['AX_CONTRACTS_TEXTUAL_AGNOSTIC', ['formats/dbc-contracts.xml', 'scaffold.directive.xml'], 'T-B6-02'],
      ['AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE', ['formats/dbc-contracts.xml', 'formats/entity-surface-format.xml', 'formats/module-spec-structure.xml'], 'T-B6-02'],
      ['AX_SCOPE_SPEC_MODULE_MAP_OWNERSHIP', ['formats/module-map-update.xml'], 'T-B6-02'],
      ['AX_PERMITTED_BASH_COMMANDS', ['audit.directive.xml', 'execute.directive.xml', 'infra.directive.xml', 'phase-execution-protocol.directive.xml'], 'ISS-8 / T-B6-12'],
      ['AX_SSOT_TRACEABILITY', ['formats/task-ticket-structure.xml', 'scaffold.directive.xml'], 'T-B6-13'],
      ['AX_REACTION_IS_A_TOOL_CALL', ['agent-inbox/track-review.directive.xml'], 'T-B6-24 (cross-tree, class III — defined under ai/directives/agent-inbox, out of this lint\'s default scope until then)'],
      ['AX_RULES_COMPLIANCE_AGAINST_ACTIVATED_RULES', ['audit.directive.xml'], 'unassigned — 40-doc §4.1 row 12'],
      ['AX_RUNTIME_BACKING_EXPLICIT', ['formats/product-spec-structure.xml'], 'unassigned — 40-doc §4.1 row 13'],
      ['AX_YAGNI_OVERENGINEERING_GUARD', ['root.directive.xml'], 'unassigned — 40-doc §4.1 row 15'],
      ['AX_CATCH_LOG_RECOVER', ['amplify-observability.directive.xml'], 'unassigned — 40-doc §4.1 row 16'],
      ['AX_GITIGNORE_BASELINE', ['amplify-security.directive.xml'], 'unassigned — 40-doc §4.1 row 17'],
      ['AX_E2E_PROOF_SCREENSHOT_ALWAYS', ['infra.directive.xml'], 'unassigned — 40-doc §4.1 row 18'],
      // formats/project-tasks-index.xml cites AX_ENV_FIX_CHANNEL as a parenthetical pointer inside
      // the `env-fix` token's grammar string (shared/sdd/execution-log.ts, single home) — prose
      // documentation naming the governing axiom, not a {{> }} partial include; project-tasks-index
      // is a rendered spec skeleton (no BeliefState) so there is no directive site to wire this
      // into. Pre-existing since B2-03 (V-BATCH-04); only surfaced once T-B6-08's undefined-ref
      // gate (Пачка 5) started scanning rendered format skeletons too, hit by the lead/specs-match-
      // code × lead/kit-lint rebase. Unassigned — no task in this plan owns turning the citation
      // into a real include.
      ['AX_ENV_FIX_CHANNEL', ['formats/project-tasks-index.xml'], 'unassigned — surfaced by V-BATCH-04 rebase onto Пачка 5 (T-B6-08)'],
      // Class II (no library file anywhere — id referenced but never authored) — needs an axiom
      // AUTHORED first, not merely connected; unassigned in this plan as of Пачка 5.
      ['AX_USAGE_WAIVER_DISCIPLINE', ['audit.directive.xml', 'formats/dbc-contracts.xml', 'formats/entity-surface-format.xml'], 'unassigned (class II, no library source) — 40-doc §4.1 row 7'],
      ['AX_SPEC_PROGRESSIVE_DISCLOSURE', ['formats/infrastructure-spec-structure.xml', 'formats/interface-spec-structure.xml', 'formats/library-spec-structure.xml', 'formats/module-spec-structure.xml', 'formats/product-spec-structure.xml'], 'unassigned (class II, no library source) — 40-doc §4.1 row 8'],
      ['AX_STRICT_NULL', ['audit.directive.xml', 'formats/audit-round.xml'], 'unassigned (class II, no library source) — 40-doc §4.1 row 11'],
      ['AX_SPEC_TABLE_IS_INDEX', ['formats/entity-inventory-format.xml'], 'unassigned (class II, no library source) — 40-doc §4.1 row 19'],
      // Deferred to the autonomous-execute umbrella (V14-2, post-2.0.0-draft per D-49) — not this
      // plan's Волна 0 to connect.
      ['AX_DEVIATION_SELF_RESOLVE', ['execute.directive.xml', 'phase-execution-protocol.directive.xml'], 'deferred — V14-2a umbrella'],
    ] as const
  ).flatMap(([id, files]) => files.map((file) => `sdd-v2/${file}::${id}`))
);

/** Format referenced-but-undefined findings as build-output error lines (empty array → empty string). */
export function formatUndefinedRefsReport(dangling: UndefinedAxiomRef[]): string {
  if (dangling.length === 0) return '';
  const byFile = new Map<string, string[]>();
  for (const d of dangling) {
    const list = byFile.get(d.file) ?? [];
    list.push(d.id);
    byFile.set(d.file, list);
  }
  const lines = [
    `✗ ${dangling.length} undefined axiom reference(s) — mentioned in rendered output, no <Axiom id> defined anywhere in the build`,
    `  (connect the partial with {{> "axiom/<dir>/<name>"}}, or add a justified KNOWN_DANGLING_AXIOM_REFS entry naming the owning task — AUTHORING.md §7)`,
  ];
  for (const [file, ids] of byFile) lines.push(`  ${file}: ${ids.join(', ')}`);
  return lines.join('\n');
}
