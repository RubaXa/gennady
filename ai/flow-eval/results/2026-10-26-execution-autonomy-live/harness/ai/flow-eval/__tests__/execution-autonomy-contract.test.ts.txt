// @file: Source/generated writer-role contract controls for execution-autonomy experiments.
// @spec: AI-SKILLS
// @consumers: offline flow-eval qualification

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8');

test('source contracts persist the canonical decision before action and never use Handoff as its store', () => {
  const record = read('ai/kit/contract/process/deviation-record-format.xml');
  const choice = read('ai/kit/axiom/process/ax-deviation-self-resolve.xml');
  const handoff = read('ai/kit/contract/process/handoff-format.xml');
  assert.match(record, /id, what, why, where, evidence, alternative, verify/);
  assert.match(record, /before using the choice/);
  assert.match(record, /Handoff[\s\S]*contains only those canonical IDs/);
  assert.match(choice, /acknowledgement BEFORE applying the choice/);
  assert.match(choice, /lost acknowledgement permits the identical ID\/payload retry/);
  assert.match(handoff, /ticket-local Decision Log id/);
});

test('worker template allows bounded fact writers, not completion, own approval or manual ticket edits', () => {
  const execute = read('ai/kit/templates/sdd-v2/execute.directive.hbs');
  const phase = read('ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs');
  const scope = read('ai/kit/axiom/process/ax-phase-scope-lock.xml');
  assert.match(execute, /sdd-log line \| blocker \| resolved \| decision/);
  assert.match(scope, /MUST NOT manually edit the ticket/);
  assert.match(scope, /facade alone owns attempt evidence/);
  assert.match(phase, /sdd-log decision[\s\S]*before applying the choice/);
  assert.match(phase, /`sdd-log complete`, verdict or receipt modes/);
  for (const text of [execute, phase]) {
    assert.doesNotMatch(
      text,
      /(?:NEVER|Never|never|Do not) (?:call|invoke|run) `?sdd-log`?(?! complete)/
    );
  }
});

test('generated phase package carries the same writer responsibilities as its sources', () => {
  const orient = read('ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_1_ORIENT.xml');
  const implement = read(
    'ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_2_IMPLEMENT.xml'
  );
  const handoff = read('ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_4_HANDOFF.xml');
  assert.match(orient, /sdd-log line \| blocker \| resolved \| decision/);
  assert.match(implement, /sdd-log decision[\s\S]*before applying the choice/);
  assert.match(handoff, /`sdd-log complete`, verdict or receipt modes/);
});

test('orchestrator uses checked means-only replan and fresh dispatch, never expands the worker writer role', () => {
  for (const path of [
    'ai/kit/templates/sdd-v2/execute.directive.hbs',
    'ai/directives/sdd-v2/execute.directive.xml',
  ]) {
    const text = read(path);
    assert.match(text, /first stop\/await the old worker/);
    assert.match(text, /exact `REPLAN_BASE`/);
    assert.match(text, /orchestrator, not the worker/);
    assert.match(text, /reverify stale completed prerequisites/);
    assert.match(text, /fresh `sdd-task[\s\S]*rules\/Verify included/);
    assert.match(text, /new provider inherits the selected phase's kind/);
    assert.match(text, /existing scenario\/check obligations stay unchanged/);
    assert.match(
      text,
      /Arbitrary phase[\s\S]*deletion, weaker checks or rewritten test scenarios are unsupported/
    );
    assert.doesNotMatch(text, /dependencies, phases, or test plan invalidates approval/);
  }
});
