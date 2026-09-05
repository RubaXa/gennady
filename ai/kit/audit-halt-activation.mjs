#!/usr/bin/env node
/**
 * Halt-activation audit for sdd-v2 templates (AUTHORING.md §10 / operator principle, same family
 * as `audit-axiom-activation.mjs` and `audit-contract-activation.mjs`).
 *
 * Trigger: commit 9c81be20 added STEP_3B_FEASIBILITY_CRITIC to `scaffold.directive.hbs`, which
 * halts with `H_SCAFFOLD_NOT_EXECUTABLE` — but the directive's own `<HaltConditions>` table never
 * declared that id. This is the third instance of the same drift class the two sibling scripts
 * already guard for `axiom/*` and `contract/*`: something a directive genuinely DOES is never
 * registered where a reader (or a future edit) would look for the full inventory of what can stop
 * it. This script is the mechanical check for `H_*` halt ids specifically.
 *
 * Two directions, mirroring the sibling scripts' shape:
 *
 * === (a) "mentioned → declared" ==============================================================
 *
 * Every `H_*` token appearing anywhere in a directive's own text OUTSIDE its `<HaltConditions>`
 * table (Mission, BeliefState, ExecutionPlan/Step, ChatOutput, a lazy directive's own step
 * packages) must be a row in THAT SAME directive's table. This is the actual target defect class
 * — `H_SCAFFOLD_NOT_EXECUTABLE` fires from `STEP_3B_FEASIBILITY_CRITIC` but was never a row.
 *
 * ONE verified exception: a directive may cite ANOTHER directive's already-declared halt as a
 * named cross-reference to explain an analogous local rule, without re-declaring it locally —
 * e.g. `scope.directive.hbs` / `root.directive.hbs` write "the same class as the router's
 * `H_ASK_WITHOUT_CARD`" / "violates the same gate the router enforces (`H_ASK_WITHOUT_CARD`)".
 * `H_ASK_WITHOUT_CARD` is declared and fires only in `router.directive.hbs`; the citing files are
 * not claiming to raise it themselves. Verified by reading each site — this is a deliberate,
 * explicit pointer-to-primary-source (same shape as the contract script's
 * `QUESTION_RULE_SLIM->QUESTION_FORMAT`), not a forgotten row. Listed explicitly below
 * (`ALLOWLIST_CROSS_DIRECTIVE_REFS`) — any OTHER unresolved mention is a real violation, exactly
 * like the scaffold case.
 *
 * === (b) "declared → used" ====================================================================
 *
 * Every `H_*` id in a `<HaltConditions>` table is expected to occur at least once outside the
 * table — in this same directive's body/steps, OR (per the axiom script's own reasoning for a
 * governing axiom already anchored) via the AX_* axiom its own Trigger column cites, when that
 * axiom is itself cited outside the table — OR mentioned by any other scanned directive.
 *
 * EMPIRICAL FINDING, not assumed: unlike `axiom/*` (an ambient belief that risks being forgotten
 * unless re-anchored at its point of use — the exact thing PART (a) of this script, and the whole
 * axiom script, exist to catch) a `<HaltConditions>` ROW is usually already the complete
 * specification of when it fires — the Trigger column IS the anchor. Running the criterion above
 * over the live tree (before any allowlist) flags ~34 rows across nearly every directive that
 * declares more than a couple of halts. Reading each one shows they fall into exactly two shapes
 * that have no single "point of use" to cite a second time:
 *   1. A boundary precondition checked before the directive's own Step logic has anything to
 *      compute yet (`H_NO_INTAKE`, `H_NO_CODE`, `H_NO_INPUT`, `H_NO_DIFF`, `H_NO_TASK_FILES`,
 *      `H_NO_WORKTREE`, `H_NO_REPO_ACCESS`, `H_SPEC_MISSING`, `H_PARENT_SPEC_MISSING`).
 *   2. A meta-condition true continuously across the whole flow, not owned by one Step
 *      (`H_OPERATOR_REJECT` and its `_DEFAULTS`/`_SETUP` siblings fire at ANY approval STOP;
 *      `H_LOW_CONFIDENCE`, `H_ID_COLLISION`, `H_DISPATCH_FAILED`, `H_AMBIGUOUS_INTENT`,
 *      `H_UNFORMATTED_ASK`, `H_AMBIGUOUS_PRODUCT_LIBRARY`, `H_PIVOT_NO_INVALIDATION_LIST`,
 *      `H_NO_REVIEW_PLAN`, and `module.directive.hbs`'s own `H_AMBIGUOUS_MODE` row, whose Trigger
 *      text — unlike its siblings in infra/interface/scope/reconcile/scaffold — does not even cite
 *      the governing axiom).
 * None of these is the class of bug this script exists to catch (a wired-in behavior nobody
 * registered); they are declared, self-describing, and correctly never fire from a specific line.
 * Listed explicitly in `ALLOWLIST_UNUSED_HALT_IDS` below, grouped with the reasoning above — a
 * NEW halt id that fails this same criterion is NOT automatically covered by this list (only the
 * exact ids verified here are), so a genuinely new dead halt still surfaces as a violation.
 *
 * === Scanned sets =============================================================================
 *
 * TEMPLATES — every `*.hbs` under `ai/kit/templates/sdd-v2/**`, recursive, excluding `formats/`
 * (fragments, not directives). Unlike the two sibling scripts, this one does NOT need to exclude
 * `agent-inbox/` — that exclusion exists there because axiom/contract activation is checked
 * specifically inside `<ExecutionPlan>`/`<PhaseProcedure>` (a shape agent-inbox directives don't
 * have), while a `<HaltConditions>` table is a table regardless of what wraps the rest of the
 * file. Including agent-inbox is what surfaces `track-review.directive.hbs`'s own
 * `H_AUTHOR_NOTHING` — declared nowhere, mentioned once in `AuthorMode` prose — the fourth real
 * instance of this exact defect class found while building this script.
 *
 * ASSEMBLED — every `*.directive.xml` under `ai/directives/sdd-v2/**`, recursive (includes
 * `agent-inbox/`, excludes `formats/*.xml` fragments) — same set as the contract script's PART 2.
 * A lazy-assembled directive's `<HaltConditions>` table lives only in its skeleton, but an `H_*`
 * mention it fires from can live in one of that skeleton's OWN step packages instead
 * (`ai/directives/sdd-v2/<name>/steps/*.xml` — exactly `scaffold`'s `STEP_3B_FEASIBILITY_CRITIC.xml`
 * for the trigger case). `readAssembledFragments` below reads skeleton + every package the
 * skeleton's own step list names (via `resolveAssemblyMode`, the same manifest-driven check
 * `build-directives.ts` itself uses) and keeps every fragment separate rather than concatenating
 * them — same reason `audit-contract-activation.mjs` does this (documented there): a code-fence or
 * tag left open at one fragment's own end must never re-pair with the next fragment's own opening
 * delimiter. This script's own regexes are single-token (no paired delimiters spanning text), so
 * concatenation would likely be safe here too, but per-fragment processing costs nothing and stays
 * consistent with the established pattern for this class of script.
 *
 * A directive with no `<HaltConditions>` section AND no `H_*` mention anywhere is skipped entirely
 * (`critic-protocol.directive.hbs`, `preflight-protocol.directive.hbs`, `code-lens.directive.hbs`,
 * `synthesize.directive.hbs` — protocol fragments / directives with no halts, not the shape this
 * script checks).
 *
 * Run: node ai/kit/audit-halt-activation.mjs
 * Exit 1 and prints every violation (either direction, either scanned set) otherwise.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAssemblyMode } from './lazy-assembly.ts';
import { readAssembledFragments } from './audit-halt-fragments.mjs';

const KIT_DIR = dirname(fileURLToPath(import.meta.url)); // ai/kit
const REPO_ROOT = join(KIT_DIR, '..', '..');
const TEMPLATES_DIR = join(KIT_DIR, 'templates', 'sdd-v2');
const DIRECTIVES_DIR = join(REPO_ROOT, 'ai', 'directives', 'sdd-v2');

const H_ID_RE = /(?<![A-Za-z0-9_])H_[A-Z0-9_]+/g;
const AX_ID_RE = /(?<![A-Za-z0-9_])AX_[A-Z0-9_]+/g;
const HALT_SECTION_RE = /<HaltConditions>([\s\S]*?)<\/HaltConditions>/;
const HALT_ROW_RE = /\|\s*`?(H_[A-Z0-9_]+)`?\s*\|([^\n]*)\|/g;

/**
 * Verified pointer-to-primary-source citations (direction a) — a directive naming ANOTHER
 * directive's own already-declared halt to explain an analogous local rule, not claiming to raise
 * it itself. Keyed by `<basename-without-extension>::<id>` so the template (.hbs) and assembled
 * (.xml) mirrors of the same source line share one entry. Every entry checked against the actual
 * sentence, not guessed.
 */
