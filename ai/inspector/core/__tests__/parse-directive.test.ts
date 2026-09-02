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
  assert.equal(tree.label, '<SddExecute>');
  assert.equal(tree.attrs?.ver, '2.3');
});

test('top-level sections appear in document order', () => {
  const labels = (tree.children ?? []).map((c) => c.label);
  const requiredOrder = [
    '<Mission>',
    '<BeliefState>',
    '<Contracts>',
    '<HaltConditions>',
    '<ExecutionPlan>',
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
    'AX_EXECUTION_LOG_PLAN_VS_FACT',
    'AX_VERIFICATION_BEFORE_HANDOFF',
    'AX_HALT_VS_FAIL_DISTINCTION',
    'AX_HANDOFF_TYPED',
    'AX_TASK_PARALLEL',
  ]) {
    assert.ok(ids.includes(id), `${id} remains owned by execute after delta assembly`);
  }
  assert.ok(
    !ids.includes('AX_ENV_FIX_CHANNEL'),
    'the removed operator-approved environment patch channel is not reintroduced'
  );

  const recoveryContract = axioms.find(
    (axiom) => axiom.label === 'AX_HALT_VS_FAIL_DISTINCTION'
  )?.detail;
  assert.match(
    recoveryContract ?? '',
    /RECOVERABLE_TECHNICAL/,
    'execute-owned axioms classify ordinary technical gaps for autonomous recovery'
  );
  assert.match(
    recoveryContract ?? '',
    /EXTERNAL_AUTHORITY_REQUIRED/,
    'execute-owned axioms preserve the exact external-authority boundary'
  );
  for (const axiom of axioms) {
    assert.ok((axiom.note?.length ?? 0) > 0, `${axiom.label} has a short summary`);
    assert.ok(
      (axiom.detail?.length ?? 0) >= (axiom.note?.length ?? 0),
      `${axiom.label} keeps at least the summarized body`
    );
  }
});

test('HaltConditions carries the current stateless execute boundaries', () => {
  const h = section('<HaltConditions>');
  const ids = (h?.children ?? []).map((c) => c.label).sort();
  assert.deepEqual(ids, [
    'H_AMBIGUOUS_TASK',
    'H_PHASE_BLOCKED',
    'H_REAL_GATE_RED',
    'H_REQUIREMENT_UNCOVERED',
    'H_TICKET_NOT_APPROVED',
  ]);
});

test('ExecutionPlan carries the 8 stateless execute steps with exact ids', () => {
  const ep = section('<ExecutionPlan>');
  assert.deepEqual(
    ep?.children?.map((step) => step.attrs?.id),
    [
      'STEP_0_RESOLVE',
      'STEP_1_CONTEXT',
      'STEP_2_PLAN',
      'STEP_3_DISPATCH',
      'STEP_4_RECORD',
      'STEP_5_REAL_GATES',
      'STEP_6_AUDIT_REVIEW',
      'STEP_7_CLOSE',
    ]
  );
});

