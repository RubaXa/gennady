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
    '<ExecutionPlan>',
    '<HardForbidden>',
    '<ChatOutput>',
  ]);
});

test('BeliefState carries 14 axioms with id + summary', () => {
  const bs = section('<BeliefState>');
  assert.equal(bs?.children?.length, 14);
  const tool = bs?.children?.find((a) => a.label === 'AX_TOOL_INVOCATION');
  assert.ok(tool, 'AX_TOOL_INVOCATION present');
  assert.ok((tool?.note?.length ?? 0) > 0, 'axiom has a short summary');
  assert.ok((tool?.detail?.length ?? 0) > (tool?.note?.length ?? 0), 'axiom keeps full body');
});

test('HaltConditions carries the 5 halts', () => {
  const h = section('<HaltConditions>');
  const ids = (h?.children ?? []).map((c) => c.label).sort();
  assert.deepEqual(ids, [
    'H_AMBIGUOUS_TASK',
    'H_AUDIT_FAIL_AFTER_RETRY',
    'H_CODE_REVIEW_BLOCKER',
    'H_NO_TASKS',
    'H_PAUSED_AWAITING_OPERATOR',
  ]);
});

test('ExecutionPlan carries the 10 steps with ids', () => {
  const ep = section('<ExecutionPlan>');
  assert.equal(ep?.children?.length, 10);
  assert.equal(ep?.children?.[0]?.attrs?.id, 'STEP_0_RESOLVE');
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

test('LogicSwitch yields one branch per WHEN/DEFAULT (8 total, incl. DEFAULT)', () => {
  const branches = routerSwitch?.children ?? [];
  assert.equal(branches.length, 8);
  assert.equal(branches.at(-1)?.label, 'DEFAULT');
});

test('each routing branch descends via a run node to its directive', () => {
  const first = routerSwitch?.children?.[0];
  const run = first?.children?.find((c) => c.kind === 'run');
  assert.equal(run?.ref, 'ai/directives/sdd-v2/root.directive.xml');
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
  // 4 cases: migration (broad blast radius), readiness (broad blast radius),
  // the narrow-blast-radius carve-out (AX_PREFLIGHT_BLAST_RADIUS_SCOPED), DEFAULT.
  assert.equal(sw?.children?.length, 4);
  assert.equal(sw?.children?.at(-1)?.label, 'DEFAULT');
  const run = sw?.children?.[0]?.children?.find((c) => c.kind === 'run');
  assert.match(run?.ref ?? '', /migration-v1-v2/);
});
