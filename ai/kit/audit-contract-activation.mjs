#!/usr/bin/env node
/**
 * Contract-activation audit for sdd-v2 templates (AUTHORING.md §7, §10, and the "Backlog: манифест
 * потребителей контрактов/аксиом" note at the end of that file).
 *
 * Two checks, opposite direction of the same drift:
 *   PART 1 — "included → activated" — walks the .hbs TEMPLATES: a contract/* partial connected in
 *     ChatOutput/ChatProtocol but never anchored is copy-paste dead weight (see below).
 *   PART 2 — "mentioned → available" — walks the ASSEMBLED .directive.xml files under
 *     ai/directives/sdd-v2/**: a bare `ID` mention with no way for the agent to ever see that
 *     contract's rules is a reference into the void — the class of bug fixed in
 *     contract/process/message-layout.xml (`UNDERSTANDING_BLOCK_FORMAT` / `FLOW_DIAGRAM_WHEN` were
 *     named there but defined ONLY in root.directive.xml, absent from 6 of the 13 directives that
 *     pull message-layout in without inheriting root).
 *
 * `audit-axiom-activation.mjs` checks `axiom/*` partials and explicitly excludes `contract/*`
 * ("audited by hand" — i.e. not really audited). That hole had a real cost: `QUESTION_FORMAT` rode
 * along in 15 directives' `ChatOutput` at one point, genuinely needed by only ~7 — the other 8 had
 * it as copy-paste dead weight, found by hand, late (see commit bc9cc8fb^ for the before-state).
 * AUTHORING.md's own backlog note names a second, still-open instance: `FLOW_DIAGRAM_WHEN`, a
 * single-consumer recipe (the layered scope-graph diagram) that "temporarily" spread to 5 directives
 * as a shared contract. This script is the mechanical half of catching that class of drift, applied
 * to `contract/*` the same way the sibling script applies to `axiom/*`.
 *
 * === PART 1 — "included → activated" =====================================================
 *
 * ACTIVATION CRITERION — derived from reading the templates, not guessed:
 *
 * Every `contract/*` partial a template connects lands inside one of five container tags. Which one
 * decides how activation is judged:
 *
 * 1. Self-describing artifact blocks — `<OutputContracts>`, `<ArtifactOutput>`, `<SessionState>`.
 *    A contract here IS the entire declared shape of the one thing this directive/worker writes
 *    (a finding, a phase-block log line, a session-state file, an ExecutionPlan's decision-log
 *    entry). There is no "sometimes" — the directive that owns one of these blocks always produces
 *    that artifact in that shape. Self-activated, no further check.
 *
 * 2. Situational chat-format toolboxes — `<ChatOutput>`, `<ChatProtocol>`. These enumerate formats
 *    the directive MAY reach for over a multi-turn conversation — a breadcrumb bar, a halt message,
 *    a question, a side-dive recap, a continuity menu. Listing a format here does not mean the
 *    directive's Steps actually do the thing that format renders. For these, activation requires
 *    the contract's `id` to appear at least once elsewhere in the same template (BeliefState,
 *    Axiom, ExecutionPlan/PhaseProcedure — anywhere outside the bare `{{> "..."}}` include line
 *    itself) — same spirit as the axiom script's "per `AX_ID`" anchor, but the search window is the
 *    whole file rather than only ExecutionPlan/PhaseProcedure, because a contract's anchor
 *    legitimately lives in a BeliefState `<Axiom>` too (e.g. `AX_ASK_TOOL_BINDING` naming
 *    `QUESTION_FORMAT`'s plain-text fallback) — narrower than that produces false positives.
 *
 * ALLOWLIST — three contracts, each verified against actual usage before being added (reasons are
 * per-entry below, not guesswork):
 *   - MESSAGE_LAYOUT: the base decision-card structure itself. Every other section it lists
 *     (breadcrumb, understanding block, flow diagram, question) is declared INSIDE its own body as
 *     "skip if empty for this step" — i.e. message-layout has no off-state to gate; it's what any
 *     step-boundary message in this genre IS, not a feature a directive opts into.
 *   - HALT_FORMAT: renders any `H_*` halt row. Checked empirically — every template that includes
 *     it (compression, discover-from-code, migration-v1-v2, recover-from-code, readiness, router,
 *     critic) has a real `<HaltConditions>` table with 1-5 live `H_*` codes. 100% correlation, no
 *     spread — the format is exactly as present as halting itself, which every one of these
 *     directives genuinely does.
 *   - QUESTION_RULE_SLIM: the trimmed default question/confirmation discipline ("fires only through
 *     `AskUserQuestion`, batch independents, explain-then-ask"). The directives that include it
 *     without a literal citation (infra, interface, module, root, scaffold, scope, compression,
 *     discover-from-code, migration-v1-v2, readiness, recover-from-code) all have real Approval
 *     Check / "Ask" rounds in their Steps — they just delegate the heavy interactive dialogue to
 *     `interview-protocol.directive.xml` (which carries `QUESTION_FORMAT` itself) and use this
 *     trimmed rule for their OWN local confirmations. Verified, not assumed.
 *
 * NOT allowlisted, deliberately, despite also showing up unanchored in several templates:
 * `FLOW_DIAGRAM_WHEN` (the exact contract AUTHORING.md's backlog note already names as
 * over-spread), `BREADCRUMB_FORMAT`, `SIDE_DIVE_FORMAT`, `NEXT_STEP_MENU_FORMAT`,
 * `UNDERSTANDING_BLOCK_FORMAT` — each of these needs directive-specific content or a
 * directive-specific mechanism to mean anything (named milestones, an `AX_STACK_BASED_FLOW` nested
 * frame, a candidate-options table, an actual misread-risk callout), so a bare inclusion with zero
 * anchor is exactly the copy-paste-dead-weight shape this script exists to catch. Any violation
 * reported for one of these is a real finding, not a criterion bug — do not paper over it by
 * widening the allowlist without checking usage the way the entries above were checked.
 *
 * Scanned set: same as audit-axiom-activation.mjs — top-level `*.directive.hbs` files directly
 * under `templates/sdd-v2/` (not `agent-inbox/`, not `formats/`).
 *
 * === PART 2 — "mentioned → available" =====================================================
 *
 * Part 1 catches a contract wired in but never used. It says nothing about the opposite fault:
 * prose that names a contract `ID` the reading agent has no way to resolve — not included in
 * THIS assembled file, not listed in its own "Inherited from the loading directive" line. The
 * agent hits the name with nothing behind it. This part walks the ASSEMBLED output instead of
 * the templates, because "available" is a property of the rendered file, not of any one partial.
 *
 * AVAILABILITY — a mention of contract id `ID` in file F is resolved when any of:
 *   1. INCLUDED — F itself contains `<Contract id="ID">` (the partial is inlined here).
 *   2. INHERITED — F's own "Inherited from the loading directive (already in context): …" line
 *      lists `ID` (the loader already showed it earlier in the same live session).
 *   3. LAZY-LOADED — F contains `READ_AND_USE_DIRECTIVE("<path>")` and the file at `<path>` (any
 *      `ai/directives/sdd-v2/**` file, resolved from repo root) itself contains `<Contract
 *      id="ID">` — the exact mechanism `build-directives.ts` already tracks as "the
 *      READ_AND_USE_DIRECTIVE graph"; by the time the behavior fires the agent will have read
 *      that file. (A dispatch line to a fresh SUBAGENT context — «Прочитай и воплоти: <path>» —
 *      does NOT count: that loads the target into someone else's context, not this file's own.)
 *
 * A mention resolved by none of the three is checked against ALLOWLIST_PAIRS / ALLOWLIST_FILE_IDS
 * below — hand-verified intentional pointers-to-primary-source, each with its own reason, same
 * spirit as `QUESTION_RULE_SLIM`'s own body pointing at `QUESTION_FORMAT` ("full format … in the
 * interview / vision directives") — not guessed, checked against the actual surrounding sentence.
 * Unresolved and unlisted → violation.
 *
 * Scanned set: every `*.directive.xml` under `ai/directives/sdd-v2/**` (recursive — includes
 * `agent-inbox/`; excludes `formats/*.xml` fragments, which are not top-level directives).
 *
 * PART 2 reads each scanned file's FULL text, not just the on-disk skeleton. A lazy-assembled
 * directive (`ai/kit/lazy-assembly.ts`, `ai/kit/build-directives.ts`) writes only a slim skeleton
 * at its normal path — a `<Contract id="...">` a bare mention needs to resolve against can live
 * inside one of that skeleton's step packages instead (`ai/directives/sdd-v2/<name>/steps/*.xml`).
 * `readAssembledFragments` below reads skeleton + every package the skeleton's own step list
 * names (via `resolveAssemblyMode`, the same manifest-driven check `build-directives.ts` itself
 * uses) and hands every downstream check the fragments SEPARATELY, never joined into one string:
 * a fenced code example can leave one backtick unpaired within its own file (harmless there —
 * the regexes below simply never match it), but concatenating raw text before scanning lets that
 * unpaired backtick re-pair with the next fragment's own backtick and swallow real content between
 * them into one bogus cross-fragment span. This is the exact class of gap already fixed for 3
 * other lazy-directive consumers this same task (`ai/kit/__tests__/delta-assembly.test.ts`,
 * `ai/kit/__tests__/readiness-preflight-gate.test.ts`,
 * `cli/__tests__/directive-tool-contract/directive-tool-contract.test.ts`) — this script is a 4th
 * consumer of the same class, fixed the same way: per-fragment scan, merged results.
 *
 * Run: node ai/kit/audit-contract-activation.mjs
 * Exit 1 and prints every violation (either part) when any contract/* partial lacks activation
 * or any bare mention resolves to nothing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAssemblyMode } from './lazy-assembly.ts';

const KIT_DIR = dirname(fileURLToPath(import.meta.url)); // ai/kit
const REPO_ROOT = join(KIT_DIR, '..', '..');
const TEMPLATES_DIR = join(KIT_DIR, 'templates', 'sdd-v2');
const CONTRACT_DIR = join(KIT_DIR, 'contract');
const DIRECTIVES_DIR = join(REPO_ROOT, 'ai', 'directives', 'sdd-v2');
const STEP_PACKAGE_LINE_RE = /Full step text: `([^`]+)`/g;

/** `assembly-manifest.json` override key for a file under `DIRECTIVES_DIR` (mirrors `build-directives.ts`'s own `e.rel`). */
function manifestKeyFor(absPath) {
  return `sdd-v2/${relative(DIRECTIVES_DIR, absPath).split(sep).join('/')}`;
}

