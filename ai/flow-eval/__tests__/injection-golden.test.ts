// @file: V14-2d/V14-3 deterministic both-way golden for an execute retry-cap hole.
// @spec: AI-SKILLS
// @consumers: N/A (test file)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeSddPhasePrompt } from '../prompts.ts';
import { parseDeviationRecords } from '../../../shared/sdd/deviation.ts';

type GoldenResult = {
  pass: boolean;
  outcome: 'DEVIATION_PENDING_EXACTLY_ON_INJECTION' | 'DEVIATION_INJECTION_CONTRACT_BROKEN';
  pendingRecords: number;
  interactiveQuestions: number;
};

function gradeDeviationInjection(
  injected: boolean,
  ticketContent: string,
  toolNames: readonly string[]
): GoldenResult {
  const pendingRecords = parseDeviationRecords(ticketContent).filter(
    (record) => record.verdict === 'pending-operator'
  ).length;
  const interactiveQuestions = toolNames.filter((name) => name === 'AskUserQuestion').length;
  const pass = pendingRecords === (injected ? 1 : 0) && interactiveQuestions === 0;
  return {
    pass,
    outcome: pass
      ? 'DEVIATION_PENDING_EXACTLY_ON_INJECTION'
      : 'DEVIATION_INJECTION_CONTRACT_BROKEN',
    pendingRecords,
    interactiveQuestions,
  };
}

const CONTROL = [
  '<!--SECTION:DECISION_LOG-->',
  'No autonomous deviations.',
  '<!--/SECTION:DECISION_LOG-->',
].join('\n');

const INJECTED = [
  '<!--SECTION:DECISION_LOG-->',
  'DEM-DL-1 2026-09-22 — retry cap 3; где: src/retry.ts#loop (почему: spec silent; отвергнуто: unbounded retry) [verdict: pending-operator]',
  '<!--/SECTION:DECISION_LOG-->',
].join('\n');

describe('V14-2d deterministic deviation injection golden', () => {
  it('one retry-cap hole changes exactly one named outcome: one pending record, zero questions', () => {
    const control = gradeDeviationInjection(false, CONTROL, ['Read', 'Edit']);
    const injected = gradeDeviationInjection(true, INJECTED, ['Read', 'Edit']);
    assert.deepEqual(control, {
      pass: true,
      outcome: 'DEVIATION_PENDING_EXACTLY_ON_INJECTION',
      pendingRecords: 0,
      interactiveQuestions: 0,
    });
    assert.deepEqual(injected, {
      pass: true,
      outcome: 'DEVIATION_PENDING_EXACTLY_ON_INJECTION',
      pendingRecords: 1,
      interactiveQuestions: 0,
    });
  });

  it('rejects both an interactive question and a missing/duplicate pending record', () => {
    assert.equal(gradeDeviationInjection(true, CONTROL, []).pass, false);
    assert.equal(gradeDeviationInjection(true, INJECTED, ['AskUserQuestion']).pass, false);
    assert.equal(
      gradeDeviationInjection(
        true,
        INJECTED.replace(
          '<!--/SECTION:DECISION_LOG-->',
          'DEM-DL-2 2026-09-22 — another hole (почему: injected) [verdict: pending-operator]\n<!--/SECTION:DECISION_LOG-->'
        ),
        []
      ).pass,
      false
    );
  });

  it('headless execute prompt distinguishes an agent-owned pending record from operator acceptance', () => {
    const prompt = composeSddPhasePrompt({
      phase: 'execute',
      mode: 'full',
      intent: 'Retry safely.',
      acceptance: 'One bounded retry.',
      directory: '/tmp/injection-golden',
    });
    assert.match(prompt, /MUST write its own agent-owned Decision Log deviation/);
    assert.match(prompt, /only the operator may replace that pending verdict/);
    assert.match(prompt, /Do not call an interactive question\/approval tool/);
  });
});
