// @file: Delta-assembly tests — graph classification, ctx fixpoint, and the actual reduction
// build-directives.ts's second pass applies to rendered sdd-v2 directives.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { createRenderer, walk, TEMPLATES, OUT_ROOT, KIT } from '../render.ts';
import {
  buildDeltaPlan,
  excludedPartialsFor,
  applyDelta,
  CLASS_3_DIRECTIVES,
  type PlanNodeInput,
} from '../delta-assembly.ts';
import { resolveAssemblyMode, stampFingerprint, LazyDirectiveAssembler } from '../lazy-assembly.ts';

const SKILLS_ROOT = join(KIT, '..', 'skills');
// ai/kit -> ai -> <repo root> — matches OUT_ROOT's own "ai/directives" shape one level up.
const PROJECT_ROOT = join(KIT, '..', '..');

interface Pass1Entry {
  rel: string; // e.g. "sdd-v2/router.directive.xml" (posix)
  hbsSource: string;
  renderedFull: string;
}

/** Pass-1 render of every sdd-v2 directive template — mirrors build-directives.ts's own first pass. */
function renderAllDirectives(): Pass1Entry[] {
  const { render } = createRenderer();
  const out: Pass1Entry[] = [];
  for (const t of walk(TEMPLATES, (p) => p.endsWith('.hbs'))) {
    const rel = relative(TEMPLATES, t).split(sep).join('/').replace(/\.hbs$/, '.xml');
    if (!rel.endsWith('.directive.xml')) continue;
    const hbsSource = readFileSync(t, 'utf8');
    out.push({ rel, hbsSource, renderedFull: render(hbsSource) });
  }
  return out;
}

function buildPlan() {
  const pass1 = renderAllDirectives();
  const nodes: PlanNodeInput[] = pass1.map((e) => ({
    id: 'ai/directives/' + e.rel,
    hbsSource: e.hbsSource,
    renderedFull: e.renderedFull,
  }));
  return { pass1, plan: buildDeltaPlan(nodes, SKILLS_ROOT) };
}

/** Render node `e` the same way build-directives.ts's pass 2 does. */
function deltaRenderOf(e: Pass1Entry, excluded: string[]): string {
  const rendered =
    excluded.length === 0
      ? e.renderedFull
      : createRenderer().render(applyDelta(e.hbsSource, excluded).source);
  return rendered.replace(/[ \t]+$/gm, '');
}