const ALLOWLIST_CROSS_DIRECTIVE_REFS = new Set([
  // root.directive.hbs: "violates the same gate the router enforces (`H_ASK_WITHOUT_CARD`)" — the
  // halt is declared and fires only in router.directive.hbs's own <HaltConditions>.
  'root.directive::H_ASK_WITHOUT_CARD',
  // scope.directive.hbs: three sites, all "the same class as the router's `H_ASK_WITHOUT_CARD`" /
  // a bare citation of the same pointer — same reasoning.
  'scope.directive::H_ASK_WITHOUT_CARD',
  // The next three all inherit the SAME pointer through a shared partial rather than hand-written
  // prose: `ai/kit/contract/process/question-format.xml` (QUESTION_FORMAT) itself names
  // `H_UNFORMATTED_ASK` ("skipping the explanation … is itself the violation this contract forbids
  // (H_UNFORMATTED_ASK)") — a halt declared and fired only from router.directive.hbs. Every
  // directive that inlines the FULL contract (not the trimmed QUESTION_RULE_SLIM, which only
  // points at it by name) inherits this same sentence verbatim in its assembled output. Verified
  // consumers of the full contract: critic, interview-protocol, root (the 4 amplify-* directives
  // also include it, but delta-assembly reduces their copy to an "Inherited from the loading
  // directive" pointer with no inlined text, so they never trip this check at all).
  'critic.directive::H_UNFORMATTED_ASK',
  'interview-protocol.directive::H_UNFORMATTED_ASK',
  'root.directive::H_UNFORMATTED_ASK',
  // review-lifecycle.directive.hbs includes `axiom/process/ax-permitted-bash-commands`, whose own
  // body names `H_BLOCKED` ("no bash command in this list reaches outside the project root …
  // That fact is `H_BLOCKED` per `AX_BLOCKER_ESCALATION`"). `H_BLOCKED` is declared and fires only
  // in phase-execution-protocol.directive.hbs's own <HaltConditions> (the other of this axiom's
  // exactly two consumers) — review-lifecycle inherits the sentence, not the halt itself.
  'review-lifecycle.directive::H_BLOCKED',
  // phase-execution-protocol.directive.hbs includes `axiom/process/ax-deviation-self-resolve`,
  // whose own body draws the boundary between a self-resolvable spec/ticket hole and "an
  // environment/infra blocker (`AX_BLOCKER_ESCALATION`, `H_PAUSED_AWAITING_OPERATOR`) … [that]
  // stays a pause". `H_PAUSED_AWAITING_OPERATOR` is declared and fires only in
  // execute.directive.hbs's own <HaltConditions> (the orchestrator's own pause on a phase's
  // blocker) — the OTHER of this axiom's two consumers, where it IS a real local row.
  'phase-execution-protocol.directive::H_PAUSED_AWAITING_OPERATOR',
]);

