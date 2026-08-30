// @file: ai/inspector — verify the directive parser against the real execute.directive.xml.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDirective } from '../parse-directive.ts';
import { firstSentence } from '../scan.ts';
import type { TraceNode } from '../model.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const xml = readFileSync(join(repoRoot, 'ai/directives/sdd-v2/execute.directive.xml'), 'utf8');
const tree = parseDirective('ai/directives/sdd-v2/execute.directive.xml', xml);
const section = (label: string): TraceNode | undefined =>
  tree.children?.find((c) => c.label === label);
const deepRun = (n: TraceNode): string[] =>
  (n.children ?? []).flatMap((c) => (c.kind === 'run' && c.ref ? [c.ref] : []).concat(deepRun(c)));

test('root tag is the directive element', () => {
  assert.equal(tree.kind, 'directive');
  assert.equal(tree.label, '<SddExecuteOrchestrator>');
  assert.equal(tree.attrs?.ver, '2.1');
});

test('top-level sections appear in document order', () => {
  const labels = (tree.children ?? []).map((c) => c.label);
  const requiredOrder = [
    '<Mission>',
    '<BeliefState>',
    '<SessionState>',
    '<HaltConditions>',
    '<ContextExpectation>',
    '<ExecutionPlan>',
    '<HardForbidden>',
    '<ChatProtocol>',
    '<ChatOutput>',
  ];
  const positions = requiredOrder.map((label) => labels.indexOf(label));
  assert.ok(
    positions.every((position) => position >= 0),
    'every execute section is present'
  );
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
    'required sections preserve their source order even when a new section is added'
  );
});

test('BeliefState carries the execute-owned axioms with ids and readable bodies', () => {
  const bs = section('<BeliefState>');
  const axioms = (bs?.children ?? []).filter((child) => child.kind === 'axiom');
  const ids = axioms.map((axiom) => axiom.label);
  assert.equal(new Set(ids).size, ids.length, 'axiom ids stay unique');
  for (const id of [
    'AX_OWNER',
    'AX_EXECUTION_ORDER',
    'AX_WORKER_SESSION_REUSE',
    'AX_VERIFY_AND_FINALIZE',
    'AX_ENV_FIX_CHANNEL',
  ]) {
    assert.ok(ids.includes(id), `${id} remains owned by execute after delta assembly`);
  }
  for (const axiom of axioms) {
    assert.ok((axiom.note?.length ?? 0) > 0, `${axiom.label} has a short summary`);
    assert.ok(
      (axiom.detail?.length ?? 0) >= (axiom.note?.length ?? 0),
      `${axiom.label} keeps at least the summarized body`
    );
  }
});

test('HaltConditions carries the 6 halts', () => {
  const h = section('<HaltConditions>');
  const ids = (h?.children ?? []).map((c) => c.label).sort();
  assert.deepEqual(ids, [
    'H_AMBIGUOUS_TASK',
    'H_AUDIT_FAIL_AFTER_RETRY',
    'H_CODE_REVIEW_BLOCKER',
    'H_NO_TASKS',
    'H_PAUSED_AWAITING_OPERATOR',
    'H_WORKER_INTERRUPTED',
  ]);
});

test('ExecutionPlan carries the 11 steps with ids', () => {
  const ep = section('<ExecutionPlan>');
  assert.equal(ep?.children?.length, 11);
  assert.equal(ep?.children?.[0]?.attrs?.id, 'STEP_0_RESOLVE');
  assert.equal(ep?.children?.[1]?.attrs?.id, 'STEP_0B_PREFLIGHT');
  assert.equal(ep?.children?.at(-1)?.attrs?.id, 'STEP_8_SUMMARY');
});

test('READ_AND_USE targets are captured as run nodes', () => {
  const refs = deepRun(tree);
  assert.ok(
    refs.some((r) => r.includes('phase-execution-protocol')),
    'phase-execution'
  );
  assert.ok(
    refs.some((r) => r.includes('audit.directive')),
    'audit'
  );
  assert.ok(
    refs.some((r) => r.includes('code-review.directive')),
    'code-review'
  );
});

test('a step exposes its Action with tools / switches', () => {
  const ep = section('<ExecutionPlan>');
  const step0 = ep?.children?.[0];
  const action = step0?.children?.find((c) => c.label === '<Action>');
  assert.ok(action, 'STEP_0 has an Action');
  const toolLabels = (action?.children ?? []).filter((c) => c.kind === 'tool').map((c) => c.label);
  assert.ok(toolLabels.includes('sdd-task'), 'STEP_0 calls sdd-task');
});

