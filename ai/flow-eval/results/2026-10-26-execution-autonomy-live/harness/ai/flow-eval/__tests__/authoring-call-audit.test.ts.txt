// @file: Per-call audit controls distinguish observations, hypotheses and absent historical data.
// @spec: AI-SKILLS
// @consumers: deterministic authoring call research

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { auditAuthoringCalls } from '../authoring-call-audit.ts';
import { renderAuthoringCallAudit } from '../scripts/authoring-call-audit.ts';
import type { Trajectory, ToolEvent } from '../trajectory.ts';

const context = {
  directory: '/owned',
  target: 'specs/README.md',
  caseId: 'portal',
  requiredContextPaths: ['inputs/brief.md'],
};
const read = (i: number, path: string, messageId = 'm'): ToolEvent => ({
  type: 'tool',
  i,
  tool: 'read',
  arg: JSON.stringify({ filePath: path }),
  callId: `call_${i}`,
  messageId,
  sessionId: 's',
  status: 'completed',
  startedAt: i * 10,
  finishedAt: i * 10 + 5,
});
const trace = (events: ToolEvent[]): Trajectory => ({
  scenario: 'test',
  coverage: { complete: true, sessions: 1, reasons: [] },
  events,
});

it('keeps all calls, treats useful class as contract-related not proven necessity, and preserves unknown results', () => {
  const input = trace([
    read(0, 'inputs/brief.md'),
    read(1, 'docs/extra.md'),
    read(2, 'specs/README.md'),
  ]);
  const before = JSON.stringify(input);
  const result = auditAuthoringCalls(input, context);
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.calls.length, 3);
  assert.deepEqual(
    result.calls.map((call) => call.assessment),
    ['contract-related', 'review-context', 'contract-related']
  );
  assert.equal(result.provenUnnecessary, 0);
  assert.ok(result.calls.every((call) => call.resultEvidence === 'terminal-facts-only'));
  assert.equal(result.batching.length, 2);
  assert.ok(result.batching.every((pair) => pair.alreadySameMessage));
});

it('does not confuse cross-message candidates, failed reads or overlapping intervals with saved requests', () => {
  const result = auditAuthoringCalls(
    trace([read(0, 'a'), read(1, 'b', 'm2'), { ...read(2, 'c'), status: 'error' }]),
    context
  );
  assert.equal(result.batching.length, 1);
  assert.equal(result.batching[0]!.alreadySameMessage, false);
  assert.equal(result.calls[2]!.assessment, 'failed-attempt');
  const overlap = trace([read(0, 'a'), { ...read(1, 'b'), startedAt: 1 }]);
  assert.equal(auditAuthoringCalls(overlap, context).batching.length, 0);
});

it('allows mixed shell roles but never assumes subcommand exits or reconstructs withheld payloads', () => {
  const bash = {
    ...read(0, 'a'),
    tool: 'bash',
    command: 'ls specs && git status --short',
    arg: JSON.stringify({ command: 'ls specs && git status --short' }),
    exitCode: 0,
  };
  const hidden = {
    ...bash,
    i: 1,
    callId: 'other',
    command: 'echo PRIVATE_BODY > target',
    arg: JSON.stringify({ command: 'echo PRIVATE_BODY > target' }),
  };
  const result = auditAuthoringCalls(trace([bash, hidden]), context);
  assert.deepEqual(result.calls[0]!.roles, ['filesystem-discovery', 'git-observation']);
  assert.match(result.calls[0]!.purpose, /unknown/);
  assert.deepEqual(result.calls[1]!.roles, ['withheld-shell']);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_BODY/);
});

it('replays the full frozen626-call ledger and its actual missing-result boundaries', () => {
  const bytes = readFileSync(
    new URL('../results/authoring-campaigns/spec-trajectory-oct23/input.json', import.meta.url)
  );
  const input = JSON.parse(bytes.toString('utf8'));
  const output = renderAuthoringCallAudit(input, createHash('sha256').update(bytes).digest('hex'));
  assert.match(output, /Runs=30; calls=626; complete-timed=626/);
  assert.match(output, /Result fingerprints=0; failure diagnostics=9; terminal facts only=617/);
  assert.match(output, /Adjacent read pairs=145; already same message=118; across messages=27/);
  assert.match(
    output,
    /Worker wall sum ms=2313280; observed assistant messages=414; union of per-run tool intervals ms=9310/
  );
  assert.equal((output.match(/^\| \d+ call_/gm) ?? []).length, 626);
  assert.equal(
    output,
    readFileSync(new URL('../docs/AUTHORING-CALL-AUDIT.md', import.meta.url), 'utf8')
  );
});