/**
 * Every fragment of one assembled directive that actually carries text an agent can eventually
 * read: the skeleton alone for a monolith build, or the skeleton PLUS every step package it
 * points at for a lazy build. Fragments are returned as a plain array, deliberately never joined
 * — see the header comment above for why joining before a regex scan is unsafe.
 */
function readAssembledFragments(absPath) {
  const skeletonText = readFileSync(absPath, 'utf8');
  const fragments = [skeletonText];
  if (resolveAssemblyMode(manifestKeyFor(absPath)) === 'lazy') {
    for (const m of skeletonText.matchAll(STEP_PACKAGE_LINE_RE)) {
      fragments.push(readFileSync(join(REPO_ROOT, m[1]), 'utf8'));
    }
  }
  return fragments;
}

// === PART 1 — "included → activated" ========================================================

/** Self-describing artifact blocks — a contract here is the whole declared shape of one output. */
const SELF_ACTIVATING_BLOCKS = ['OutputContracts', 'ArtifactOutput', 'SessionState'];
/** Situational chat-format toolboxes — a contract here needs a real per-directive anchor. */
const CHECKED_BLOCKS = ['ChatOutput', 'ChatProtocol'];

/** Verified-universal contracts — see header comment for the evidence behind each entry. */
const ALLOWLIST_IDS = new Set(['MESSAGE_LAYOUT', 'HALT_FORMAT', 'QUESTION_RULE_SLIM']);

