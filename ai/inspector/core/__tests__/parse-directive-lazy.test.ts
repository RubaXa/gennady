// @file: ai/inspector — verify the directive parser against the REAL lazy-assembled pilots
// (audit, scaffold, phase-execution-protocol). Regression guard for the blindness found in the
// final review: a lazy skeleton's <ExecutionPlan>/<PhaseProcedure> carries a bullet list, not
// <Step> blocks — the OLD parser found zero <Step> in the skeleton and silently rendered
// `children: []`, dropping the entire step list from the trace. These tests fail loudly if that
// regresses: non-empty step list, count matching the on-disk package files, and real step bodies
// (not just the skeleton's one-line gist) present in the tree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDirective } from '../parse-directive.ts';
import type { FileReader, TraceNode } from '../model.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Same contract as ai/inspector/generate.ts's own reader — repo-relative ref → content or null. */
const read: FileReader = (ref) => {
  const p = resolve(repoRoot, ref);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

function loadDirective(relPath: string): TraceNode {
  const xml = readFileSync(join(repoRoot, relPath), 'utf8');
  return parseDirective(relPath, xml, read);
}

function stepFilesOf(directiveName: string): string[] {
  return readdirSync(join(repoRoot, 'ai/directives/sdd-v2', directiveName, 'steps')).sort();
}

/** Find a step node anywhere under an ExecutionPlan/PhaseProcedure section by its bare id. */
function findStep(section: TraceNode | undefined, id: string): TraceNode | undefined {
  return section?.children?.find((c) => c.attrs?.id === id);
}

// --- audit.directive.xml (<ExecutionPlan>, tag used by most lazy pilots) ---

const audit = loadDirective('ai/directives/sdd-v2/audit.directive.xml');
const auditPlan = audit.children?.find((c) => c.label === '<ExecutionPlan>');

test('audit: lazy <ExecutionPlan> is not blind — step list is non-empty and matches on-disk packages', () => {
  assert.ok(auditPlan, '<ExecutionPlan> section present');
  const ids = (auditPlan?.children ?? []).map((c) => c.attrs?.id);
  assert.ok(ids.length > 0, 'step list must not be empty (this is exactly the regression)');
  assert.equal(ids.length, stepFilesOf('audit').length, 'one tree step per file under steps/');
  assert.deepEqual(
    ids,
    ['STEP_1_MECHANICAL', 'STEP_2_SEMANTIC', 'STEP_3_ROUTE'],
    'skeleton order, not alphabetical'
  );
});

test('audit: a lazy step exposes its real body (Goal/Action), not just the skeleton one-line gist', () => {
  const step = findStep(auditPlan, 'STEP_2_SEMANTIC');
  assert.ok(step, 'STEP_2_SEMANTIC present as a step node');
  assert.match(
    step?.note ?? '',
    /физически.*audit\/steps\/STEP_2_SEMANTIC\.xml/,
    'note names the real package file'
  );
  const goal = step?.children?.find((c) => c.label === '<Goal>');
  const action = step?.children?.find((c) => c.label === '<Action>');
  assert.ok(goal, 'Goal read from the package body');
  assert.ok(action, 'Action read from the package body');
  assert.match(
    action?.detail ?? '',
    /CLOSED_WORLD_PRIMARY_CHECK/,
    'real Action text from the package, not the skeleton gist'
  );
});

test('audit: every lazy step exposes the runtime READ_AND_USE edge to its package', () => {
  const step = findStep(auditPlan, 'STEP_2_SEMANTIC');
  const readNode = step?.children?.find((c) => c.kind === 'read');
  assert.ok(readNode, 'step package load is visible as a read node');
  assert.equal(
    readNode?.ref,
    'ai/directives/sdd-v2/audit/steps/STEP_2_SEMANTIC.xml',
    'read edge targets the exact package named by the skeleton'
  );
  assert.match(readNode?.note ?? '', /READ_AND_USE/);
});

test('audit: single-step axioms physically relocated into the package are surfaced as children of the step', () => {
  const step = findStep(auditPlan, 'STEP_2_SEMANTIC');
  const axiomIds = (step?.children ?? []).filter((c) => c.kind === 'axiom').map((c) => c.label);
  assert.ok(axiomIds.includes('AX_READ_PER_MANIFEST'), 'package-only axiom visible under its step');
  assert.ok(
    axiomIds.includes('AX_CLOSED_WORLD_PRIMARY_CHECK'),
    'package-only axiom visible under its step'
  );
});

test('audit: a package-only <Contract> is surfaced too, with its full body', () => {
  const step = findStep(auditPlan, 'STEP_3_ROUTE');
  const contract = step?.children?.find((c) => c.label === 'FINDING_FORMAT');
  assert.ok(
    contract,
    'FINDING_FORMAT contract, otherwise invisible (not in skeleton OutputContracts), is in the tree'
  );
  assert.match(contract?.detail ?? '', /F-NNN/, 'full contract body kept, not just a gist');
});

// --- scaffold.directive.xml (also <ExecutionPlan>) ---

const scaffold = loadDirective('ai/directives/sdd-v2/scaffold.directive.xml');
const scaffoldPlan = scaffold.children?.find((c) => c.label === '<ExecutionPlan>');

test('scaffold: lazy step list non-empty, count matches steps/ directory, skeleton order preserved (not alphabetical)', () => {
  const ids = (scaffoldPlan?.children ?? []).map((c) => c.attrs?.id);
  assert.equal(ids.length, stepFilesOf('scaffold').length);
  // alphabetically STEP_0B_PREFLIGHT sorts BEFORE STEP_0_INTAKE ('B' < '_'); the real skeleton
  // list puts STEP_0_INTAKE first — proves order comes from the skeleton bullet list, not a sort.
  assert.deepEqual(ids.slice(0, 2), ['STEP_0_INTAKE', 'STEP_0B_PREFLIGHT']);
});

test('scaffold: a lazy step body is reachable end to end (Action text from the real package)', () => {
  const step = findStep(scaffoldPlan, 'STEP_2_DAG');
  const action = step?.children?.find((c) => c.label === '<Action>');
  assert.ok((action?.detail?.length ?? 0) > 0, 'Action has real content from the package file');
});

// --- phase-execution-protocol.directive.xml (<PhaseProcedure> — the OTHER step-bearing tag,
// previously unhandled at all: no dedicated parser, bullet list survived only as flat prose) ---

const phaseProtocol = loadDirective('ai/directives/sdd-v2/phase-execution-protocol.directive.xml');
const phaseProcedure = phaseProtocol.children?.find((c) => c.label === '<PhaseProcedure>');

test('phase-execution-protocol: <PhaseProcedure> gets a dedicated step list, not flattened prose', () => {
  assert.ok(phaseProcedure, '<PhaseProcedure> section present');
  const ids = (phaseProcedure?.children ?? []).map((c) => c.attrs?.id);
  assert.ok(ids.length > 0, 'step list must not be empty');
  assert.equal(ids.length, stepFilesOf('phase-execution-protocol').length);
  // alphabetically STEP_1B_RESUME_OR_START sorts BEFORE STEP_1_GET_PHASE_CONTEXT ('B' < '_'); the
  // real skeleton list puts STEP_1_GET_PHASE_CONTEXT first.
  assert.deepEqual(ids.slice(0, 2), ['STEP_1_GET_PHASE_CONTEXT', 'STEP_1B_RESUME_OR_START']);
});

test('phase-execution-protocol: a step body resolves from its package, including a package-only <Contract>', () => {
  const step = findStep(phaseProcedure, 'STEP_5_VERIFY');
  assert.ok(step, 'STEP_5_VERIFY present');
  const contract = step?.children?.find((c) => c.label === 'BLOCKER_FORMAT');
  assert.ok(contract, 'BLOCKER_FORMAT contract surfaced from the package, otherwise invisible');
});

// --- graceful degradation: no `read` injected, or the package file is missing ---
// Honest failure, never a silent empty tree and never a thrown exception.

test('lazy step list without an injected reader marks every step honestly unread, instead of throwing or going blind', () => {
  const auditNoRead = loadDirectiveWithReader(
    'ai/directives/sdd-v2/audit.directive.xml',
    undefined
  );
  const plan = auditNoRead.children?.find((c) => c.label === '<ExecutionPlan>');
  const ids = (plan?.children ?? []).map((c) => c.attrs?.id);
  assert.deepEqual(
    ids,
    ['STEP_1_MECHANICAL', 'STEP_2_SEMANTIC', 'STEP_3_ROUTE'],
    'ids still known from the skeleton bullet list'
  );
  for (const step of plan?.children ?? []) {
    assert.match(step.note ?? '', /не прочитан/, 'honest note, not a silent empty step');
    assert.ok(
      step.children?.some((c) => c.kind === 'unparsed'),
      'unparsed marker child, not a crash and not empty'
    );
  }
});

function loadDirectiveWithReader(relPath: string, reader: FileReader | undefined): TraceNode {
  const xml = readFileSync(join(repoRoot, relPath), 'utf8');
  return parseDirective(relPath, xml, reader);
}

// --- regression guard: existing monolith directives (no manifest override) must be unaffected ---

test('a directive with no assembly-manifest override still parses <Step> blocks straight from the skeleton (monolith, unchanged)', () => {
  const execute = loadDirective('ai/directives/sdd-v2/execute.directive.xml');
  const ep = execute.children?.find((c) => c.label === '<ExecutionPlan>');
  assert.equal(
    ep?.children?.length,
    11,
    'unchanged from the existing monolith test in parse-directive.test.ts'
  );
  assert.equal(ep?.children?.[0]?.attrs?.id, 'STEP_0_RESOLVE');
});
