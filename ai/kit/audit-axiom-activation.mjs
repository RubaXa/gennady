#!/usr/bin/env node
/**
 * Axiom-activation audit for sdd-v2 templates (AUTHORING.md §10 / operator principle).
 *
 * An axiom sitting only in BeliefState is background the agent forgets over a long context.
 * It only works when a step activates it — a short reminder «per `AX_ID`» at the point in
 * ExecutionPlan (or PhaseProcedure, the worker-directive equivalent) where the behavior actually
 * applies. This script is the mechanical half of that rule: for every `axiom/*` partial a
 * template connects in its BeliefState, it resolves the Axiom `id` from the source file and
 * checks that id occurs at least once inside the template's own ExecutionPlan / PhaseProcedure.
 *
 * Scope is deliberately narrow: `axiom/*` Handlebars partials only (not inline `<Axiom>` blocks,
 * not `contract/*` partials — DECISION_LOG_ENTRY_FORMAT and friends are audited by hand, not by
 * this script). Cross-cutting conduct axioms — language, dialogue style, safeguard, discipline,
 * no-narration, live-text, tool-invocation, progressive-disclosure — apply to every line of
 * output and have no single anchoring step; they are exempt by an explicit allowlist below, not
 * by guesswork. `contract/process/*` format-contracts are exempt for the same reason (and are
 * outside this script's axiom/* scope regardless).
 *
 * Run: node ai/kit/audit-axiom-activation.mjs
 * Exit 1 and prints every violation when any axiom/* partial lacks a step-level activation.
 *
 * Scanned set: the top-level `*.directive.hbs` files directly under `templates/sdd-v2/` — the
 * router + branch + worker directives that share the ExecutionPlan/PhaseProcedure shape this
 * script checks against. Two sibling directories are deliberately NOT walked:
 * `templates/sdd-v2/agent-inbox/` (a different skill with its own directive shape — `<Step>`
 * blocks live directly inside `<BeliefState>`, no `<ExecutionPlan>`/`<PhaseProcedure>` wrapper at
 * all, so this script's structural assumption does not apply there) and
 * `templates/sdd-v2/formats/` (format-contract fragments, not full directives).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_DIR = dirname(fileURLToPath(import.meta.url)); // ai/kit
const TEMPLATES_DIR = join(KIT_DIR, 'templates', 'sdd-v2');

/** Background/conduct partials that apply to every line of output — no single owning step. */
const ALLOWLIST_BASENAMES = new Set([
  'ax-operator-language',
  'ax-operator-dialogue-style',
  'ax-operator-safeguard',
  'ax-dialogue-discipline',
  'ax-no-process-narration',
  'ax-operator-output-live-text',
  'ax-tool-invocation',
  'ax-progressive-disclosure',
]);

function isAllowlisted(partialPath) {
  const basename = partialPath.split('/').pop();
  return ALLOWLIST_BASENAMES.has(basename) || partialPath.startsWith('contract/process/');
}

/** Top-level `.hbs` files directly under `dir` — no recursion into subdirectories. */
function listTemplates(dir) {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isFile() && p.endsWith('.hbs'));
}

const PARTIAL_RE = /\{\{>\s*"([^"]+)"\s*\}\}/g;
const PLAN_BLOCK_RE = /<(ExecutionPlan|PhaseProcedure)\b[^>]*>[\s\S]*?<\/\1>/g;
const AXIOM_ID_RE = /<Axiom\s+id="([^"]+)"/;

const axiomIdCache = new Map();
function resolveAxiomId(partialPath) {
  if (axiomIdCache.has(partialPath)) return axiomIdCache.get(partialPath);
  const file = join(KIT_DIR, `${partialPath}.xml`);
  let id = null;
  try {
    const text = readFileSync(file, 'utf8');
    id = text.match(AXIOM_ID_RE)?.[1] ?? null;
  } catch {
    id = null; // file missing — surfaced as its own violation below
  }
  axiomIdCache.set(partialPath, id);
  return id;
}

function mentions(text, id) {
  return new RegExp(`\\b${id}\\b`).test(text);
}

function auditFile(file) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(KIT_DIR, file);

  const axiomPartials = [...text.matchAll(PARTIAL_RE)]
    .map((m) => m[1])
    .filter((p) => p.startsWith('axiom/'));
  const uniquePartials = [...new Set(axiomPartials)];

  const planText = [...text.matchAll(PLAN_BLOCK_RE)].map((m) => m[0]).join('\n');

  const violations = [];
  for (const partial of uniquePartials) {
    if (isAllowlisted(partial)) continue;
    const id = resolveAxiomId(partial);
    if (!id) {
      violations.push({ file: rel, partial, id: '(unresolved)', reason: 'axiom file/id not found' });
      continue;
    }
    if (!mentions(planText, id)) {
      violations.push({ file: rel, partial, id, reason: 'no activation in ExecutionPlan/PhaseProcedure' });
    }
  }
  return violations;
}

const templates = listTemplates(TEMPLATES_DIR);
const allViolations = templates.flatMap(auditFile);

if (allViolations.length === 0) {
  console.log(`✓ axiom-activation audit clean — ${templates.length} template(s) checked.`);
  process.exit(0);
}

console.error(`⚠ ${allViolations.length} axiom-activation violation(s):\n`);
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
  `\nEvery behavioral axiom/* partial connected in a template's BeliefState must be activated by\n` +
    `its own literal id (\`AX_...\`) inside that template's <ExecutionPlan> (or <PhaseProcedure>).\n` +
    `Fix: reference the id at the step that owns the behavior, or — only for a genuinely\n` +
    `cross-cutting conduct axiom with no single owning step — add its partial basename to\n` +
    `ALLOWLIST_BASENAMES in this script, with a reason (AUTHORING.md §10).`
);
process.exit(1);