function blockRe(names) {
  return new RegExp(`<(${names.join('|')})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, 'g');
}
const SELF_RE = blockRe(SELF_ACTIVATING_BLOCKS);
const CHECKED_RE = blockRe(CHECKED_BLOCKS);
const PARTIAL_LINE_RE = /^[ \t]*\{\{>\s*"([^"]+)"\s*\}\}[ \t]*$/gm;

/** Top-level `.hbs` files directly under `dir` — no recursion into subdirectories. */
function listTemplates(dir) {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isFile() && p.endsWith('.hbs'));
}

const idCache = new Map();
function resolveContractId(partialPath) {
  if (idCache.has(partialPath)) return idCache.get(partialPath);
  const file = join(KIT_DIR, `${partialPath}.xml`);
  let id = null;
  try {
    const text = readFileSync(file, 'utf8');
    id = text.match(/<Contract\s+id="([^"]+)"/)?.[1] ?? null;
  } catch {
    id = null; // file missing — surfaced as its own violation below
  }
  idCache.set(partialPath, id);
  return id;
}

function partialsIn(blockText) {
  return [...blockText.matchAll(new RegExp(PARTIAL_LINE_RE.source, 'gm'))]
    .map((m) => m[1])
    .filter((p) => p.startsWith('contract/'));
}

function auditTemplateFile(file) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(KIT_DIR, file);

  const selfBlocks = [...text.matchAll(SELF_RE)].map((m) => m[2]);
  const checkedBlocks = [...text.matchAll(CHECKED_RE)].map((m) => m[2]);

  const selfPartials = new Set(selfBlocks.flatMap(partialsIn));
  const checkedPartials = new Set(checkedBlocks.flatMap(partialsIn));

  // A partial included in ANY self-activating block anywhere in the file is activated there,
  // even if the same partial also appears in a checked block elsewhere — self-activation wins.
  const toCheck = [...checkedPartials].filter((p) => !selfPartials.has(p));

  // Search window for rule 2: the whole file with only the bare include LINES stripped, so
  // surrounding prose (including a ChatOutput/ChatProtocol description line, or a BeliefState
  // Axiom) still counts as a real anchor.
  const restText = text.replace(PARTIAL_LINE_RE, '');

  const violations = [];
  for (const partial of toCheck) {
    const id = resolveContractId(partial);
    if (!id) {
      violations.push({ file: rel, partial, id: '(unresolved)', reason: 'contract file/id not found' });
      continue;
    }
    if (ALLOWLIST_IDS.has(id)) continue;
    if (!new RegExp(`\\b${id}\\b`).test(restText)) {
      violations.push({
        file: rel,
        partial,
        id,
        reason: 'included in ChatOutput/ChatProtocol but never anchored elsewhere in the template',
      });
    }
  }
  return violations;
}

const templates = listTemplates(TEMPLATES_DIR);
const part1Violations = templates.flatMap(auditTemplateFile);

// === PART 2 — "mentioned → available" ========================================================

/** Every `contract/*` partial's own id, discovered once from the source files (not guessed). */
function allContractIds() {
  const ids = new Set();
  for (const file of walk(CONTRACT_DIR)) {
    if (!file.endsWith('.xml')) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/<Contract\s+id="([^"]+)"/g)) ids.add(m[1]);
  }
  return ids;
}

