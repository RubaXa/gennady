// @file: Typed execute-outcome routing contract extracted from the draft.60 operator pause.
// @consumers: sdd-v2 execute directive
// @tasks: N/A

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

type ExecuteResultKind =
  | 'RECOVERABLE_TECHNICAL'
  | 'TECHNICAL_REPLAN_EXHAUSTED'
  | 'SPEC_GOAL_CONFLICT'
  | 'EXTERNAL_AUTHORITY_REQUIRED'
  | 'BLOCKED'
  | 'FAIL'
  | 'DONE';

type ExecuteRoute =
  | { action: 'AUTO_REPLAN'; ledger: 'DEVIATION_LEDGER' }
  | { action: 'OPERATOR' }
  | { action: 'CONTINUE' }
  | { action: 'UNCLASSIFIED'; destination: string };

type ParsedRoute = {
  outcomes: ExecuteResultKind[];
  route: ExecuteRoute;
};

function classifyDestination(destination: string): ExecuteRoute {
  if (/AUTO_REPLAN/.test(destination) && /DEVIATION_LEDGER/.test(destination)) {
    return { action: 'AUTO_REPLAN', ledger: 'DEVIATION_LEDGER' };
  }
  if (/OPERATOR|AskUserQuestion|H_PAUSED_AWAITING_OPERATOR/.test(destination)) {
    return { action: 'OPERATOR' };
  }
  if (/record Handoff|thread it into the next phase/.test(destination)) {
    return { action: 'CONTINUE' };
  }
  return { action: 'UNCLASSIFIED', destination };
}

function workerDispatchRoutes(): ParsedRoute[] {
  const source = readFileSync(
    join(ROOT, 'ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs'),
    'utf-8'
  );
  const switchBody = source.match(
    /<LogicSwitch on="worker dispatch outcome">([\s\S]*?)<\/LogicSwitch>/
  )?.[1];
  assert.ok(switchBody, 'worker dispatch switch must remain structurally parseable');

  const routes: ParsedRoute[] = [];
  for (const line of switchBody.split('\n')) {
    const branch = /^\s*- WHEN (.+?)\s*->\s*(.+)$/.exec(line);
    if (!branch?.[1] || !branch[2]) continue;
    const outcomes = [...branch[1].matchAll(/`([^`]+)`/g)]
      .map((match) => match[1] as ExecuteResultKind)
      .filter((outcome) =>
        [
          'RECOVERABLE_TECHNICAL',
          'TECHNICAL_REPLAN_EXHAUSTED',
          'SPEC_GOAL_CONFLICT',
          'EXTERNAL_AUTHORITY_REQUIRED',
          'BLOCKED',
          'FAIL',
          'DONE',
        ].includes(outcome)
      );
    if (outcomes.length > 0) routes.push({ outcomes, route: classifyDestination(branch[2]) });
  }
  return routes;
}

function routeFor(kind: ExecuteResultKind): ExecuteRoute | null {
  return workerDispatchRoutes().find((candidate) => candidate.outcomes.includes(kind))?.route ?? null;
}

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

function stepBody(content: string, id: string): string {
  const body = content.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`))?.[1];
  assert.ok(body, `${id} must remain structurally present`);
  return body;
}

