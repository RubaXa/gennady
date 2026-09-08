// @file: Guards D3.4 (40-TRACK-DIRECTIVES-SKILLS.md §1.3) — v2's critic-protocol used to state the
//   INVERSE of v1's rule ("confusion → underspecification, not a question to ask" /
//   "uncertainty = underspecification"), instead of v1's three-way triage ("confusion alone never
//   proves the artifact is underspecified"; "only ARTIFACT_GAP may become a problem finding").
//   T-B6-23 restored the triage in AX_CONFUSION_BUG and connected it into critic-protocol.
// @consumers: node:test runner
// @tasks: T-B6-23

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_ROOT } from '../render.ts';

const criticProtocol = readFileSync(
  join(OUT_ROOT, 'sdd-v2', 'critic-protocol.directive.xml'),
  'utf8'
);

describe('critic-protocol: confusion alone does not prove underspecification (D3.4, T-B6-23)', () => {
  it('states confusion alone never proves underspecification', () => {
    assert.match(criticProtocol, /confusion alone NEVER proves the artifact is underspecified/i);
  });

  it('carries the three-way triage (ARTIFACT_GAP / CONTEXT_MISSING / NON_BLOCKING_QUESTION)', () => {
    assert.match(criticProtocol, /ARTIFACT_GAP/);
    assert.match(criticProtocol, /CONTEXT_MISSING/);
    assert.match(criticProtocol, /NON_BLOCKING_QUESTION/);
  });

  it('only ARTIFACT_GAP may become a problem finding', () => {
    assert.match(criticProtocol, /Only this\s+class may become a problem finding/i);
  });

  it('the old inverted claims are gone', () => {
    assert.doesNotMatch(criticProtocol, /Confusion → underspecification, not a question to ask/);
    assert.doesNotMatch(criticProtocol, /Uncertainty = underspecification/);
  });

  it('AX_CONFUSION_BUG is activated in STEP_2_JUDGE, not just defined in BeliefState', () => {
    const step2 = /<Step id="STEP_2_JUDGE">([\s\S]*?)<\/Step>/.exec(criticProtocol)?.[1] ?? '';
    assert.match(step2, /AX_CONFUSION_BUG/);
  });
});