/** Recursive file walk (Part 1's `listTemplates` is deliberately non-recursive; this isn't). */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Every `*.directive.xml` under `ai/directives/sdd-v2/**`, recursive (includes `agent-inbox/`). */
function listAssembledDirectives() {
  return walk(DIRECTIVES_DIR).filter((p) => p.endsWith('.directive.xml'));
}

const CONTRACT_OPEN_RE = /<Contract\s+id="([^"]+)"/g;
const INHERITED_LINE_RE = /Inherited from the loading directive[^:]*:\s*(.+)/g;
const READ_AND_USE_RE = /READ_AND_USE_DIRECTIVE\(\s*"([^"]+)"\s*\)/g;
/** Any `<Contract id="X">`/`<Axiom id="X">` span — used to find what a mention sits inside. */
const BLOCK_OPEN_RE = /<(Contract|Axiom)\s+id="([^"]+)"[^>]*>/g;

/**
 * Hand-verified intentional pointers-to-primary-source: an unavailable mention of `to` is fine
 * when it sits inside the body of the named enclosing `from` (a `<Contract id="from">` or
 * `<Axiom id="from">` block present in the SAME assembled file) — mirrors the ONE example the
 * review named (`QUESTION_RULE_SLIM` → `QUESTION_FORMAT`). Every entry checked against the actual
 * sentence, not assumed:
 */
