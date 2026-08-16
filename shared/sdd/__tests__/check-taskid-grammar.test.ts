// @file: Unit tests for checkTaskIdGrammar — the v2-only Task-ID grammar/length gate (SDD_TASK_ID_GRAMMAR).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTaskIdGrammar } from '../check.ts';

const ticket = (taskId: string): string =>
  [
    '<!--SECTION:META-->',
    `- **Task-ID:** ${taskId}`,
    '- **Status:** [ ] TODO',
    '<!--/SECTION:META-->',
  ].join('\n');

describe('checkTaskIdGrammar', () => {
  it('clean v2 Task-ID → no findings', () => {
    assert.deepStrictEqual(checkTaskIdGrammar('t.md', ticket('GAT-login')), []);
  });

  it('flags a lowercase-starting ACR', () => {
    const findings = checkTaskIdGrammar('t.md', ticket('gat-login'));
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_TASK_ID_GRAMMAR');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('flags a slug over the 8-char cap', () => {
    const findings = checkTaskIdGrammar('t.md', ticket('GAT-a-very-long-slug'));
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0]?.message ?? '', /> 8/);
  });

  it('does not flag an unfilled <ACRONYM>-<slug> scaffold placeholder', () => {
    assert.deepStrictEqual(checkTaskIdGrammar('t.md', ticket('<ACRONYM>-<slug>')), []);
  });

  it('does not flag when Meta has no Task-ID at all', () => {
    const content = ['<!--SECTION:META-->', '- **Status:** [ ] TODO', '<!--/SECTION:META-->'].join(
      '\n'
    );
    assert.deepStrictEqual(checkTaskIdGrammar('t.md', content), []);
  });

  it('does not flag when there is no META section at all', () => {
    assert.deepStrictEqual(checkTaskIdGrammar('t.md', 'no sections here'), []);
  });
});
