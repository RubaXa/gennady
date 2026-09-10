// @file: Trajectory rules for the migration ladder (portal / +scope / +module), asserted over each
//   tier's recorded baseline trajectory. Locks the PROVEN end-state — the repo actually flips to v2
//   (`flow-v2` checkpoint green) — plus the de-ceremony wins (bounded tools, zero format-archaeology).
//   Baselines recorded from the H9+H10+H11 keeper runs (EXPERIMENTS-LOG §H9/H10/H11): all three tiers
//   reach FLOW_VERSION=v2 within the 5-min budget. `plan-verified`/`specs-clean` stay red only from the
//   SDD_SPEC_SECTION_MISSING backlog (v2-required sections the v1 source never had) — NOT a defect, so
//   they are diagnostics here, never the win-criterion (see the critic reframe in §H8-diag).
// @consumers: N/A (test)
// @tasks: N/A

import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTrajectory, type TrajectoryView } from './trajectory-assert.ts';
import type { TrajectoryEvent } from '../trajectory.ts';

const fixture = (name: string): TrajectoryView =>
  loadTrajectory(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.baseline.trajectory.json`, import.meta.url)),
      'utf8'
    )
  );

// Reverse-engineering signature: grepping the codebase for the v2 section/token vocabulary instead of
// trusting the tool's pre-filled map. De-ceremony drove this to 0 — lock it low.
const isVocabGrep = (e: TrajectoryEvent): boolean =>
  e.type === 'tool' &&
  /\b(rg|grep)\b/.test(e.arg ?? '') &&
  /REQUIRED_SECTIONS|SDD_[A-Z]/.test(e.arg ?? '');
const touchesGolden = (e: TrajectoryEvent): boolean =>
  e.type === 'tool' && /golden\//.test(e.arg ?? '');
const isTool = (e: TrajectoryEvent): boolean => e.type === 'tool';

// Rules shared by every rung: the PROVEN migration win (repo flipped to v2) + anti-thrash budgets.
function assertLockedMigrationRules(t: TrajectoryView, toolBudget: number): void {
  t.checkpoints().green('flow-v2'); // the real win-criterion: FLOW_VERSION=v2 (sdd-state), end-state
  t.atMost(toolBudget, isTool, 'tool calls'); // bounded — fits the 5-min budget, no post-v2 thrash
  t.atMost(2, isVocabGrep, 'vocabulary greps'); // trust the pre-filled Section Map, do not reverse-engineer
  t.never(touchesGolden, 'touch golden'); // reference artifacts are read-only
}

describe('migration ladder — locked trajectory rules', () => {
  it('portal: flips to v2, bounded, no archaeology', () => {
    assertLockedMigrationRules(fixture('MIG-portal'), 50); // recorded 39
  });

  it('portal + scope: flips to v2 (Critic Rounds dropped), bounded, no archaeology', () => {
    assertLockedMigrationRules(fixture('MIG-portal-scope'), 50); // recorded 38
  });

  it('portal + scope + module: flips to v2, bounded, no archaeology', () => {
    assertLockedMigrationRules(fixture('MIG-portal-scope-module'), 70); // recorded 55
  });
});
