// @file: ai/inspector — deterministic debugger-flow scenarios over the REAL /sdd skill + directives.
// The inspector is a deterministic replay machine: same skill + same moves => same log/stack. These
// tests pin the exact scenarios we walk through by hand (auto-enter at EMBODY, LOGIC_SWITCH branch,
// step-into descent, DEFAULT proceed) so the flow can't silently regress.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSkill } from '../../core/parse-skill.ts';
import { resolveTree, type DirectiveReader } from '../../core/resolve.ts';
// the module under test — the pure, DOM-free debugger model the UI draws from
import { simulate, unitsOf, mainDirective, transitionsFor, readsOf, base } from '../debug.js';
import { buildDirectiveTreeFixture } from '../../__tests__/directive-tree-fixture.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const fixture = buildDirectiveTreeFixture(repoRoot);
after(() => fixture.cleanup());
const read: DirectiveReader = (ref) => {
  if (ref.startsWith('ai/directives/')) return fixture.read(ref);
  const p = resolve(repoRoot, ref);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

/** Parse + resolve a skill exactly as generate.ts does, so tests run against the real tree. */
function loadSkill(name: string) {
  const rel = `ai/skills/${name}/SKILL.md`;
  const tree = parseSkill(rel, readFileSync(join(repoRoot, rel), 'utf8'));
  resolveTree(tree, read);
  return tree;
}

const stackLabels = (sim: ReturnType<typeof simulate>) => sim.stack.map((f: any) => f.node.label);
const divs = (sim: ReturnType<typeof simulate>) =>
  sim.log.filter((e: any) => e.div).map((e: any) => e.div);

/** Drive the debugger deterministically: prefer a transition matching `prefer`, else DEFAULT, else advance —
 *  until `stop(sim)` is true or moves run dry. Returns { sim, moves } so the caller can extend the path. */
function driveUntil(skill: any, stop: (sim: any) => boolean, prefer: RegExp[] = [], maxSteps = 40) {
  const moves: any[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const sim = simulate(skill, moves);
    if (!sim.current || stop(sim)) return { sim, moves };
    const trans = sim.current.transitions;
    const picked =
      prefer.map((re) => trans.find((t: any) => re.test(t.run?.ref ?? t.label))).find(Boolean) ??
      trans.find((t: any) => /DEFAULT/.test(t.label)) ??
      trans.find((t: any) => t.type === 'next') ??
      trans[0];
    moves.push({ type: picked.type, i: picked.i });
  }
  return { sim: simulate(skill, moves), moves };
}

test('regression: a formats/*.xml contract reference (not *.directive.xml) is offered as step-into', () => {
  // STEP_4_PORTAL_WRITE's Action reads `READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/formats/portal-structure.xml")`.
  // formats/*.xml files are NOT *.directive.xml — the scanner used to miss them entirely, so this step
  // silently advanced past the reference instead of offering a descent. Pin the fix at both layers:
  // the ref is scanned as a 'run' node, resolved into a <Contract> leaf carrying its markdown body, and
  // offered as a real 'into' transition from the step.
  const sdd = loadSkill('sdd');
  const { sim, moves } = driveUntil(
    sdd,
    (s) => s.current.unit.attrs?.id === 'STEP_4_PORTAL_WRITE',
    [/root\.directive\.xml/]
  );
  assert.equal(sim.current.unit.attrs?.id, 'STEP_4_PORTAL_WRITE');

  const into = sim.current.transitions.find(
    (t: any) => t.run && /portal-structure\.xml/.test(t.run.ref)
  );
  assert.ok(into, 'portal-structure.xml is offered as a step-into transition');

  const after = simulate(sdd, [...moves, { type: into.type, i: into.i }]);
  const loaded = after.log.find((e: any) => e.dir && e.dir.label === '<Contract>');
  assert.ok(loaded, 'entering the ref attaches the resolved <Contract> node for inspection');
  assert.match(
    loaded.dir.detail ?? '',
    /Vision/,
    'the contract carries its markdown template body, not an empty leaf'
  );
  // the contract has no <ExecutionPlan> (it is a format, not a directive with steps) — auto-unwind cascades
  assert.ok(after.done, 'flow completes after the content-only contract immediately unwinds');
});

test('/sdd skill exposes the stateless GATHER / EMBODY / ROUTE loader steps and embodies the router', () => {
  const sdd = loadSkill('sdd');
  const units = unitsOf(sdd);
  const ids = units.map((u: any) => u.attrs?.id);
  assert.ok(ids.includes('GATHER'), 'has GATHER');
  assert.ok(ids.includes('EMBODY'), 'has EMBODY');
  const main = mainDirective(sdd);
  assert.ok(main, 'embodies a main directive');
  assert.equal(base(main.run.ref), 'router.directive.xml');
  assert.equal(main.dir.label, '<SddRouter>');
});

test('a lazy directive step carries the package READ_AND_USE into the debugger model', () => {
  const scaffold = loadSkill('sdd-scaffold');
  const main = mainDirective(scaffold);
  assert.ok(main, 'the public scaffold skill resolves its single router entry');
  assert.equal(
    main.run.ref,
    'ai/directives/sdd-v2/router.directive.xml',
    'public intent skills enter through the stateless router'
  );

  const { sim } = driveUntil(scaffold, (s) => s.current?.unit.attrs?.id === 'STEP_2_MATERIALIZE', [
    /scaffold\.directive\.xml/,
  ]);
  assert.equal(
    sim.current?.unit.attrs?.id,
    'STEP_2_MATERIALIZE',
    'the router scaffold route reaches the lazy ticket materialization step'
  );
  assert.deepEqual(
    stackLabels(sim),
    ['/sdd-scaffold', '<SddRouter>', '<SddScaffold>'],
    'the debugger preserves the public skill → router → owner path'
  );
  const reads = readsOf(sim.current.unit);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].ref, 'ai/directives/sdd-v2/scaffold/steps/STEP_2_MATERIALIZE.xml');
});