const ALLOWLIST_PAIRS = new Set([
  // QUESTION_RULE_SLIM's own body: "Full format, with worked examples — QUESTION_FORMAT in the
  // interview / vision directives" — an explicit pointer to where the full contract lives.
  'QUESTION_RULE_SLIM->QUESTION_FORMAT',
  // MESSAGE_LAYOUT's own body nests the identical pointer one level deeper: "per
  // QUESTION_RULE_SLIM (full format with worked examples lives in QUESTION_FORMAT, in the
  // interview / vision directives)" — same primary-source pointer, same reason.
  'MESSAGE_LAYOUT->QUESTION_FORMAT',
  // AX_DECISION_LOG_REQUIRED restates the one-line Decision Log template inline wherever it's
  // copy-pasted; DECISION_LOG_ENTRY_FORMAT is named only for the ID-grammar/global-uniqueness
  // detail, not needed to follow the axiom's own (already self-sufficient) rule.
  'AX_DECISION_LOG_REQUIRED->DECISION_LOG_ENTRY_FORMAT',
  // Same axiom, cited a second time from AX_PARALLEL_MECHANISM_REQUIRES_JUSTIFICATION (critic's
  // system-fit check) — "record the choice as its own Decision Log entry" is the identical rule.
  'AX_PARALLEL_MECHANISM_REQUIRES_JUSTIFICATION->DECISION_LOG_ENTRY_FORMAT',
  // DECISION_LOG_ENTRY_FORMAT's own body: "<ACR>-DL-<N> … exactly like … <ACR>-REQ-<N>
  // (REQUIREMENT_ENTRY_FORMAT)" — an ID-grammar analogy, not a dependency on the full contract.
  'DECISION_LOG_ENTRY_FORMAT->REQUIREMENT_ENTRY_FORMAT',
  // AX_HANDOFF_TYPED: "Format per HANDOFF_FORMAT" — the WORKER composes the Handoff line under
  // phase-execution-protocol.directive.xml (which carries the full contract); an orchestrator
  // that only consumes/threads the already-written line needs the axiom's own key-vs-narrative
  // rule, not the worker's full schema.
  'AX_HANDOFF_TYPED->HANDOFF_FORMAT',
  // Same relationship for the worker's typed return: the orchestrator requires the line be
  // present and threads it verbatim, never composes it itself.
  'AX_HANDOFF_TYPED->RETURN_SUMMARY_FORMAT',
  // AX_OPERATOR_LANGUAGE's terminology-discipline clause: the glossary entry is written by the
  // `sdd-session term` CLI tool, mechanically, in SESSION_FILE_FORMAT shape — the agent invokes
  // the tool, it does not compose the section by hand.
  'AX_OPERATOR_LANGUAGE->SESSION_FILE_FORMAT',
  // AX_PERMITTED_BASH_COMMANDS (review-lifecycle): "BLOCKER_FORMAT … per the phase-execution
  // protocol" — the sentence itself names where the contract lives, same shape as the
  // QUESTION_RULE_SLIM pointer.
  'AX_PERMITTED_BASH_COMMANDS->BLOCKER_FORMAT',
  // AX_CLOSED_WORLD_INVENTORY / AX_USAGE_WAIVER_DISCIPLINE (phase-execution-protocol worker):
  // the drift-commitment / usage-waiver bullet is appended to an EXISTING module-spec entry the
  // worker has open — the entry's own shape is visible on the page; the worker is not composing
  // ENTITY_INVENTORY_FORMAT / DBC_PORT_FORMAT / DBC_ADAPTER_FORMAT / ENTITY_SURFACE_FORMAT from
  // memory. (Full contracts live in formats/entity-inventory-format.xml, formats/dbc-contracts.xml,
  // formats/entity-surface-format.xml, loaded by module.directive.xml when authoring the spec.)
  'AX_CLOSED_WORLD_INVENTORY->ENTITY_INVENTORY_FORMAT',
  'AX_USAGE_WAIVER_DISCIPLINE->DBC_PORT_FORMAT',
  'AX_USAGE_WAIVER_DISCIPLINE->DBC_ADAPTER_FORMAT',
  'AX_USAGE_WAIVER_DISCIPLINE->ENTITY_SURFACE_FORMAT',
  // AX_DEVIATION_SELF_RESOLVE, in the WORKER's own protocol: describes what the ORCHESTRATOR does
  // downstream with the collected deviations ("raises them … as a single batched AskUserQuestion
  // (QUESTION_RULE_SLIM)") — the worker itself never fires this Ask; the orchestrator that does
  // (execute/reconcile) carries QUESTION_RULE_SLIM itself.
  'AX_DEVIATION_SELF_RESOLVE->QUESTION_RULE_SLIM',
]);