/**
 * Verified-generic/boundary halt ids (direction b) — see the header comment's EMPIRICAL FINDING
 * for the two shapes these fall into. Every id here was checked against its own Trigger text and
 * declaring file(s) before being added; a new id that fails the same criterion is NOT covered by
 * this list.
 */
const ALLOWLIST_UNUSED_HALT_IDS = new Set([
  // Shape 1 — boundary precondition, checked before the directive's own Step logic runs, nothing
  // to compute yet: the Trigger column IS the whole check.
  'H_NO_INTAKE',
  'H_NO_CODE',
  'H_NO_INPUT',
  'H_NO_DIFF',
  'H_NO_TASK_FILES',
  'H_NO_WORKTREE',
  'H_NO_REPO_ACCESS',
  'H_SPEC_MISSING',
  'H_PARENT_SPEC_MISSING',
  // Shape 2 — meta-condition true continuously across the whole flow, not owned by one Step.
  // H_OPERATOR_REJECT* fires at ANY approval STOP the directive's ExecutionPlan declares — the
  // family this generalizes from (H_OPERATOR_REJECTS_PLAN / H_OPERATOR_REJECTS_MERGE) IS cited at
  // its one local STOP and is correctly NOT on this list; only the bare-reject variants below are.
  'H_OPERATOR_REJECT',
  'H_OPERATOR_REJECTS_DEFAULTS',
  'H_OPERATOR_REJECTS_SETUP',
  'H_LOW_CONFIDENCE',
  'H_ID_COLLISION',
  'H_DISPATCH_FAILED',
  'H_AMBIGUOUS_INTENT',
  'H_UNFORMATTED_ASK',
  'H_AMBIGUOUS_PRODUCT_LIBRARY',
  'H_PIVOT_NO_INVALIDATION_LIST',
  'H_NO_REVIEW_PLAN',
  // module.directive.hbs's own H_AMBIGUOUS_MODE row — unlike its siblings in
  // infra/interface/scope/reconcile/scaffold, this Trigger text does not cite
  // AX_MODE_AUTO_DETECT_OR_HALT, so the AX-co-citation heuristic below cannot resolve it. Confirmed
  // by reading module.directive.hbs: still the same boundary mode-detection condition, just
  // phrased without the axiom pointer.
  'H_AMBIGUOUS_MODE',
]);