test('firstSentence trims and strips comments', () => {
  assert.equal(firstSentence('Привет.  Второе.'), 'Привет.');
  assert.equal(firstSentence('<!-- c -->Текст без точки'), 'Текст без точки');
});

const routerXml = readFileSync(join(repoRoot, 'ai/directives/sdd-v2/router.directive.xml'), 'utf8');
const router = parseDirective('ai/directives/sdd-v2/router.directive.xml', routerXml);
const routerSwitch = router.children?.find((c) => c.kind === 'switch');

test('the structured <LogicSwitch> is parsed into a switch node', () => {
  assert.ok(routerSwitch, 'switch section present');
  assert.match(routerSwitch?.note ?? '', /sdd-state|intent/);
});

test('LogicSwitch keeps accepted module decomposition before its refusal halt', () => {
  const branches = routerSwitch?.children ?? [];
  assert.equal(branches.at(-1)?.label, 'DEFAULT');

  const acceptedIndex = branches.findIndex((branch) =>
    branch.children?.some(
      (child) => child.kind === 'run' && child.ref === 'ai/directives/sdd-v2/module.directive.xml'
    )
  );
  const refusalIndex = branches.findIndex(
    (branch) => branch.label === 'intent = module-decomposition AND neither exact state above holds'
  );

  assert.ok(acceptedIndex >= 0, 'accepted module-decomposition branch is present');
  assert.equal(refusalIndex, acceptedIndex + 1, 'refusal follows the accepted exact-state branch');

  const acceptedRun = branches[acceptedIndex]?.children?.find((child) => child.kind === 'run');
  assert.equal(acceptedRun?.ref, 'ai/directives/sdd-v2/module.directive.xml');

  const refusal = branches[refusalIndex];
  assert.match(refusal?.detail ?? '', /halt `H_SCOPE_DRAFT_NOT_OPERATOR_APPROVED`/);
  assert.equal(
    refusal?.children?.some((child) => child.kind === 'run'),
    false,
    'refusal halts without READ_AND_USE descent'
  );
});

test('forced owner routes and inferred project setup descend to their semantic owners', () => {
  const branches = routerSwitch?.children ?? [];
  const assertRoute = (label: string, ref: string) => {
    const branch = branches.find((candidate) => candidate.label.includes(label));
    assert.ok(branch, `${label} route is present`);
    const run = branch.children?.find((child) => child.kind === 'run');
    assert.equal(run?.ref, ref, `${label} routes to its owner`);
  };

  assertRoute('forced intent = scaffold', 'ai/directives/sdd-v2/scaffold.directive.xml');
  assertRoute('forced intent = reconcile', 'ai/directives/sdd-v2/reconcile.directive.xml');
  assertRoute('forced intent = critic', 'ai/directives/sdd-v2/critic.directive.xml');
  assertRoute('forced intent = execute', 'ai/directives/sdd-v2/execute.directive.xml');
  assertRoute('intent = project-setup', 'ai/directives/sdd-v2/root.directive.xml');
});

test('STEP_6_BRANCH LogicSwitch yields 5 branches — mechanical-fix path precedes the operator risk-ask', () => {
  const ep = section('<ExecutionPlan>');
  const step6 = ep?.children?.find((c) => c.attrs?.id === 'STEP_6_BRANCH');
  const findSwitch = (n: TraceNode): TraceNode | null => {
    if (n.kind === 'switch') return n;
    for (const c of n.children ?? []) {
      const r = findSwitch(c);
      if (r) return r;
    }
    return null;
  };
  const sw = findSwitch(step6 as TraceNode);
  assert.ok(sw, 'STEP_6_BRANCH carries a structured switch');
  const branches = sw?.children ?? [];
  assert.equal(branches.length, 5);
  assert.match(branches[1]?.detail ?? '', /concrete mechanical remediation/);
  assert.match(branches[2]?.detail ?? '', /NO concrete mechanical remediation/);
});