describe('delta-assembly — graph shape', () => {
  it('has no scaffold-to-reconcile V2 migration cycle', () => {
    const { pass1, plan } = buildPlan();
    assert.deepEqual([...plan.cyclic], [], `unexpected cycle among: ${[...plan.cyclic].join(', ')}`);

    const step = (source: string, id: string): string => {
      const match = new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`).exec(source);
      assert.ok(match, `${id} exists`);
      return match[1] as string;
    };
    const occurrences = (source: string, literal: string): number =>
      source.split(literal).length - 1;
    const scaffold = pass1.find((entry) => entry.rel === 'sdd-v2/scaffold.directive.xml')!
      .renderedFull;
    const reconcileRef =
      'READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/reconcile.directive.xml")';

    const scaffoldPreflight = step(scaffold, 'STEP_0_PREFLIGHT');
    assert.equal(occurrences(scaffold, reconcileRef), 0);
    assert.equal(occurrences(scaffoldPreflight, reconcileRef), 0);
    assert.match(scaffoldPreflight, /Do not create a migration path/);
  });

  it('no READ_AND_USE_DIRECTIVE edge targets a class-3 subagent world', () => {
    const { plan } = buildPlan();
    for (const class3Id of CLASS_3_DIRECTIVES) {
      const incoming = plan.graph.incoming.get(class3Id) ?? new Set();
      assert.equal(
        incoming.size,
        0,
        `${class3Id} has incoming READ_AND_USE_DIRECTIVE edge(s) from: ${[...incoming].join(', ')} — a subagent world must never be nested-loaded inside an already-running session`
      );
    }
  });

  it('class 1 matches direct SKILL.md entry points after stateful entries converge on router', () => {
    const { plan } = buildPlan();
    const expected = ['audit', 'code-review', 'router'].map(
      (n) => `ai/directives/sdd-v2/${n}.directive.xml`
    );
    assert.deepEqual([...plan.class1].sort(), expected.sort());
  });

  it('no {{> "name"}} partial include passes an argument — same path must mean identical content for ctx sharing to be valid', () => {
    const offenders: string[] = [];
    for (const t of walk(KIT, (p) => p.endsWith('.hbs') || p.endsWith('.xml'))) {
      const src = readFileSync(t, 'utf8');
      if (/\{\{>\s*"[^"]+"\s+\S/.test(src)) offenders.push(t);
    }
    assert.deepEqual(offenders, [], `parameterized partial include(s) found: ${offenders.join(', ')}`);
  });
});

describe('delta-assembly — class 1 / class 3 always render FULL', () => {
  it('every class-1/class-3/cyclic node has zero excluded partials', () => {
    const { plan } = buildPlan();
    for (const id of [...plan.class1, ...plan.class3, ...plan.cyclic]) {
      assert.deepEqual(excludedPartialsFor(plan, id), [], `${id} should never be deducted from`);
    }
  });

  it('router (class 1) keeps AX_OPERATOR_LANGUAGE verbatim and carries no Inherited line', () => {
    const { pass1 } = buildPlan();
    const router = pass1.find((e) => e.rel === 'sdd-v2/router.directive.xml')!;
    assert.match(router.renderedFull, /<Axiom id="AX_OPERATOR_LANGUAGE"/);
    assert.doesNotMatch(router.renderedFull, /Inherited from the loading directive/);
  });

  it('phase-execution-protocol and critic-protocol (class 3) carry no Inherited line', () => {
    const { pass1 } = buildPlan();
    for (const rel of ['sdd-v2/phase-execution-protocol.directive.xml', 'sdd-v2/critic-protocol.directive.xml']) {
      const node = pass1.find((e) => e.rel === rel)!;
      assert.doesNotMatch(node.renderedFull, /Inherited from the loading directive/);
    }
  });
});

describe('delta-assembly — class 2 actually deducts (migration-v1-v2 litmus case)', () => {
  it('migration-v1-v2 loses the ax-operator-language TEXT but keeps its id in the Inherited line; router keeps the full text', () => {
    const { plan, pass1 } = buildPlan();
    const migration = pass1.find((e) => e.rel === 'sdd-v2/migration-v1-v2.directive.xml')!;
    const id = 'ai/directives/sdd-v2/migration-v1-v2.directive.xml';
    const excluded = excludedPartialsFor(plan, id);
    assert.ok(
      excluded.includes('axiom/process/ax-operator-language'),
      `expected ax-operator-language among excluded: ${excluded.join(', ')}`
    );

    const { source, inheritedIds } = applyDelta(migration.hbsSource, excluded);
    const { render } = createRenderer();
    const deltaRendered = render(source);

    assert.ok(inheritedIds.includes('AX_OPERATOR_LANGUAGE'));
    assert.doesNotMatch(
      deltaRendered,
      /<Axiom id="AX_OPERATOR_LANGUAGE"/,
      'the full axiom body must be gone from the delta render'
    );
    assert.match(
      deltaRendered,
      /Inherited from the loading directive \(already in context\):[^\n]*AX_OPERATOR_LANGUAGE/
    );

    const router = pass1.find((e) => e.rel === 'sdd-v2/router.directive.xml')!;
    assert.match(
      router.renderedFull,
      /<Axiom id="AX_OPERATOR_LANGUAGE"/,
      'router (class 1) must still carry the full text'
    );
  });

  it('every class-2 node with a non-empty ctx overlap gets exactly one Inherited line, sorted and deduped', () => {
    const { plan, pass1 } = buildPlan();
    let sawAtLeastOne = false;
    for (const e of pass1) {
      const id = 'ai/directives/' + e.rel;
      const excluded = excludedPartialsFor(plan, id);
      if (excluded.length === 0) continue;
      sawAtLeastOne = true;
      const out = deltaRenderOf(e, excluded);
      const matches = [...out.matchAll(/Inherited from the loading directive \(already in context\): ([^\n]+)/g)];
      assert.equal(matches.length, 1, `${e.rel}: expected exactly one Inherited line`);
      const listed = (matches[0]![1] as string).split(', ');
      assert.deepEqual(listed, [...listed].sort(), `${e.rel}: Inherited ids must be sorted`);
      assert.equal(new Set(listed).size, listed.length, `${e.rel}: Inherited ids must be deduped`);
    }
    assert.ok(sawAtLeastOne, 'expected at least one class-2 node to actually deduct something');
  });
});

describe('delta-assembly — determinism', () => {
  it('re-running plan + delta render twice from the same templates is byte-identical', () => {
    const first = buildPlan();
    const second = buildPlan();
    for (const e of first.pass1) {
      const id = 'ai/directives/' + e.rel;
      const excludedA = excludedPartialsFor(first.plan, id);
      const eB = second.pass1.find((x) => x.rel === e.rel)!;
      const excludedB = excludedPartialsFor(second.plan, id);
      assert.deepEqual(excludedA, excludedB, `${e.rel}: excluded set differs across identical builds`);
      assert.equal(deltaRenderOf(e, excludedA), deltaRenderOf(eB, excludedB), `${e.rel}: non-deterministic build`);
    }
  });
});

describe('delta-assembly — generated ai/directives/sdd-v2 matches the plan', () => {
  it('every generated directive file equals the plan-driven render (build is not stale)', () => {
    const { plan, pass1 } = buildPlan();
    const fingerprint = stampFingerprint(
      (JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8')) as { version: string }).version
    );
    for (const e of pass1) {
      const id = 'ai/directives/' + e.rel;
      const excluded = excludedPartialsFor(plan, id);
      const expected = deltaRenderOf(e, excluded);

      // A directive resolved lazy (manifest override) writes only a slim skeleton at its normal
      // path plus one package per Step (ai/kit/lazy-assembly.ts) — the plan-driven reference for
      // "build is not stale" is the assembled skeleton+packages split of the same delta-reduced
      // `expected` text, not `expected` itself.
      if (resolveAssemblyMode(e.rel) === 'lazy') {
        const { skeleton, packages } = LazyDirectiveAssembler.assemble({
          directiveName: basename(e.rel, '.directive.xml'),
          sourceText: expected,
          fingerprint,
          loadTopology:
            basename(e.rel, '.directive.xml') === 'scaffold' ? 'chain' : 'index',
        });
        const actualSkeleton = readFileSync(join(OUT_ROOT, e.rel), 'utf8');
        assert.equal(
          actualSkeleton,
          skeleton.text.replace(/[ \t]+$/gm, ''),
          `${e.rel}: generated skeleton is stale — rerun ai/kit/build-directives.ts -- --assembly=lazy`
        );
        for (const pkg of packages) {
          const actualPackage = readFileSync(join(PROJECT_ROOT, pkg.relativePath), 'utf8');
          assert.equal(
            actualPackage,
            pkg.text.replace(/[ \t]+$/gm, ''),
            `${e.rel} (step ${pkg.stepId}): generated package is stale — rerun ai/kit/build-directives.ts -- --assembly=lazy`
          );
        }
        continue;
      }

      const actual = readFileSync(join(OUT_ROOT, e.rel), 'utf8');
      assert.equal(actual, expected, `${e.rel}: generated file is stale — rerun ai/kit/build-directives.ts`);
    }
  });
});
