// @file: Guards the FLOW_VERSION/READINESS preflight gate against the exact regression an audit
// found: the router's qualifier ("AND the request needs a missing gate script") and the
// queue-exception branch got lost when 4 SKILL.md files hand-copied the interpretation. The fix —
// a single shared partial (ai/kit/contract/process/readiness-preflight-gate.xml) embedded in the
// router + the 4 worker directives, with the 4 SKILL.md loaders thinned to defer to it — must not
// regress: (a) every generated directive still carries the partial's text; (b) no SKILL.md
// re-derives the READINESS interpretation by hand.
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
  const packagePaths = [...skeletonText.matchAll(/Full step text: `([^`]+)`/g)].map((m) => m[1]!);
  const packageTexts = packagePaths.map((p) => readFileSync(join(PROJECT_ROOT, p), 'utf-8'));
  return [skeletonText, ...packageTexts].join('\n');
}

/** Marker phrase unique to the shared partial — proves the generated directive embeds it, not a hand-typed paraphrase. */
const PARTIAL_MARKER = 'already being built by TODO tickets in the queue';

const GATED_DIRECTIVES = [
  'router.directive.xml',
  'execute.directive.xml',
  'scaffold.directive.xml',
  'critic.directive.xml',
  'reconcile.directive.xml',
];

const GATED_SKILLS = ['sdd-execute', 'sdd-scaffold', 'sdd-critic', 'sdd-reconcile'];

describe('readiness preflight gate — single source, no hand-copied interpretation', () => {
  for (const file of GATED_DIRECTIVES) {
    it(`${file}: embeds the shared readiness-preflight-gate partial`, () => {
      const text = readFullDirectiveText(file);
      assert.ok(
        text.includes(PARTIAL_MARKER),
        `${file} is missing the shared preflight-gate partial text (${PARTIAL_MARKER})`
      );
    });
  }

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
});
