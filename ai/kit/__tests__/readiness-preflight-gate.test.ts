// @file: Guards the FLOW_VERSION/READINESS preflight gate against the exact regression an audit
// found: the router's qualifier ("AND the request needs a missing gate script") and the
// queue-exception branch got lost when 4 SKILL.md files hand-copied the interpretation. The fix —
// a single shared partial (ai/kit/contract/process/readiness-preflight-gate.xml) declared by each
// directive that activates it. At runtime the router is the single owner: public skills enter the
// router, then delta assembly removes the duplicate bytes from execute / critic and leaves an
// explicit inherited-contract receipt. This must not regress: (a) source templates still declare
// the contract at the activating step; (b) generated output contains one runtime owner plus typed
// inherited consumers, not hand-copied duplicates; (c) no SKILL.md bypasses or re-derives it.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_ROOT } from '../render.ts';
import { resolveAssemblyMode } from '../lazy-assembly.ts';

const SDD_V2 = join(OUT_ROOT, 'sdd-v2');
const SKILLS_ROOT = join(OUT_ROOT, '..', 'skills');
const CONTRACTS_ROOT = join(OUT_ROOT, '..', 'kit', 'contract', 'process');
const TEMPLATES_ROOT = join(OUT_ROOT, '..', 'kit', 'templates', 'sdd-v2');
// ai/directives -> <repo root> — project-root-relative package paths (DA-REQ-4) resolve off this.
const PROJECT_ROOT = join(OUT_ROOT, '..', '..');

/**
 * Full text a search over this directive must cover. A directive resolved `lazy` (manifest
 * override) writes only a slim skeleton at its normal path — the shared partial's text can live
 * inside one of its step packages instead of the skeleton itself (ai/kit/lazy-assembly.ts), so the
 * search must span skeleton + every package the skeleton's step list prints, not the skeleton
 * alone.
 */
function readFullDirectiveText(file: string): string {
  const skeletonText = readFileSync(join(SDD_V2, file), 'utf-8');
  if (resolveAssemblyMode(`sdd-v2/${file}`) !== 'lazy') return skeletonText;
  const packagePaths = [
    ...skeletonText.matchAll(/Before executing this step, READ_AND_USE_DIRECTIVE\("([^"]+)"\)\./g),
  ].map((m) => m[1]!);
  const packageTexts = packagePaths.map((p) => readFileSync(join(PROJECT_ROOT, p), 'utf-8'));
  return [skeletonText, ...packageTexts].join('\n');
}

/** Marker phrase unique to the shared partial — proves the generated directive embeds it, not a hand-typed paraphrase. */
const PARTIAL_MARKER = 'preflight input reports `GATE_QUEUE=<Task-ID,...>`';

const ROUTER_OWNED_CONSUMERS = ['execute.directive.xml', 'critic.directive.xml'];

const GATED_SKILLS = ['sdd-execute', 'sdd-scaffold', 'sdd-critic', 'sdd-reconcile'];

describe('readiness preflight gate — single source, no hand-copied interpretation', () => {
  it('router is the single generated owner of the shared readiness-preflight gate', () => {
    const contract = readFileSync(join(CONTRACTS_ROOT, 'readiness-preflight-gate.xml'), 'utf-8');
    assert.ok(contract.includes(PARTIAL_MARKER), 'the marker must originate in the shared contract');

    const routerSource = readFileSync(join(TEMPLATES_ROOT, 'router.directive.hbs'), 'utf-8');
    assert.match(routerSource, /\{\{>\s*"contract\/process\/readiness-preflight-gate"\s*\}\}/);

    const router = readFullDirectiveText('router.directive.xml');
    assert.equal(
      router.split(PARTIAL_MARKER).length - 1,
      1,
      'router must carry the shared gate exactly once at the public runtime boundary'
    );
  });

  for (const file of ROUTER_OWNED_CONSUMERS) {
    it(`${file}: declares the gate in source and consumes the router-owned runtime copy`, () => {
      const source = readFileSync(join(TEMPLATES_ROOT, file.replace(/\.xml$/, '.hbs')), 'utf-8');
      assert.match(source, /\{\{>\s*"contract\/process\/readiness-preflight-gate"\s*\}\}/);

      const built = readFullDirectiveText(file);
      assert.match(
        built,
        /Inherited from the loading directive \(already in context\):[^\n]*readiness-preflight-gate/,
        `${file} must retain an explicit receipt for the delta-elided gate`
      );
      assert.ok(
        !built.includes(PARTIAL_MARKER),
        `${file} duplicates the router-owned preflight gate instead of consuming it from context`
      );
    });
  }

  for (const skill of ['sdd-execute', 'sdd-critic']) {
    it(`${skill}/SKILL.md: enters the router instead of loading its owner directive directly`, () => {
      const text = readFileSync(join(SKILLS_ROOT, skill, 'SKILL.md'), 'utf-8');
      assert.match(text, /ai\/directives\/sdd-v2\/router\.directive\.xml/);
      assert.doesNotMatch(text, new RegExp(`ai/directives/sdd-v2/${skill.slice(4)}\\.directive\\.xml`));
    });
  }

  it('keeps scaffold and reconcile preflight free of the no-id sdd-task execution map', () => {
    const execute = readFullDirectiveText('execute.directive.xml');
    assert.match(execute, /sdd-task` \(no id\)/);

    for (const file of ['scaffold.directive.xml', 'reconcile.directive.xml']) {
      const text = readFullDirectiveText(file);
      assert.doesNotMatch(text, /run\s+`?sdd-task`? \(no Task-ID\)/i, `${file} invokes the task map before task lifecycle`);
    }
  });

  it('keeps router and critic preflight outside task lifecycle', () => {
    for (const file of ['router.directive.xml', 'critic.directive.xml']) {
      const text = readFullDirectiveText(file);
      assert.doesNotMatch(text, /run\s+`sdd-task` \(no Task-ID\)/i);
    }
  });

  for (const skill of GATED_SKILLS) {
    it(`${skill}/SKILL.md: does not re-derive the READINESS interpretation`, () => {
      const text = readFileSync(join(SKILLS_ROOT, skill, 'SKILL.md'), 'utf-8');
      assert.doesNotMatch(
        text,
        /not-ready/,
        'SKILL.md hand-derives a not-ready branch — interpretation belongs to the directive\'s own STEP_0B_PREFLIGHT'
      );
      assert.doesNotMatch(
        text,
        /readiness\.directive/,
        'SKILL.md names readiness.directive directly — loading it is the directive\'s own STEP_0B_PREFLIGHT call, not the loader\'s'
      );
    });
  }

  for (const file of ['scaffold.directive.xml', 'reconcile.directive.xml']) {
    it(`${file}: consumes the gathered sdd-state snapshot without an early sdd-task map`, () => {
      const text = readFullDirectiveText(file);
      assert.match(text, /snapshot already produced by\s+the skill's GATHER step/);
      assert.match(text, /do not call `sdd-state` or `sdd-task` again here/);
      assert.doesNotMatch(text, /When `READINESS=not-ready`, run\s+`sdd-task`/);
    });
  }
});