test('a preflight step embeds a structured <LogicSwitch> (WHEN gates), not prose', () => {
  const ep = router.children?.find((c) => c.label === '<ExecutionPlan>');
  const preflight = ep?.children?.find((c) => c.attrs?.id === 'STEP_1B_PREFLIGHT');
  const findSwitch = (n: TraceNode): TraceNode | null => {
    if (n.kind === 'switch') return n;
    for (const c of n.children ?? []) {
      const r = findSwitch(c);
      if (r) return r;
    }
    return null;
  };
  const sw = findSwitch(preflight as TraceNode);
  assert.ok(sw, 'STEP_1B_PREFLIGHT carries a structured switch after the session barrier');
  // 10 cases: migration (broad blast radius), the queue-exception (queued TODO tickets already
  // build the missing gate), readiness (broad blast radius), the three `provisional` branches (the
  // GATE_QUEUE ticket itself is exempt — it builds the gates; other tickets' code phases stop;
  // bootstrap/scaffold/spec work continues), the two GATE_QUEUE_DIAG branches (approved infra spec
  // with no tickets yet → scaffold; scope-name mismatch → fix the ticket/portal name), the
  // narrow-blast-radius carve-out (AX_PREFLIGHT_BLAST_RADIUS_SCOPED), DEFAULT.
  assert.equal(sw?.children?.length, 10);
  assert.equal(sw?.children?.at(-1)?.label, 'DEFAULT');
  const run = sw?.children?.[0]?.children?.find((c) => c.kind === 'run');
  assert.match(run?.ref ?? '', /migration-v1-v2/);
});

// --- fallback branch (sections with no dedicated parser) must expand nested <Contract>/<Axiom> ---
// Regression: previously `note: firstSentence(el.inner), detail: clean(el.inner)` ran on the WHOLE
// section body including nested tag markup, with no `children` at all — a <ChatProtocol> holding only
// <Contract> elements rendered as an empty leaf (note "(пусто)"), and a section mixing its own text
// with a nested tag either showed a raw XML fragment or silently dropped the nested content.

test('a section with ONLY nested <Contract> elements and no own text expands them as children', () => {
  const chatProtocol = router.children?.find((c) => c.label === '<ChatProtocol>');
  assert.ok(chatProtocol, '<ChatProtocol> section present');
  assert.equal(
    chatProtocol?.children?.length,
    2,
    'both nested <Contract> elements became children'
  );
  const ids = (chatProtocol?.children ?? []).map((c) => c.label);
  assert.deepEqual(ids, ['QUESTION_RULE_SLIM', 'HALT_FORMAT']);
  for (const child of chatProtocol?.children ?? []) {
    assert.ok((child.note?.length ?? 0) > 0, `${child.label} has a non-empty note`);
    assert.ok(
      (child.detail?.length ?? 0) >= (child.note?.length ?? 0),
      `${child.label} keeps its full body as detail`
    );
    assert.doesNotMatch(child.detail ?? '', /<Contract\b/, 'no raw tag markup leaks into detail');
  }
  // no own text between the two <Contract> tags → a meaningful count note, never a blank "(пусто)"
  assert.match(chatProtocol?.note ?? '', /вложенн/);
});

test('a section with its OWN text plus a nested <Contract> and <Axiom> keeps both', () => {
  const chatOutput = router.children?.find((c) => c.label === '<ChatOutput>');
  assert.ok(chatOutput, '<ChatOutput> section present');
  // the section's own prose (before the first nested tag) survives as its note/detail
  assert.match(chatOutput?.note ?? '', /Service line/);
  assert.doesNotMatch(
    chatOutput?.detail ?? '',
    /<Contract\b|<Axiom\b/,
    'own detail excludes nested tag markup'
  );
  const labels = (chatOutput?.children ?? []).map((c) => ({ label: c.label, kind: c.kind }));
  assert.deepEqual(labels, [
    { label: 'MESSAGE_LAYOUT', kind: 'text' },
    { label: 'AX_PROGRESSIVE_DISCLOSURE', kind: 'axiom' },
  ]);
  const contract = chatOutput?.children?.find((c) => c.label === 'MESSAGE_LAYOUT');
  assert.match(contract?.detail ?? '', /decision card/);
});

test('placeholder tokens inside `code spans` (e.g. `P<N>`, `` `<Task-ID>` ``) are not mistaken for nested tags', () => {
  // execute.directive.xml's <ContextExpectation> has no dedicated parser and its markdown table is
  // full of backticked placeholders shaped like a tag (<N>, <ticket>, <id>) — none of these may turn
  // into a bogus child node, and the section's own text must stay intact.
  const ctx = tree.children?.find((c) => c.label === '<ContextExpectation>');
  assert.ok(ctx, '<ContextExpectation> section present');
  assert.equal(
    ctx?.children,
    undefined,
    'no nested tags in a plain markdown table — no bogus children'
  );
  assert.match(ctx?.detail ?? '', /sdd-task/);
});

