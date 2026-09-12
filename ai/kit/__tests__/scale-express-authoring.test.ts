// @file: V14-1 — scale/EXPRESS reaches scope/module authoring. Verifies scope.directive.xml and
//   module.directive.xml both declare AX_SCALE_PROPORTIONAL_DEPTH and carry an EXPRESS branch that
//   skips the full interview at SCALE=fix|function, while every mechanical Approval Check
//   (draft/module receipt check, then the authoring-complete close) still runs outside that branch —
//   no gate, axiom, or Approval Check is removed by taking the fast path (#14 proposal 1,
//   _raw/V14-PROPOSALS-TRIAGE.md:43-46).
// @consumers: node:test runner
// @tasks: V14-1

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_ROOT } from '../render.ts';

const SDD_V2 = join(OUT_ROOT, 'sdd-v2');

function read(file: string): string {
  return readFileSync(join(SDD_V2, file), 'utf8');
}

/** Index right after the (first) `</LogicSwitch>` close tag, or -1 if none. */
function afterLogicSwitch(text: string): number {
  const m = text.match(/<\/LogicSwitch>/);
  return m ? (m.index as number) + m[0].length : -1;
}

describe('scale/EXPRESS reaches scope authoring (V14-1)', () => {
  const scope = read('scope.directive.xml');

  it('declares AX_SCALE_PROPORTIONAL_DEPTH as an inherited dep', () => {
    const depsMatch = scope.match(/<BeliefState\s+deps="([^"]*)"/);
    assert.ok(depsMatch, 'scope.directive.xml has no BeliefState deps attribute');
    const deps = (depsMatch![1] as string).split(',').map((s) => s.trim());
    assert.ok(deps.includes('AX_SCALE_PROPORTIONAL_DEPTH'), `deps: ${deps.join(', ')}`);
  });

  it('carries an EXPRESS branch that skips the full interview at SCALE=fix|function', () => {
    assert.match(scope, /SCALE is `fix` or `function`/);
    assert.match(scope, /EXPRESS:\s*skip\s+interview-protocol, rule-registry, and research-gate/);
    // The brief-completeness condition from STEP_1_ORIENT's pre-existing autonomous rule must still
    // gate the EXPRESS branch, not be replaced by it.
    assert.match(scope, /brief that already\s+names the consumer, happy path/);
  });

  it('keeps every Approval Check outside the EXPRESS branch: STEP_3_CHECK and STEP_4_CLOSE still run as their own Steps, not folded into the LogicSwitch', () => {
    const switchEnd = afterLogicSwitch(scope);
    assert.ok(switchEnd >= 0, 'no LogicSwitch found in scope.directive.xml');
    const step3At = scope.indexOf('<Step id="STEP_3_CHECK">');
    const step4At = scope.indexOf('<Step id="STEP_4_CLOSE">');
    assert.ok(step3At > switchEnd, 'STEP_3_CHECK must be a Step sibling after the LogicSwitch closes, not inside it');
    assert.ok(step4At > step3At, 'STEP_4_CLOSE must follow STEP_3_CHECK');
    assert.match(scope, /result="draftReceipt"/);
    assert.match(scope, /sdd-log &lt;scope-spec-path&gt; authoring-complete/);
  });
});

describe('scale/EXPRESS reaches module authoring (V14-1)', () => {
  const module_ = read('module.directive.xml');

  it('declares AX_SCALE_PROPORTIONAL_DEPTH as an inherited dep', () => {
    const depsMatch = module_.match(/<BeliefState\s+deps="([^"]*)"/);
    assert.ok(depsMatch, 'module.directive.xml has no BeliefState deps attribute');
    const deps = (depsMatch![1] as string).split(',').map((s) => s.trim());
    assert.ok(deps.includes('AX_SCALE_PROPORTIONAL_DEPTH'), `deps: ${deps.join(', ')}`);
  });

  it('carries an EXPRESS branch that skips interview/research/registry at SCALE=fix|function', () => {
    assert.match(module_, /SCALE is `fix` or `function`/);
    assert.match(module_, /EXPRESS:\s*\n?\s*skip interview, research, and registry protocols entirely/);
  });

  it('keeps every Approval Check outside the EXPRESS branch: STEP_4_CHECK and STEP_5_CLOSE still run as their own Steps, not folded into the LogicSwitch', () => {
    const switchEnd = afterLogicSwitch(module_);
    assert.ok(switchEnd >= 0, 'no LogicSwitch found in module.directive.xml');
    const step4At = module_.indexOf('<Step id="STEP_4_CHECK">');
    const step5At = module_.indexOf('<Step id="STEP_5_CLOSE">');
    assert.ok(step4At > switchEnd, 'STEP_4_CHECK must be a Step sibling after the LogicSwitch closes, not inside it');
    assert.ok(step5At > step4At, 'STEP_5_CLOSE must follow STEP_4_CHECK');
    assert.match(module_, /result="moduleReceipt"/);
    assert.match(module_, /sdd-log &lt;module-spec-path&gt; authoring-complete/);
  });
});

describe('grep-lockable proof (V14-1 acceptance command)', () => {
  it('AX_SCALE_PROPORTIONAL_DEPTH occurs at least once in each of scope.directive.xml and module.directive.xml', () => {
    const scope = read('scope.directive.xml');
    const module_ = read('module.directive.xml');
    assert.ok((scope.match(/AX_SCALE_PROPORTIONAL_DEPTH/g) ?? []).length >= 1);
    assert.ok((module_.match(/AX_SCALE_PROPORTIONAL_DEPTH/g) ?? []).length >= 1);
  });
});
