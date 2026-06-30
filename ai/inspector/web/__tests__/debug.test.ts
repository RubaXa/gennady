// @file: ai/inspector — deterministic debugger-flow scenarios over the REAL /sdd skill + directives.
// The inspector is a deterministic replay machine: same skill + same moves => same log/stack. These
// tests pin the exact scenarios we walk through by hand (auto-enter at EMBODY, LOGIC_SWITCH branch,
// step-into descent, DEFAULT proceed) so the flow can't silently regress.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSkill } from '../../core/parse-skill.ts';
import { resolveTree, type DirectiveReader } from '../../core/resolve.ts';
// the module under test — the pure, DOM-free debugger model the UI draws from
import { simulate, unitsOf, mainDirective, transitionsFor, base } from '../debug.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const read: DirectiveReader = (ref) => {
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

test('/sdd skill exposes the GATHER / EMBODY / ROUTE loader steps and embodies the router', () => {
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

test('scenario: advancing past GATHER auto-enters the router at EMBODY (stack /sdd › <SddRouter>)', () => {
  const sdd = loadSkill('sdd');
  // GATHER just loads; the loader BECOMES the router at EMBODY — one "next" reaches EMBODY and auto-descends
  const sim = simulate(sdd, [{ type: 'next' }]);
  assert.deepEqual(stackLabels(sim), ['/sdd', '<SddRouter>']);
  // the descent is announced in the log and the loaded directive is attached for inspection
  assert.ok(divs(sim).some((d: string) => d.startsWith('загружен скил /sdd')));
  assert.ok(divs(sim).some((d: string) => d.includes('<SddRouter>') && d.includes('router.directive.xml')));
  const loaded = sim.log.find((e: any) => e.dir && e.dir.label === '<SddRouter>');
  assert.ok(loaded, 'router node carried on the entry divider for the collapsed inspect block');
});

test('scenario: at STEP_0_STATE the LOGIC_SWITCH offers migration / readiness / DEFAULT branches', () => {
  const sdd = loadSkill('sdd');
  const sim = simulate(sdd, [{ type: 'next' }]);
  assert.ok(sim.current, 'a current unit is active');
  assert.equal(sim.current.unit.attrs?.id, 'STEP_0_STATE');
  const trans = sim.current.transitions;
  assert.ok(
    trans.every((t: any) => t.type === 'branch'),
    'preflight switch yields branch choices, not a linear next'
  );
  const labels = trans.map((t: any) => t.label).join(' | ');
  assert.match(labels, /FLOW_VERSION=v1/); // → migration branch
  assert.match(labels, /READINESS=not-ready/); // → readiness branch
  assert.match(labels, /DEFAULT/);
  // the conditional branches carry the directive they would load
  const migBranch = trans.find((t: any) => t.run && /migration-v1-v2/.test(t.run.ref));
  assert.ok(migBranch, 'FLOW_VERSION=v1 branch loads migration-v1-v2.directive.xml');
});

test('scenario: taking the FLOW_VERSION=v1 branch descends into the migration directive (3-level stack)', () => {
  const sdd = loadSkill('sdd');
  const sim = simulate(sdd, [{ type: 'next' }]);
  const migIdx = sim.current.transitions.findIndex(
    (t: any) => t.run && /migration-v1-v2/.test(t.run.ref)
  );
  assert.ok(migIdx >= 0, 'migration branch present');
  const after = simulate(sdd, [{ type: 'next' }, { type: 'branch', i: migIdx }]);
  assert.deepEqual(stackLabels(after), ['/sdd', '<SddRouter>', '<SddMigrationV1V2>']);
  assert.ok(divs(after).some((d: string) => d.startsWith('ветка → загружена <SddMigrationV1V2>')));
  // indentation is driven by stack depth: deeper frames carry larger depth on their log entries
  const migDiv = after.log.find((e: any) => e.div && e.div.includes('<SddMigrationV1V2>'));
  assert.equal(migDiv.depth, 2, 'migration entry sits at depth 2 (shifted two levels in)');
});

test('scenario: the DEFAULT branch proceeds inside the router (no descent) to the next step', () => {
  const sdd = loadSkill('sdd');
  const sim = simulate(sdd, [{ type: 'next' }]);
  const defIdx = sim.current.transitions.findIndex((t: any) => /DEFAULT/.test(t.label));
  const after = simulate(sdd, [{ type: 'next' }, { type: 'branch', i: defIdx }]);
  // DEFAULT has no directive to load → we stay in the router frame and advance past STEP_0_STATE
  assert.deepEqual(stackLabels(after), ['/sdd', '<SddRouter>']);
  assert.notEqual(after.current?.unit.attrs?.id, 'STEP_0_STATE', 'advanced beyond the preflight');
});

test('determinism: identical moves reproduce an identical log', () => {
  const sdd = loadSkill('sdd');
  const a = simulate(sdd, [{ type: 'next' }, { type: 'branch', i: 0 }]);
  const b = simulate(sdd, [{ type: 'next' }, { type: 'branch', i: 0 }]);
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