// --- regression: root-level scan swallowed by an unclosed placeholder tag (<NAME>, <X>, <YYYY-MM-DD>) ---
// A format/contract file's root (<Contract id="...">) has no PascalCase structural children — the
// WHOLE body is markdown content, captured via `rootDetail` when `topLevelElements` finds nothing.
// PASCAL_OPEN treats a single capital letter as a valid tag name, so bare markdown placeholders like
// `<NAME>`, `<X>`, `<YYYY-MM-DD>` used to be mistaken for real tags. Since none of these placeholders
// have a matching `</NAME>` anywhere in the document, the OLD nextElement() fallback (no closer found
// → inner runs to end of string) made the first one it hit swallow the entire rest of the file as its
// own (bogus) body: tree.children became `[{label:'<NAME>', ...}]` and the real detail/content of the
// contract was lost — not just misfiled, GONE (no fallback path captures it once children.length > 0).

const researchDocXml = readFileSync(
  join(repoRoot, 'ai/directives/sdd-v2/formats/research-doc-structure.xml'),
  'utf8'
);
const researchDoc = parseDirective(
  'ai/directives/sdd-v2/formats/research-doc-structure.xml',
  researchDocXml
);

test('a bare unclosed placeholder tag in prose (<NAME>, <X>/<Y>/<Z>/<G>/<T>, <YYYY-MM-DD>) does not swallow the rest of the document', () => {
  assert.equal(researchDoc.label, '<Contract>');
  assert.deepEqual(researchDoc.children, [], 'no bogus placeholder children');
  assert.ok((researchDoc.detail?.length ?? 0) > 4000, 'full markdown body preserved as detail');
  assert.match(researchDoc.detail ?? '', /sdd-extract/);
  assert.match(
    researchDoc.detail ?? '',
    /Выбрали/,
    'DECISION section prose (with bare <X>/<Y>/<Z>) survives'
  );
  assert.match(
    researchDoc.detail ?? '',
    /Related/,
    'tail section after every placeholder still present'
  );
});

// --- regression: nested <Axiom> inside <Axiom> truncated the outer and dropped the inner entirely ---
// agent-inbox/{code-lens,security-lens,synthesize,track-review}.directive.xml quote one axiom verbatim
// inside another instead of duplicating text: <Axiom id="AX_NO_DUPLICATION">...<Axiom
// id="AX_TICKET_DEDUPLICATION">...</Axiom>...</Axiom>. The OLD lazy regex
// `/<Axiom\b([^>]*)>([\s\S]*?)<\/Axiom>/g` stopped at the FIRST `</Axiom>` — the inner one's — so the
// outer's body was cut off mid-sentence (everything after the nested axiom silently dropped) and the
// inner axiom never became a node at all.

const codeLensXml = readFileSync(
  join(repoRoot, 'ai/directives/sdd-v2/agent-inbox/code-lens.directive.xml'),
  'utf8'
);
const codeLens = parseDirective(
  'ai/directives/sdd-v2/agent-inbox/code-lens.directive.xml',
  codeLensXml
);

test('a nested <Axiom> inside <Axiom> becomes a child, not a truncation of the outer', () => {
  const beliefState = codeLens.children?.find((c) => c.label === '<BeliefState>');
  assert.ok(beliefState, '<BeliefState> present');
  const outer = beliefState?.children?.find((a) => a.label === 'AX_NO_DUPLICATION');
  assert.ok(outer, 'AX_NO_DUPLICATION present');
  const inner = outer?.children?.find((a) => a.label === 'AX_TICKET_DEDUPLICATION');
  assert.ok(inner, 'AX_TICKET_DEDUPLICATION is a child of AX_NO_DUPLICATION, not lost');
  assert.match(inner?.detail ?? '', /specs\/3-tasks\.md/);
  // the outer's own detail keeps its FULL text — including what came after the nested axiom in the
  // source — without leaking the nested element's raw XML markup into it
  assert.match(
    outer?.detail ?? '',
    /same principle\s*\n?\s*is read verbatim below/,
    "outer body is not truncated at the nested axiom's close"
  );
  assert.doesNotMatch(
    outer?.detail ?? '',
    /<Axiom\b/,
    'no raw nested-tag markup leaks into outer detail'
  );
});
