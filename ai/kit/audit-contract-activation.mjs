#!/usr/bin/env node
/**
 * Contract-activation audit for sdd-v2 templates (AUTHORING.md §7, §10, and the "Backlog: манифест
 * потребителей контрактов/аксиом" note at the end of that file).
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
 * Run: node ai/kit/audit-contract-activation.mjs
 * Exit 1 and prints every violation when any contract/* partial lacks activation.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_DIR = dirname(fileURLToPath(import.meta.url)); // ai/kit
const TEMPLATES_DIR = join(KIT_DIR, 'templates', 'sdd-v2');

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

function auditFile(file) {
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
const allViolations = templates.flatMap(auditFile);

if (allViolations.length === 0) {
  console.log(`✓ contract-activation audit clean — ${templates.length} template(s) checked.`);
  process.exit(0);
}

console.error(`⚠ ${allViolations.length} contract-activation violation(s):\n`);
const byFile = new Map();
for (const v of allViolations) {
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
    `setup — verify its actual usage first — add its id to ALLOWLIST_IDS in this script, documented.`
);
process.exit(1);