function stem(absPath) {
  return basename(absPath, extname(absPath));
}

/** Recursive file walk, skipping any directory named `formats` (fragment libraries, not directives). */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'formats') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function listTemplates() {
  return walk(TEMPLATES_DIR).filter((p) => p.endsWith('.hbs'));
}

function listAssembledDirectives() {
  return walk(DIRECTIVES_DIR).filter((p) => p.endsWith('.directive.xml'));
}

/** `assembly-manifest.json` override key for a file under `DIRECTIVES_DIR` (mirrors build-directives.ts's `e.rel`). */
function manifestKeyFor(absPath) {
  return `sdd-v2/${relative(DIRECTIVES_DIR, absPath).split(sep).join('/')}`;
}

/**
 * Every fragment of one assembled directive an agent can eventually read: the skeleton alone for
 * a monolith build, or the skeleton PLUS every step package it points at for a lazy build.
 * Fragments are returned as a plain array, never joined (see header comment).
 */
/** One fragment's own `<HaltConditions>` rows (id -> trigger text) and its body-text-minus-table. */
function splitFragment(text) {
  const m = HALT_SECTION_RE.exec(text);
  if (!m) return { rows: [], body: text };
  const rows = [...m[1].matchAll(HALT_ROW_RE)].map((row) => ({ id: row[1], trigger: row[2] }));
  const body = text.slice(0, m.index) + text.slice(m.index + m[0].length);
  return { rows, body };
}

/**
 * Runs both directions over one directive's fragments (a single-file array for the template scan,
 * skeleton+step-packages for the assembled scan) and returns `{ mentionedNotDeclared,
 * declaredNotUsed }` violations, already filtered through both allowlists.
 */
function auditDirective(fragments, fileStem) {
  const declaredRows = new Map(); // id -> trigger (first occurrence, normally the skeleton's own table)
  const bodyMentioned = new Set();
  const bodyAxCited = new Set();

  for (const fragmentText of fragments) {
    const { rows, body } = splitFragment(fragmentText);
    for (const { id, trigger } of rows) if (!declaredRows.has(id)) declaredRows.set(id, trigger);
    for (const id of body.matchAll(H_ID_RE)) bodyMentioned.add(id[0]);
    for (const ax of body.matchAll(AX_ID_RE)) bodyAxCited.add(ax[0]);
  }

  const mentionedNotDeclared = [];
  for (const id of bodyMentioned) {
    if (declaredRows.has(id)) continue;
    if (ALLOWLIST_CROSS_DIRECTIVE_REFS.has(`${fileStem}::${id}`)) continue;
    mentionedNotDeclared.push(id);
  }

  const declaredNotUsed = [];
  for (const [id, trigger] of declaredRows) {
    if (bodyMentioned.has(id)) continue;
    const axInTrigger = [...trigger.matchAll(AX_ID_RE)].map((m) => m[0]);
    if (axInTrigger.some((ax) => bodyAxCited.has(ax))) continue;
    if (ALLOWLIST_UNUSED_HALT_IDS.has(id)) continue;
    declaredNotUsed.push(id);
  }

  return { mentionedNotDeclared, declaredNotUsed };
}