test('execute tools are captured without inventing executable directive calls from prose', () => {
  const tools = (tree.children ?? []).flatMap(function collect(node): string[] {
    return (node.children ?? []).flatMap((child) =>
      (child.kind === 'tool' && child.label ? [child.label] : []).concat(collect(child))
    );
  });
  assert.ok(tools.includes('sdd-task'));
  assert.ok(tools.includes('sdd-check'));
  const refs = deepRun(tree);
  assert.deepEqual(
    refs,
    ['ai/directives/sdd-v2/deviation-review.directive.xml'],
    'only the post-batch deviation review is executable; named worker protocols remain prose'
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
const routerPlan = router.children?.find((c) => c.label === '<ExecutionPlan>');
const routerStep = (id: string) => routerPlan?.children?.find((c) => c.attrs?.id === id);

test('router exposes the three stateless steps in exact order', () => {
  assert.deepEqual(
    routerPlan?.children?.map((step) => step.attrs?.id),
    ['STEP_0_STATE', 'STEP_1_CLASSIFY', 'STEP_2_ROUTE']
  );
});

test('classification makes V1→V2 the only migration and never creates session state', () => {
  const classify = routerStep('STEP_1_CLASSIFY')?.children?.find((c) => c.label === '<Action>');
  assert.match(classify?.detail ?? '', /never create a\s+session or migration branch/);
  assert.match(classify?.detail ?? '', /`FLOW_VERSION=v2` never routes to migration/);
  assert.match(classify?.detail ?? '', /`FLOW_VERSION=v1` may route to the explicit V1→V2/);
});

test('STEP_2_ROUTE parses the current bare LOGIC_SWITCH lines into exact owner branches', () => {
  const action = routerStep('STEP_2_ROUTE')?.children?.find((c) => c.label === '<Action>');
  const sw = action?.children?.find((child) => child.kind === 'switch');
  assert.ok(sw, 'uppercase LOGIC_SWITCH is a structured switch');
  const branches = sw?.children ?? [];
  const runs = branches
    .slice(0, -1)
    .map((branch) => branch.children?.find((child) => child.kind === 'run')?.ref);
  assert.deepEqual(runs, [
    'ai/directives/sdd-v2/migration-v1-v2.directive.xml',
    'ai/directives/sdd-v2/scaffold.directive.xml',
    'ai/directives/sdd-v2/execute.directive.xml',
    'ai/directives/sdd-v2/critic.directive.xml',
    'ai/directives/sdd-v2/reconcile.directive.xml',
    'ai/directives/sdd-v2/root.directive.xml',
    'ai/directives/sdd-v2/discover-from-code.directive.xml',
    'ai/directives/sdd-v2/module.directive.xml',
    'ai/directives/sdd-v2/infra.directive.xml',
    'ai/directives/sdd-v2/interface.directive.xml',
    'ai/directives/sdd-v2/scope.directive.xml',
  ]);
  assert.equal(branches.at(-1)?.label, 'DEFAULT', 'bare OTHERWISE is the default branch');
  assert.equal(
    action?.children?.some((child) => child.kind === 'unparsed' || child.kind === 'run'),
    false,
    'branch runs are nested under the switch, never flattened or marked unparsed'
  );
});

test('camel-case LogicSwitch keeps markdown-list WHEN / DEFAULT compatibility', () => {
  const parsed = parseDirective(
    'synthetic.directive.xml',
    [
      '<Synthetic>',
      '<ExecutionPlan><Step id="ROUTE"><Action>',
      '<LogicSwitch on="intent">',
      '- WHEN intent = execute -> READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/execute.directive.xml")',
      '- DEFAULT -> H_AMBIGUOUS_INTENT',
      '</LogicSwitch>',
      '</Action></Step></ExecutionPlan>',
      '</Synthetic>',
    ].join('\n')
  );
  const action = parsed.children?.[0]?.children?.[0]?.children?.find(
    (child) => child.label === '<Action>'
  );
  const sw = action?.children?.find((child) => child.kind === 'switch');
  assert.deepEqual(
    sw?.children?.map((branch) => branch.label),
    ['intent = execute', 'DEFAULT']
  );
  assert.equal(
    sw?.children?.[0]?.children?.find((child) => child.kind === 'run')?.ref,
    'ai/directives/sdd-v2/execute.directive.xml'
  );
});

// --- fallback branch (sections with no dedicated parser) must expand nested <Contract>/<Axiom> ---
// Regression: previously `note: firstSentence(el.inner), detail: clean(el.inner)` ran on the WHOLE
// section body including nested tag markup, with no `children` at all — a <ChatProtocol> holding only
// <Contract> elements rendered as an empty leaf (note "(пусто)"), and a section mixing its own text
// with a nested tag either showed a raw XML fragment or silently dropped the nested content.

test('the current router Contracts section expands all nested contracts', () => {
  const contracts = router.children?.find((c) => c.label === '<Contracts>');
  assert.ok(contracts, '<Contracts> section present');
  const ids = (contracts?.children ?? []).map((c) => c.label);
  assert.deepEqual(ids, [
    'ARTIFACT_APPROVAL_FLOW',
    'ARTIFACT_APPROVAL_MARKER',
    '<LogicSwitch>',
    'QUESTION_RULE_SLIM',
    'HALT_FORMAT',
  ]);
  for (const child of contracts?.children ?? []) {
    assert.ok((child.note?.length ?? 0) > 0, `${child.label} has a non-empty note`);
    assert.ok(
      (child.detail?.length ?? 0) >= (child.note?.length ?? 0),
      `${child.label} keeps its full body as detail`
    );
    assert.doesNotMatch(child.detail ?? '', /<Contract\b/, 'no raw tag markup leaks into detail');
  }
});

test('a section with its OWN text plus a nested <Contract> and <Axiom> keeps both', () => {
  const mixed = parseDirective(
    'synthetic.directive.xml',
    '<Synthetic><Mixed>Service line.<Contract id="MESSAGE_LAYOUT">decision card.</Contract><Axiom id="AX_PROGRESSIVE_DISCLOSURE">progressively.</Axiom></Mixed></Synthetic>'
  ).children?.find((c) => c.label === '<Mixed>');
  assert.ok(mixed, '<Mixed> section present');
  // the section's own prose (before the first nested tag) survives as its note/detail
  assert.match(mixed?.note ?? '', /Service line/);
  assert.doesNotMatch(
    mixed?.detail ?? '',
    /<Contract\b|<Axiom\b/,
    'own detail excludes nested tag markup'
  );
  const labels = (mixed?.children ?? []).map((c) => ({ label: c.label, kind: c.kind }));
  assert.deepEqual(labels, [
    { label: 'MESSAGE_LAYOUT', kind: 'text' },
    { label: 'AX_PROGRESSIVE_DISCLOSURE', kind: 'axiom' },
  ]);
  const contract = mixed?.children?.find((c) => c.label === 'MESSAGE_LAYOUT');
  assert.match(contract?.detail ?? '', /decision card/);
});

test('placeholder tokens inside `code spans` (e.g. `P<N>`, `` `<Task-ID>` ``) are not mistaken for nested tags', () => {
  const placeholderTree = parseDirective(
    'synthetic.directive.xml',
    '<Synthetic><ContextExpectation>Use `P<N>` and `<Task-ID>` with `sdd-task`.</ContextExpectation></Synthetic>'
  );
  const ctx = placeholderTree.children?.find((c) => c.label === '<ContextExpectation>');
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
