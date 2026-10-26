// @file: Causal regression tests for complete, persistent and verdict-bearing agent trajectories.
// @spec: AI-SKILLS
// @consumers: flow-eval trajectory collection and grading

import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import { buildTrajectory, gradeTrajectory, toolEventsFrom } from '../trajectory.ts';
import { computeAggregateExitCode } from '../cli.ts';

const DIRECTORY = '/tmp/trajectory-owned-fixture';
function message(id: string, command: string) {
  return {
    info: { id, role: 'assistant', time: { created: 1 } },
    parts: [
      {
        type: 'tool',
        callID: `call-${id}`,
        tool: 'bash',
        state: {
          status: 'completed',
          input: { command },
        },
      },
    ],
  };
}

function source(command = 'gennady sdd-new library', childDirectory = DIRECTORY) {
  const client = {
    session: {
      messages: async ({ path }: { path: { id: string } }) => ({
        data:
          path.id === 'root'
            ? [message('r', command)]
            : [
                message('c1', 'read first'),
                message('c2', 'read second'),
                message('c3', 'gennady sdd-migrate plan'),
              ],
      }),
      children: async ({ path }: { path: { id: string } }) => ({
        data: path.id === 'root' ? [{ id: 'child', directory: childDirectory }] : [],
      }),
    },
  } as unknown as OpencodeClient;
  return new SddEvalOpenCodeEvidenceSource({ directory: DIRECTORY, client });
}

it('captures descendant actions beyond the observer child-tail limit and rejects the bad path', async () => {
  const capture = await source().readTrajectory('root');
  assert.equal(capture.coverage.complete, true);
  assert.equal(capture.coverage.sessions, 2);
  const tools = toolEventsFrom(capture.entries);
  assert.equal(tools.length, 4);
  assert.ok(tools.every((event) => event.messageId && event.callId && event.status));
  const trajectory = buildTrajectory('native', tools, []);
  trajectory.coverage = capture.coverage;
  assert.equal(gradeTrajectory(trajectory, { requiredCommands: ['sdd-new'] }).pass, true);
  assert.equal(gradeTrajectory(trajectory, { forbiddenCommands: ['sdd-migrate'] }).pass, false);
});

it('never proves a forbidden action absent from a legacy or truncated trace', async () => {
  assert.equal(gradeTrajectory({ scenario: 'old', events: [] }).pass, false);
  const capture = await source('x'.repeat(20_000)).readTrajectory('root');
  assert.equal(capture.coverage.complete, false);
  const trajectory = buildTrajectory('truncated', toolEventsFrom(capture.entries), []);
  trajectory.coverage = capture.coverage;
  assert.equal(gradeTrajectory(trajectory).pass, false);
});

it('refuses a descendant outside the bound sandbox', async () => {
  await assert.rejects(source('safe', '/tmp/another-project').readTrajectory('root'), /escaped/);
});

it('does not count echoed commands as observed CLI invocations', async () => {
  const capture = await source('echo "gennady sdd-new library"').readTrajectory('root');
  const trajectory = buildTrajectory('echo', toolEventsFrom(capture.entries), []);
  trajectory.coverage = capture.coverage;
  assert.equal(gradeTrajectory(trajectory, { requiredCommands: ['sdd-new'] }).pass, false);
});

it('recognizes direct Node TypeScript loader commands as actual attempts', async () => {
  const capture = await source(
    'node --import tsx cli/gennady.ts sdd-orient specs/a/a.spec.md'
  ).readTrajectory('root');
  const trajectory = buildTrajectory('loader', toolEventsFrom(capture.entries), []);
  trajectory.coverage = capture.coverage;
  assert.equal(gradeTrajectory(trajectory, { requiredCommands: ['sdd-orient'] }).pass, true);
});