// === Templates scan ===========================================================================

const templateViolations = [];
for (const file of listTemplates()) {
  const text = readFileSync(file, 'utf8');
  if (!HALT_SECTION_RE.test(text) && !H_ID_RE.test(text)) continue; // no halts here at all — skip
  const rel = relative(KIT_DIR, file);
  const { mentionedNotDeclared, declaredNotUsed } = auditDirective([text], stem(file));
  for (const id of mentionedNotDeclared) {
    templateViolations.push({ file: rel, id, reason: 'mentioned in the directive but not a row in its own HaltConditions' });
  }
  for (const id of declaredNotUsed) {
    templateViolations.push({ file: rel, id, reason: 'declared in HaltConditions but never mentioned outside the table' });
  }
}

// === Assembled scan ============================================================================

const assembledViolations = [];
for (const file of listAssembledDirectives()) {
  const fragments = readAssembledFragments(file, {
    repoRoot: REPO_ROOT,
    lazy: resolveAssemblyMode(manifestKeyFor(file)) === 'lazy',
  });
  const wholeText = fragments.join('\n');
  if (!HALT_SECTION_RE.test(wholeText) && !H_ID_RE.test(wholeText)) continue; // no halts — skip
  const rel = relative(REPO_ROOT, file);
  const { mentionedNotDeclared, declaredNotUsed } = auditDirective(fragments, stem(file));
  for (const id of mentionedNotDeclared) {
    assembledViolations.push({ file: rel, id, reason: 'mentioned in the assembled directive (skeleton or a step package) but not a row in its own HaltConditions' });
  }
  for (const id of declaredNotUsed) {
    assembledViolations.push({ file: rel, id, reason: 'declared in HaltConditions but never mentioned outside the table' });
  }
}

// === Report =====================================================================================

const allViolations = [...templateViolations, ...assembledViolations];

if (allViolations.length === 0) {
  console.log(
    `✓ halt-activation audit clean — ${listTemplates().length} template(s) + ` +
      `${listAssembledDirectives().length} assembled directive(s) checked.`
  );
} else {
  console.error(`⚠ ${allViolations.length} halt-activation violation(s):\n`);
  const byFile = new Map();
  for (const v of allViolations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }
  for (const [file, vs] of byFile) {
    console.error(`  ${file}`);
    for (const v of vs) console.error(`    - ${v.id} — ${v.reason}`);
  }
  console.error(
    `\nAn H_* token used anywhere in a directive (or, for a lazy directive, one of its own step\n` +
      `packages) must be a row in that SAME directive's own <HaltConditions> table — the class of bug\n` +
      `fixed in scaffold.directive.hbs for H_SCAFFOLD_NOT_EXECUTABLE (STEP_3B_FEASIBILITY_CRITIC halted\n` +
      `with it, the table never declared it). Fix: add the row, worded from the actual halting site.\n` +
      `A deliberate reference to ANOTHER directive's own already-declared halt (a pointer, not a local\n` +
      `re-raise) belongs in ALLOWLIST_CROSS_DIRECTIVE_REFS instead, documented like the existing\n` +
      `root/scope -> router H_ASK_WITHOUT_CARD entries.\n` +
      `\nA row in <HaltConditions> that appears nowhere else is either a boundary precondition or a\n` +
      `continuously-checked meta-condition (see this script's header) — genuinely fine, verified, and\n` +
      `belongs in ALLOWLIST_UNUSED_HALT_IDS with a reason — or it is dead weight nobody wires up; check\n` +
      `the directive's own ExecutionPlan before deciding which.`
  );
  process.exitCode = 1;
}