test('scenario: advancing past GATHER auto-enters the router at EMBODY (stack /sdd › <SddRouter>)', () => {
  const sdd = loadSkill('sdd');
  // GATHER just loads; the loader BECOMES the router at EMBODY — one "next" reaches EMBODY and auto-descends
  const sim = simulate(sdd, [{ type: 'next' }]);
  assert.deepEqual(stackLabels(sim), ['/sdd', '<SddRouter>']);
  // the descent is announced in the log and the loaded directive is attached for inspection
  assert.ok(divs(sim).some((d: string) => d.startsWith('загружен скил /sdd')));
  assert.ok(
    divs(sim).some((d: string) => d.includes('<SddRouter>') && d.includes('router.directive.xml'))
  );
  const loaded = sim.log.find((e: any) => e.dir && e.dir.label === '<SddRouter>');
  assert.ok(loaded, 'router node carried on the entry divider for the collapsed inspect block');
});

test('scenario: STEP_2_ROUTE exposes the exact current stateless owner routes', () => {
  const sdd = loadSkill('sdd');
  const { sim } = driveUntil(sdd, (state) => state.current?.unit.attrs?.id === 'STEP_2_ROUTE');
  assert.ok(sim.current, 'a current unit is active');
  assert.equal(sim.current.unit.attrs?.id, 'STEP_2_ROUTE');
  const trans = sim.current.transitions;
  assert.ok(
    trans.every((t: any) => t.type === 'branch'),
    'the current LOGIC_SWITCH yields conditional branches, not flattened directive links'
  );
  assert.equal(trans.at(-1)?.label, 'DEFAULT');
  assert.deepEqual(
    trans.slice(0, -1).map((t: any) => base(t.run?.ref)),
    [
      'migration-v1-v2.directive.xml',
      'scaffold.directive.xml',
      'execute.directive.xml',
      'critic.directive.xml',
      'reconcile.directive.xml',
      'root.directive.xml',
      'discover-from-code.directive.xml',
      'module.directive.xml',
      'infra.directive.xml',
      'interface.directive.xml',
      'scope.directive.xml',
    ]
  );
});

test('scenario: taking the explicit V1→V2 branch descends into the migration directive', () => {
  const sdd = loadSkill('sdd');
  const { sim, moves } = driveUntil(
    sdd,
    (state) => state.current?.unit.attrs?.id === 'STEP_2_ROUTE'
  );
  const migIdx = sim.current.transitions.findIndex(
    (t: any) => t.run && /migration-v1-v2/.test(t.run.ref)
  );
  assert.ok(migIdx >= 0, 'the sole V1→V2 migration route is present');
  const after = simulate(sdd, [...moves, { type: 'branch', i: migIdx }]);
  assert.deepEqual(stackLabels(after), ['/sdd', '<SddRouter>', '<SddMigrationV1V2>']);
  assert.ok(divs(after).some((d: string) => d.startsWith('ветка → загружена <SddMigrationV1V2>')));
  // indentation is driven by stack depth: deeper frames carry larger depth on their log entries
  const migDiv = after.log.find((e: any) => e.div && e.div.includes('<SddMigrationV1V2>'));
  assert.equal(migDiv.depth, 2, 'migration entry sits at depth 2 (shifted two levels in)');
});

test('scenario: taking the scaffold branch descends through the stateless router', () => {
  const sdd = loadSkill('sdd');
  const { sim, moves } = driveUntil(
    sdd,
    (state) => state.current?.unit.attrs?.id === 'STEP_2_ROUTE'
  );
  const scaffold = sim.current.transitions.findIndex(
    (t: any) => t.run && /scaffold\.directive\.xml/.test(t.run.ref)
  );
  assert.ok(scaffold >= 0, 'scaffold route present');
  const after = simulate(sdd, [...moves, { type: 'branch', i: scaffold }]);
  assert.deepEqual(stackLabels(after), ['/sdd', '<SddRouter>', '<SddScaffold>']);
  assert.equal(after.current?.unit.attrs?.id, 'STEP_0_PREFLIGHT');
});

test('determinism: identical moves reproduce an identical log', () => {
  const sdd = loadSkill('sdd');
  const { sim, moves } = driveUntil(
    sdd,
    (state) => state.current?.unit.attrs?.id === 'STEP_2_ROUTE'
  );
  const migration = sim.current.transitions.findIndex(
    (transition: any) => transition.run && /migration-v1-v2/.test(transition.run.ref)
  );
  assert.ok(migration >= 0, 'migration branch present');
  const a = simulate(sdd, [...moves, { type: 'branch', i: migration }]);
  const b = simulate(sdd, [...moves, { type: 'branch', i: migration }]);
  assert.deepEqual(
    a.log.map((e: any) => [e.div ?? null, e.step?.label ?? null, e.depth]),
    b.log.map((e: any) => [e.div ?? null, e.step?.label ?? null, e.depth])
  );
});

test('the embodied router is auto-entered, so it is NOT offered as a manual step-into on loader steps', () => {
  const sdd = loadSkill('sdd');
  const frame = { node: sdd } as any;
  const gather = unitsOf(sdd).find((u: any) => u.attrs?.id === 'GATHER');
  const trans = transitionsFor(frame, gather);
  assert.ok(
    !trans.some((t: any) => t.type === 'into' && base(t.label) === 'router.directive.xml'),
    'router is not a manual step-into (it auto-enters at EMBODY)'
  );
});
