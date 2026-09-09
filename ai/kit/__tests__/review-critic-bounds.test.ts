// @file: Guards Пачка 20 ("Ревью и критик ограничены и читают владельца тикета"): the STEP_2⇄
//   STEP_3 review⇄reconcile cycle is bounded by AX_CAP_5 with an explicit operator disposition
//   instead of running forever, and the critic activates AX_DEFAULT_ACCEPT and AX_POLISH_MODE —
//   both existed in the axiom library (ax-default-accept.xml, ax-polish-mode.xml) but were never
//   connected to any template (40-TRACK-DIRECTIVES-SKILLS.md §1.3, D3.5/D3.6) — (T-B6-03). Also
//   guards ISS-10: the critic reads the owning ticket's `## Conventions` and `## Decision Log`
//   sections through sdd-extract's heading-anchor form, bounded to exactly those two sections and
//   measured (extracted line count recorded), per akkrat issue #21 / 20-ISSUES-VERDICTS.md #21.
//   Also guards T-B6-05: reconcile activates AX_DISPATCH_VIA_BATCH so a task-reopen dispatches
//   through execute as one batch, with execute remaining the sole owner of audit/code-review.
// @consumers: node:test runner
// @tasks: T-B6-03, ISS-10, T-B6-05

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_ROOT } from '../render.ts';

function readDirective(name: string): string {
  return readFileSync(join(OUT_ROOT, 'sdd-v2', name), 'utf8');
}

function step(text: string, id: string): string {
  const match = new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`).exec(text);
  assert.ok(match, `${id} not found`);
  return match![1]!;
}

describe('review-lifecycle: STEP_2⇄STEP_3 is bounded by AX_CAP_5 (T-B6-03)', () => {
  const review = readDirective('review-lifecycle.directive.xml');

  it('defines AX_CAP_5 in BeliefState', () => {
    assert.match(review, /<Axiom id="AX_CAP_5">/);
  });

  it('activates AX_CAP_5 inside STEP_3_RECONCILE, counting the review⇄reconcile cycle', () => {
    const reconcile = step(review, 'STEP_3_RECONCILE');
    assert.match(reconcile, /AX_CAP_5/);
    assert.match(reconcile, /bounded, not open-ended/i);
    assert.match(reconcile, /fifth result/i);
  });

  it('names the three explicit dispositions at the cap — CLEAN / CONTINUE / RESTART', () => {
    const reconcile = step(review, 'STEP_3_RECONCILE');
    assert.match(reconcile, /`CLEAN`/);
    assert.match(reconcile, /CONTINUE THROUGH ROUND N/);
    assert.match(reconcile, /RESTART: reason/);
  });

  it("the reviewer's verdict never authorizes continuation past the cap by itself", () => {
    const reconcile = step(review, 'STEP_3_RECONCILE');
    assert.match(reconcile, /never\s+authorizes continuation past the cap/i);
  });
});

describe('critic-protocol: AX_DEFAULT_ACCEPT and AX_POLISH_MODE are connected (T-B6-03)', () => {
  const critic = readDirective('critic-protocol.directive.xml');

  it('defines both axioms in BeliefState', () => {
    assert.match(critic, /<Axiom id="AX_DEFAULT_ACCEPT">/);
    assert.match(critic, /<Axiom id="AX_POLISH_MODE">/);
  });

  it('activates AX_DEFAULT_ACCEPT in STEP_2_JUDGE: uncertain finding defaults to ACCEPT', () => {
    const judge = step(critic, 'STEP_2_JUDGE');
    assert.match(judge, /AX_DEFAULT_ACCEPT/);
    assert.match(judge, /defaults to ACCEPT/i);
  });

  it('activates AX_POLISH_MODE in STEP_3_REPORT: polish off by default, MINOR/INFO never drive the verdict', () => {
    const report = step(critic, 'STEP_3_REPORT');
    assert.match(report, /AX_POLISH_MODE/);
    assert.match(report, /polish: off/);
    assert.match(report, /MINOR\/INFO never drive the verdict/i);
  });
});

describe('critic-protocol: reads the owning ticket Conventions/Decision Log by extraction (ISS-10)', () => {
  const critic = readDirective('critic-protocol.directive.xml');
  const read = () => step(critic, 'STEP_1_READ');

  it('names both sections — Conventions and Decision Log — and nothing else of that document', () => {
    const text = read();
    assert.match(text, /## Conventions/);
    assert.match(text, /## Decision Log/);
    assert.match(text, /nothing else of that document/i);
  });

  it('extracts via sdd-extract heading-anchor form, one call per section', () => {
    const text = read();
    assert.match(text, /npx gennady sdd-extract <owning-tasks-index>#<heading-anchor>/);
    assert.match(text, /one call per section/i);
  });

  it('is bounded and measured: records the extracted line count, does not reopen a settled decision', () => {
    const text = read();
    assert.match(text, /record the extracted line count/i);
    assert.match(text, /bounded and measured/i);
    assert.match(text, /already settled is not reopened/i);
  });
});

describe('reconcile: task-reopen dispatches as one execute batch (T-B6-05)', () => {
  const reconcile = readDirective('reconcile.directive.xml');

  it('defines AX_DISPATCH_VIA_BATCH in BeliefState', () => {
    assert.match(reconcile, /<Axiom id="AX_DISPATCH_VIA_BATCH">/);
  });

  it('activates it in the task-reopen branch of STEP_5_APPLY: one BATCH, execute is the sole audit/code-review owner', () => {
    const apply = step(reconcile, 'STEP_5_APPLY');
    assert.match(apply, /AX_DISPATCH_VIA_BATCH/);
    assert.match(apply, /as one BATCH/);
    assert.match(apply, /sole owner of each affected group's audit\s+and code-review/i);
    assert.match(apply, /never dispatches a\s+second review/i);
  });

  it('there is no reconcile-only audit flag', () => {
    const apply = step(reconcile, 'STEP_5_APPLY');
    assert.match(apply, /no\s+reconcile-only audit flag/i);
  });
});