/**
 * File-scoped intentional mentions that don't sit inside any named Axiom/Contract block (bare
 * Step/Action prose) — each is a citation of a format a CLI TOOL produces mechanically
 * (`sdd-migrate`, `sdd-log`), never composed by the agent from the contract's own rules.
 */
const ALLOWLIST_FILE_IDS = new Set([
  // "It also scaffolds <module>.3-tasks.md + <scope>.3-tasks.md … (MODULE_TASKS_INDEX_STRUCTURE /
  // SCOPE_TASKS_INDEX_STRUCTURE)" — sdd-migrate move's own mechanical output, not agent prose.
  'migration-v1-v2.directive.xml::MODULE_TASKS_INDEX_STRUCTURE',
  'migration-v1-v2.directive.xml::SCOPE_TASKS_INDEX_STRUCTURE',
  // "Append Round close via `sdd-log` (ROUND_CLOSE_FORMAT)" — sdd-log's own mechanical output.
  'execute.directive.xml::ROUND_CLOSE_FORMAT',
  // COVERAGE_MAP_FORMAT (defined later in the same file) restates the exact status glyphs this
  // earlier Step-3 mention cites; both name the one glyph rule interview-protocol repeats.
  'interview-protocol.directive.xml::BREADCRUMB_FORMAT',
]);

/** Every `<Contract id>`/`<Axiom id>` span in `text`, as `{ id, start, end }` (non-nested here). */
function findBlocks(text) {
  const blocks = [];
  for (const m of text.matchAll(BLOCK_OPEN_RE)) {
    const [, tag, id] = m;
    const closeRe = new RegExp(`</${tag}>`, 'g');
    closeRe.lastIndex = m.index + m[0].length;
    const close = closeRe.exec(text);
    blocks.push({ id, start: m.index, end: close ? close.index : text.length });
  }
  return blocks;
}

