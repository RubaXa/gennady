// @file: E-02 — every canonical scenario declares an objective completion bar (completion or acceptance).
// @consumers: ai/flow-eval/scenarios.json
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SddEvalScenario } from '../types.ts';

const scenariosPath = fileURLToPath(new URL('../scenarios.json', import.meta.url));
const scenarios = JSON.parse(readFileSync(scenariosPath, 'utf8')) as SddEvalScenario[];

/** @purpose True when `acceptance` carries an actual non-empty signal, not just an empty string. */
function hasAcceptance(scenario: SddEvalScenario): boolean {
  return typeof scenario.acceptance === 'string' && scenario.acceptance.trim().length > 0;
}

/** @purpose True when `completion` names all three R-COMPLETE targets (partial declarations are a bug). */
function hasCompletion(scenario: SddEvalScenario): boolean {
  const c = scenario.completion;
  return !!c && !!c.artifact?.trim() && !!c.ticket?.trim() && !!c.spec?.trim();
}

describe('scenarios.json declares completion/acceptance for every scenario (E-02)', () => {
  it('the canonical suite is non-empty', () => {
    assert.ok(scenarios.length > 0);
  });

  // No scenario in the canonical suite currently needs a third "not required" exemption path — every
  // one of them has a real acceptance signal or a real R-COMPLETE completion target. If a future
  // scenario genuinely needs neither, extend SddEvalScenario with that escape hatch THEN (YAGNI: an
  // unused field is worse than no field — a reviewer trusts a schema less once it has stopped meaning
  // anything is actually declared).
  for (const scenario of scenarios) {
    it(`${scenario.id}: declares acceptance or R-COMPLETE completion`, () => {
      assert.ok(
        hasAcceptance(scenario) || hasCompletion(scenario),
        `scenario ${scenario.id} declares NEITHER completion NOR acceptance — every scenario must ` +
          'carry an objective completion bar'
      );
    });
  }

  it('a declared `completion` always names all three targets (never a partial R-COMPLETE)', () => {
    for (const scenario of scenarios) {
      if (scenario.completion === undefined) continue;
      assert.ok(
        hasCompletion(scenario),
        `scenario ${scenario.id} declares a partial completion object — artifact/ticket/spec are all required`
      );
    }
  });

  // The execute phase is exactly the case R-COMPLETE exists for (an execute scenario can build its
  // artifact and still abandon the ticket before a real DONE — quality-gate.ts's own @purpose docs
  // this as "the abandoned-artifact blind spot"). Pin the one execute scenario in the canonical suite
  // to a concrete regression: it must actually declare completion, not merely be schema-valid via
  // acceptance/exemption, or the mechanical bar this rule exists for goes unexercised by the suite.
  it('the execute-phase scenario(s) declare R-COMPLETE completion targets, not just acceptance', () => {
    const executeScenarios = scenarios.filter((scenario) => scenario.phase === 'execute');
    assert.ok(executeScenarios.length > 0, 'expected at least one execute-phase scenario');
    for (const scenario of executeScenarios) {
      assert.ok(
        hasCompletion(scenario),
        `execute scenario ${scenario.id} must declare completion (artifact/ticket/spec) so R-COMPLETE ` +
          'actually runs against it — the abandoned-artifact blind spot otherwise goes unchecked'
      );
    }
  });

  it('slugify-toolchain names the exact fixture paths R-COMPLETE reads from disk', () => {
    const slugify = scenarios.find((scenario) => scenario.id === 'slugify-toolchain');
    assert.ok(slugify, 'slugify-toolchain scenario must exist in the canonical suite');
    assert.deepEqual(slugify?.completion, {
      artifact: 'src/slugify.ts',
      ticket: 'specs/slugify/core/core.task.SLG-slug.md',
      spec: 'specs/slugify/core/core.spec.md',
    });
  });
});
