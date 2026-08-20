// @file: ai/inspector — verify the skill parser + recursive resolver.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkill } from '../parse-skill.ts';
import { resolveTree } from '../resolve.ts';
import type { TraceNode } from '../model.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const md = readFileSync(join(repoRoot, 'ai/skills/sdd-execute/SKILL.md'), 'utf8');
const skill = parseSkill('ai/skills/sdd-execute/SKILL.md', md);
const plan = (n: TraceNode): TraceNode | undefined =>
  n.children?.find((c) => c.label === '<ExecutionPlan>');
const stepById = (n: TraceNode, id: string): TraceNode | undefined =>
  plan(n)?.children?.find((s) => s.attrs?.id === id);
const refsOf = (n: TraceNode | undefined): string[] =>
  (n?.children ?? []).filter((c) => c.kind === 'run').map((c) => c.ref ?? '');

test('skill node carries name + description', () => {
  assert.equal(skill.kind, 'skill');
  assert.equal(skill.label, '/sdd-execute');
  assert.ok((skill.note?.length ?? 0) > 0);
});

test('ExecutionPlan exposes GATHER / PREFLIGHT / EMBODY in order', () => {
  const ids = (plan(skill)?.children ?? []).map((s) => s.attrs?.id);
  assert.deepEqual(ids, ['GATHER', 'PREFLIGHT', 'EMBODY']);
});

test('GATHER reads the main directive and runs sdd-state', () => {
  const g = stepById(skill, 'GATHER');
  assert.ok(
    refsOf(g).some((r) => r === 'ai/directives/sdd-v2/execute.directive.xml'),
    'execute.directive ref normalized'
  );
  assert.ok(
    (g?.children ?? []).some((c) => c.kind === 'tool' && c.label === 'sdd-state'),
    'sdd-state tool'
  );
});

test('PREFLIGHT no longer re-derives the FLOW_VERSION/READINESS interpretation — that moved into the directive itself (STEP_0B_PREFLIGHT), read via GATHER', () => {
  const refs = refsOf(stepById(skill, 'PREFLIGHT'));
  assert.deepEqual(
    refs,
    [],
    'PREFLIGHT should carry no directive refs of its own — see ai/kit/__tests__/readiness-preflight-gate.test.ts for the project-wide guard'
  );
});

test('resolveTree expands a run node into the referenced directive tree', () => {
  const tree: TraceNode = {
    kind: 'skill',
    label: '/x',
    children: [{ kind: 'run', label: 'a', ref: 'a.directive.xml' }],
  };
  const read = (ref: string): string | null =>
    ref === 'a.directive.xml' ? '<RootA ver="1"><Mission>hi.</Mission></RootA>' : null;
  resolveTree(tree, read);
  const run = tree.children?.[0];
  assert.equal(run?.children?.[0]?.kind, 'directive');
  assert.equal(run?.children?.[0]?.label, '<RootA>');
});

test('resolveTree marks a cycle instead of looping forever', () => {
  const ref = 'ai/directives/sdd-v2/a.directive.xml';
  const tree: TraceNode = { kind: 'run', label: 'a', ref };
  const read = (): string =>
    `<RootA><ExecutionPlan><Step id="S"><Action>read \`READ_AND_USE_DIRECTIVE("${ref}")\`</Action></Step></ExecutionPlan></RootA>`;
  resolveTree(tree, read);
  // descend until the self-reference is caught
  const json = JSON.stringify(tree);
  assert.ok(json.includes('↻ цикл'), 'cycle marker present');
});

test('resolveTree marks a missing directive file', () => {
  const tree: TraceNode = { kind: 'run', label: 'gone', ref: 'gone.directive.xml' };
  resolveTree(tree, () => null);
  assert.equal(tree.children?.[0]?.label, 'файл директивы не найден');
});