/** The smallest enclosing block's id at `pos`, or null when `pos` sits outside every block. */
function enclosingId(blocks, pos) {
  let best = null;
  for (const b of blocks) {
    if (pos >= b.start && pos <= b.end && (!best || b.end - b.start < best.end - best.start)) best = b;
  }
  return best?.id ?? null;
}

/**
 * Some ALLOWLIST_PAIRS entries are the mention's literal enclosing `<Axiom id="from">` block
 * (e.g. `QUESTION_RULE_SLIM->QUESTION_FORMAT`); others are a bare Step/Action sentence that CITES
 * the axiom by name right next to the contract id — `AX_HANDOFF_TYPED`/`AX_DECISION_LOG_REQUIRED`
 * read as inline citations, not tag nesting (e.g. "…Decision Log entry per `AX_DECISION_LOG_
 * REQUIRED` (`DECISION_LOG_ENTRY_FORMAT`: …)"). A generous same-sentence window covers the second
 * shape without guessing at sentence boundaries.
 */
const NEARBY_WINDOW = 300;
function nearbyMatch(text, pos, id) {
  const window = text.slice(Math.max(0, pos - NEARBY_WINDOW), pos + NEARBY_WINDOW);
  for (const pair of ALLOWLIST_PAIRS) {
    const [from, to] = pair.split('->');
    if (to === id && new RegExp(`\\b${from}\\b`).test(window)) return true;
  }
  return false;
}

const lazyIdCache = new Map();
/**
 * Contract ids defined ANYWHERE in the file at repo-root-relative `relPath` (or `{}` if
 * unreadable) — spans the target's step packages too when the target itself is lazy-assembled
 * (e.g. `reconcile.directive.xml`'s `READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/audit.directive.xml")`
 * points at a lazy pilot; a `<Contract id="...">` living only in one of `audit`'s step packages
 * must still count as reachable through this mechanism).
 */
function idsDefinedAt(relPath) {
  if (lazyIdCache.has(relPath)) return lazyIdCache.get(relPath);
  let ids = new Set();
  try {
    for (const fragment of readAssembledFragments(join(REPO_ROOT, relPath))) {
      for (const m of fragment.matchAll(CONTRACT_OPEN_RE)) ids.add(m[1]);
    }
  } catch {
    // target missing — this file's own freshness/link checks catch that separately.
  }
  lazyIdCache.set(relPath, ids);
  return ids;
}

const ALL_CONTRACT_IDS = allContractIds();

function auditAssembledFile(file) {
  const fragments = readAssembledFragments(file);
  const rel = relative(REPO_ROOT, file);
  const base = rel.split('/').pop();

  // Availability is unioned across every fragment: a Contract defined in one step package is
  // reachable through this same directive, same as one defined right in the skeleton.
  const included = new Set();
  const inherited = new Set();
  const lazy = new Set();
  for (const text of fragments) {
    for (const m of text.matchAll(CONTRACT_OPEN_RE)) included.add(m[1]);
    for (const m of text.matchAll(INHERITED_LINE_RE)) {
      for (const id of m[1].split(',').map((s) => s.trim())) inherited.add(id);
    }
    for (const m of text.matchAll(READ_AND_USE_RE)) for (const id of idsDefinedAt(m[1])) lazy.add(id);
  }
  const available = new Set([...included, ...inherited, ...lazy]);

  // Blocks (for enclosingId) and mention positions are computed and consumed PER FRAGMENT — a
  // position from one fragment is never checked against another fragment's block spans or text
  // window (see the header comment: no cross-fragment offsets, ever).
  const fragmentBlocks = fragments.map((text) => findBlocks(text));

  const violations = [];
  for (const id of ALL_CONTRACT_IDS) {
    if (available.has(id)) continue;
    const idRe = new RegExp(`\\b${id}\\b`, 'g');
    let mentioned = false;
    let hasUnresolved = false;
    for (let i = 0; i < fragments.length && !hasUnresolved; i++) {
      const text = fragments[i];
      const positions = [...text.matchAll(idRe)].map((m) => m.index);
      if (positions.length === 0) continue;
      mentioned = true;
      const blocks = fragmentBlocks[i];
      hasUnresolved = positions.some((pos) => {
        const from = enclosingId(blocks, pos);
        if (from && ALLOWLIST_PAIRS.has(`${from}->${id}`)) return false;
        if (ALLOWLIST_FILE_IDS.has(`${base}::${id}`)) return false;
        if (nearbyMatch(text, pos, id)) return false;
        return true;
      });
    }
    if (mentioned && hasUnresolved) {
      violations.push({ file: rel, id, reason: 'mentioned but not included/inherited/lazy-loaded/allowlisted' });
    }
  }
  return violations;
}

