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
  assert.deepEqual(labels, [
    '<Mission>',
    '<BeliefState>',
    '<HaltConditions>',
    '<ContextExpectation>',
    '<ExecutionPlan>',
    '<HardForbidden>',
    '<ChatProtocol>',
    '<ChatOutput>',
  ]);
});

test('BeliefState carries 19 axioms with id + summary', () => {
  const bs = section('<BeliefState>');
  assert.equal(bs?.children?.length, 19);
  const tool = bs?.children?.find((a) => a.label === 'AX_TOOL_INVOCATION');
  assert.ok(tool, 'AX_TOOL_INVOCATION present');
  assert.ok((tool?.note?.length ?? 0) > 0, 'axiom has a short summary');
  assert.ok((tool?.detail?.length ?? 0) > (tool?.note?.length ?? 0), 'axiom keeps full body');
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

test('LogicSwitch yields one branch per WHEN/DEFAULT (9 total, incl. DEFAULT)', () => {
  const branches = routerSwitch?.children ?? [];
  assert.equal(branches.length, 9);
  assert.equal(branches.at(-1)?.label, 'DEFAULT');
});

test('each routing branch descends via a run node to its directive', () => {
  const first = routerSwitch?.children?.[0];
  const run = first?.children?.find((c) => c.kind === 'run');
  assert.equal(run?.ref, 'ai/directives/sdd-v2/root.directive.xml');
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
  const step0 = ep?.children?.[0];
  const findSwitch = (n: TraceNode): TraceNode | null => {
    if (n.kind === 'switch') return n;
    for (const c of n.children ?? []) {
      const r = findSwitch(c);
      if (r) return r;
    }
    return null;
  };
  const sw = findSwitch(step0 as TraceNode);
  assert.ok(sw, 'STEP_0 carries a structured switch');
  // 5 cases: migration (broad blast radius), the queue-exception (queued TODO tickets already
  // build the missing gate), readiness (broad blast radius), the narrow-blast-radius carve-out
  // (AX_PREFLIGHT_BLAST_RADIUS_SCOPED), DEFAULT.
  assert.equal(sw?.children?.length, 5);
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