describe('typed execute-result policy', () => {
  it('RECOVERABLE_TECHNICAL routes autonomously to replan with a durable deviation', () => {
    assert.deepStrictEqual(routeFor('RECOVERABLE_TECHNICAL'), {
      action: 'AUTO_REPLAN',
      ledger: 'DEVIATION_LEDGER',
    });
  });

  it('TECHNICAL_REPLAN_EXHAUSTED is the explicit technical operator boundary', () => {
    assert.deepStrictEqual(routeFor('TECHNICAL_REPLAN_EXHAUSTED'), { action: 'OPERATOR' });
  });

  it('SPEC_GOAL_CONFLICT routes to the operator as a product decision', () => {
    assert.deepStrictEqual(routeFor('SPEC_GOAL_CONFLICT'), { action: 'OPERATOR' });
  });

  it('EXTERNAL_AUTHORITY_REQUIRED routes to the operator because autonomy is insufficient', () => {
    assert.deepStrictEqual(routeFor('EXTERNAL_AUTHORITY_REQUIRED'), { action: 'OPERATOR' });
  });

  it('does not preserve generic BLOCKED/FAIL as the normal typed operator boundary', () => {
    const genericOperatorRoutes = (['BLOCKED', 'FAIL'] as const).filter(
      (kind) => routeFor(kind)?.action === 'OPERATOR'
    );
    assert.deepStrictEqual(genericOperatorRoutes, []);
  });

  it('records every phase-worker result through the typed checkpoint and consumes its NEXT', () => {
    const execute = source('ai/kit/templates/sdd-v2/execute.directive.hbs');
    assert.match(execute, /After every phase-worker return/);
    assert.match(
      execute,
      /<ToolCall owner="this-step" result="workerCheckpoint">npx gennady sdd-session checkpoint --content-file \.claude\/tmp\/<task-id>-<phase-id>-worker-checkpoint\.json<\/ToolCall>/
    );
    assert.match(execute, /Use workerCheckpoint\.next as the sole transition/);
  });

  it('keeps technical recovery bounded by approved goals and deterministic rechecks', () => {
    const branch = workerDispatchRoutes().find((candidate) =>
      candidate.outcomes.includes('RECOVERABLE_TECHNICAL')
    );
    assert.ok(branch);
    const execute = source('ai/kit/templates/sdd-v2/execute.directive.hbs');
    assert.match(execute, /inside approved spec\/BDD goals/);
    assert.match(execute, /sdd-check --task <ticket> --authoring/);
    assert.match(execute, /sdd-check --scaffold-feasibility/);
    assert.match(execute, /sdd-task <ticket>/);
  });

  it('worker reports evidence and typed outcome but never owns operator routing or Gennady repair', () => {
    const phase = source('ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs');
    const summary = source('ai/kit/contract/process/return-summary-format.xml');
    assert.match(
      summary,
      /"outcome": "CONTINUE" \| "CONTEXT_ROTATION" \| "RECOVERABLE_TECHNICAL"/
    );
    assert.match(summary, /"evidence": \["<repo-relative ref>"/);
    assert.match(phase, /orchestrator\s+owns technical replan and operator routing/i);
    assert.match(phase, /report `RECOVERABLE_TECHNICAL`/);
    assert.match(phase, /Gennady internals/);
  });

  it('classifies draft.60 technical facts as recoverable, not semantic escalation', () => {
    const summary = source('ai/kit/contract/process/return-summary-format.xml');
    for (const fact of [
      '@types/node',
      'eslint-config-prettier',
      'repair-command contract',
      'CREATE target',
      'decomposition edge',
    ]) {
      assert.match(summary, new RegExp(fact.replace('/', '\\/')));
    }
  });

  it('has no legacy direct operator escape for technical/audit/review/interruption failures', () => {
    const execute = source('ai/kit/templates/sdd-v2/execute.directive.hbs');
    const phase = source('ai/kit/templates/sdd-v2/phase-execution-protocol.directive.hbs');
    for (const legacy of [
      'H_AUDIT_FAIL_AFTER_RETRY',
      'H_CODE_REVIEW_BLOCKER',
      'H_WORKER_INTERRUPTED',
      'AX_ENV_FIX_CHANNEL',
    ]) {
      assert.doesNotMatch(execute, new RegExp(legacy));
    }
    assert.doesNotMatch(phase, /H_BLOCKED.+PAUSED|asks the operator|operator for the exact version/s);
    assert.doesNotMatch(phase, /AX_BLOCKER_ESCALATION.+surfaced as PAUSED/s);
  });

  it('keeps source and generated execution surfaces on the same three typed boundaries', () => {
    const generated = [
      source('ai/directives/sdd-v2/execute.directive.xml'),
      source('ai/directives/sdd-v2/phase-execution-protocol.directive.xml'),
      source('ai/directives/sdd-v2/phase-execution-protocol/steps/STEP_5_VERIFY.xml'),
    ].join('\n');
    assert.doesNotMatch(
      generated,
      /WHEN `BLOCKED` \/ `FAIL` ->\s*(?:stop|`OPERATOR`|`H_PAUSED)|H_BLOCKED[^\n]*surfaced as PAUSED/i
    );
    assert.doesNotMatch(generated, /AX_ENV_FIX_CHANNEL|H_CODE_REVIEW_BLOCKER/);
    for (const boundary of [
      'SPEC_GOAL_CONFLICT',
      'EXTERNAL_AUTHORITY_REQUIRED',
      'TECHNICAL_REPLAN_EXHAUSTED',
    ]) {
      assert.match(generated, new RegExp(boundary));
    }
  });

  it('keeps audit and code-review recovery executable without the phase-worker checkpoint', () => {
    for (const path of [
      'ai/kit/templates/sdd-v2/execute.directive.hbs',
      'ai/directives/sdd-v2/execute.directive.xml',
    ]) {
      const content = source(path);
      const audit = stepBody(content, 'STEP_6_BRANCH');
      const review = stepBody(content, 'STEP_7B_CODE_REVIEW');
      assert.match(audit, /FAIL` \+ attempt 1[\s\S]*STEP_7_RESOLVE/);
      assert.match(
        audit,
        /FAIL` \+ attempt 2[\s\S]*H_TECHNICAL_REPLAN_EXHAUSTED[\s\S]*audit evidence[\s\S]*STEP_8_SUMMARY/
      );
      assert.doesNotMatch(audit, /workerCheckpoint/);
      assert.match(
        review,
        /bounded technical repair[\s\S]*STEP_7_RESOLVE[\s\S]*rerun audit[\s\S]*code-review/
      );
      assert.match(
        review,
        /SPEC_GOAL_CONFLICT[\s\S]*H_SPEC_GOAL_CONFLICT[\s\S]*STEP_8_SUMMARY/
      );
      assert.doesNotMatch(review, /workerCheckpoint/);
    }
  });
});