const assembled = listAssembledDirectives();
const part2Violations = assembled.flatMap(auditAssembledFile);

// === Combined report =========================================================================

const allViolations = [...part1Violations, ...part2Violations];

if (allViolations.length === 0) {
  console.log(
    `✓ contract-activation audit clean — ${templates.length} template(s) + ${assembled.length} ` +
      `assembled directive(s) checked.`
  );
  process.exit(0);
}

if (part1Violations.length > 0) {
  console.error(`⚠ ${part1Violations.length} contract-activation violation(s) — included → activated:\n`);
  const byFile = new Map();
  for (const v of part1Violations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }
  for (const [file, vs] of byFile) {
    console.error(`  ${file}`);
    for (const v of vs) console.error(`    - ${v.id} (${v.partial}) — ${v.reason}`);
  }
  console.error(
    `\nA contract/* partial connected in a template's <ChatOutput>/<ChatProtocol> must either be\n` +
      `anchored by its own literal id somewhere else in that same template (a Step, a BeliefState\n` +
      `Axiom, a halt row — anywhere outside the bare {{> "..."}} line), or the directive doesn't\n` +
      `actually need it. Fix: cite the id at the point the behavior really happens, or drop the\n` +
      `include if it's copy-paste residue (this is exactly how QUESTION_FORMAT rode dead in 8\n` +
      `directives before commit bc9cc8fb, and how AUTHORING.md's backlog note flags FLOW_DIAGRAM_WHEN\n` +
      `having spread to 5). Only for a genuinely universal, content-free format with no per-directive\n` +
      `setup — verify its actual usage first — add its id to ALLOWLIST_IDS in this script, documented.\n`
  );
}

if (part2Violations.length > 0) {
  console.error(`⚠ ${part2Violations.length} contract-activation violation(s) — mentioned → available:\n`);
  const byFile = new Map();
  for (const v of part2Violations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }
  for (const [file, vs] of byFile) {
    console.error(`  ${file}`);
    for (const v of vs) console.error(`    - ${v.id} — ${v.reason}`);
  }
  console.error(
    `\nA bare mention of a contract/* id in an ASSEMBLED directive must resolve: included in this\n` +
      `same file, listed in its own "Inherited from the loading directive" line, reachable via a\n` +
      `READ_AND_USE_DIRECTIVE("...") this same file names, or a hand-verified entry in\n` +
      `ALLOWLIST_PAIRS / ALLOWLIST_FILE_IDS in this script (documented, like\n` +
      `QUESTION_RULE_SLIM->QUESTION_FORMAT). Fix: make the sentence self-sufficient (repeat the\n` +
      `gist inline, the way message-layout.xml now does for UNDERSTANDING_BLOCK_FORMAT /\n` +
      `FLOW_DIAGRAM_WHEN), add the missing include, or add a checked allowlist entry with a reason.`
  );
}

process.exit(1);
