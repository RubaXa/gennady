// @file: Safe public terminal projection and unknown/missing/empty response controls.
// @spec: AI-SKILLS
// @consumers: semantic calibration transport qualification

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { projectAuthoringJudgeTerminal } from '../authoring-calibration-terminal.ts';
const message = () => ({
  info: {
    role: 'assistant',
    id: 'msg_1',
    sessionID: 'ses_1',
    providerID: 'llm-proxy',
    modelID: 'deepseek-v4-flash',
    finish: 'stop',
    error: undefined as unknown,
  },
  parts: [{ type: 'text', text: 'VERDICT: fail' }],
});
it('keeps only public terminal identity, never error bodies or private reasoning', () => {
  const row = message();
  row.info.error = { name: 'APIError', data: { message: 'password=SECRET' } };
  row.parts.push({ type: 'reasoning', text: 'PRIVATE_REASONING' });
  const terminal = projectAuthoringJudgeTerminal([row]);
  assert.equal(terminal.errorName, 'APIError');
  assert.equal(terminal.errorPresent, true);
  assert.equal(terminal.model, 'llm-proxy/deepseek-v4-flash');
  assert.equal(terminal.publicTextPresent, true);
  assert.doesNotMatch(JSON.stringify(terminal), /SECRET|PRIVATE_REASONING|VERDICT/);
});
it('distinguishes empty text from a public verdict and bounds unknown errors', () => {
  const row = message();
  row.parts = [{ type: 'reasoning', text: 'not public' }];
  row.info.error = { name: 'sensitive-unknown-error', data: { message: 'never export' } };
  const terminal = projectAuthoringJudgeTerminal([row]);
  assert.equal(terminal.publicTextPresent, false);
  assert.equal(terminal.errorName, 'unknown');
  assert.doesNotMatch(JSON.stringify(terminal), /sensitive|never export|not public/);
});
it('missing, malformed and oversized terminal capture is unavailable, not fabricated', () => {
  for (const value of [
    undefined,
    [],
    Array(513).fill(message()),
    [{ info: { role: 'assistant' }, parts: [] }],
    [{ ...message(), parts: undefined }],
  ])
    assert.throws(() => projectAuthoringJudgeTerminal(value));
});