it('does not use CLI help as verification or ordering evidence', async () => {
  const capture = await source('npx gennady sdd-check --help 2>&1 | head -40').readTrajectory(
    'root'
  );
  const trajectory = buildTrajectory('help', toolEventsFrom(capture.entries), []);
  trajectory.coverage = capture.coverage;
  assert.equal(gradeTrajectory(trajectory, { requiredCommands: ['sdd-check'] }).pass, false);
  assert.equal(gradeTrajectory(trajectory, { commandOrder: ['sdd-check'] }).pass, false);
});

it('proves command order from completed tool timings, not terminal checkpoints or prose', () => {
  const events = ['sdd-new', 'sdd-orient', 'sdd-check'].map((verb, i) => ({
    type: 'tool' as const,
    i,
    tool: 'bash',
    messageId: `m${i}`,
    callId: `c${i}`,
    status: 'completed',
    command: `npx --no-install gennady ${verb} .`,
    startedAt: i * 10,
    finishedAt: i * 10 + 5,
  }));
  const rules = { commandOrder: ['sdd-new', 'sdd-orient', 'sdd-check'] };
  const trajectory = {
    scenario: 'order',
    events,
    coverage: { complete: true, sessions: 1, reasons: [] },
  };
  assert.equal(gradeTrajectory(trajectory, rules).pass, true);
  assert.equal(
    gradeTrajectory(
      { ...trajectory, events: events.map((event) => ({ ...event, startedAt: undefined })) },
      rules
    ).pass,
    false
  );
  assert.equal(
    gradeTrajectory(
      {
        ...trajectory,
        events: events.map((event) => ({
          ...event,
          startedAt: 100 - event.startedAt,
          finishedAt: 105 - event.startedAt,
        })),
      },
      rules
    ).pass,
    false
  );
  assert.equal(
    gradeTrajectory({ ...trajectory, events: [{ ...events[0], status: 'running' }] }).pass,
    false
  );
});

it('projects actions without authored bodies and redacts command secrets before persistence', async () => {
  const raw = message('secret', 'gennady verify --token=super-secret-fixture');
  Object.assign(raw.parts[0].state.input, {
    content: 'private authored body',
    prompt: 'private prompt',
  });
  const client = {
    session: {
      messages: async () => ({ data: [raw] }),
      children: async () => ({ data: [] }),
    },
  } as unknown as OpencodeClient;
  const capture = await new SddEvalOpenCodeEvidenceSource({
    directory: DIRECTORY,
    client,
  }).readTrajectory('root');
  const persisted = JSON.stringify(toolEventsFrom(capture.entries));
  assert.doesNotMatch(persisted, /super-secret-fixture|private authored body|private prompt/);
  assert.match(persisted, /gennady verify/);
});

it('retains a failed process exit and sanitized diagnostic, not an unbounded output stream', async () => {
  const raw = message('failed', 'gennady sdd-orient --scope missing');
  Object.assign(raw.parts[0].state, {
    output: 'missing scope; --token=fixture-private-value',
    metadata: { exit: 4 },
  });
  const client = {
    session: {
      messages: async () => ({ data: [raw] }),
      children: async () => ({ data: [] }),
    },
  } as unknown as OpencodeClient;
  const captured = await new SddEvalOpenCodeEvidenceSource({
    directory: DIRECTORY,
    client,
  }).readTrajectory('root');
  const [event] = toolEventsFrom(captured.entries);
  assert.equal(event.exitCode, 4);
  assert.match(event.diagnostic ?? '', /missing scope/);
  assert.doesNotMatch(event.diagnostic ?? '', /fixture-private-value/);
});

it('a failed trajectory dominates a positive judge but does not relabel budget exhaustion', () => {
  const artifact = {
    scenarioId: 'native',
    verdict: 'pass',
    status: 'completed',
    specFiles: [],
    directory: DIRECTORY,
    quality: { rule: 'R1', pass: true, detail: 'clean' },
    trajectory: { rule: 'TRAJECTORY', pass: false, detail: 'incomplete' },
  };
  assert.equal(computeAggregateExitCode([artifact]), 1);
  assert.equal(computeAggregateExitCode([{ ...artifact, outcome: 'budget-exhausted' }]), 0);
});
