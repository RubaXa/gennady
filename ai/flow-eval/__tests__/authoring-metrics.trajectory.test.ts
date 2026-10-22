// @file: Causal path mutations and comparable repeated-run controls for authoring experiments.
// @spec: AI-SKILLS
// @consumers: node:test; authoring benchmark protocol

import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  measureAuthoringPath,
  compareAuthoringExperiments,
  type AuthoringObservation,
} from '../authoring-metrics.ts';
import type { ToolEvent, Trajectory } from '../trajectory.ts';

const root = '/owned/sandbox';
const target = 'specs/demo/demo.spec.md';
function tool(i: number, name: string, arg?: string, command?: string): ToolEvent {
  return {
    type: 'tool',
    i,
    tool: name,
    arg,
    command,
    status: 'completed',
    exitCode: 0,
    messageId: `message-${i}`,
    callId: `call-${i}`,
    startedAt: i * 10,
    finishedAt: i * 10 + 5,
  };
}
function path(): Trajectory {
  return {
    scenario: 'scope-library',
    coverage: { complete: true, sessions: 1, reasons: [] },
    events: [
      tool(0, 'bash', undefined, 'npx --no-install gennady sdd-new library --scope demo'),
      tool(1, 'read', JSON.stringify({ filePath: './' + target })),
      tool(2, 'write', JSON.stringify({ filePath: target })),
      tool(3, 'bash', undefined, `npx --no-install gennady sdd-check --spec ${target} --authoring`),
    ],
  };
}
it('proves actual create/read/whole-write/check, not final checkpoint order', () => {
  const good = measureAuthoringPath(path(), target, root);
  assert.equal(good.pass, true, good.detail);
  assert.deepEqual(good.metrics, {
    tools: 4,
    targetReads: 1,
    repeatedTargetReads: 0,
    wholeWrites: 1,
    partialWrites: 0,
    failedTools: 0,
    checks: 1,
    outsideTargetWrites: 0,
    toolSpanMs: 35,
  });
  for (const remove of [0, 1, 2, 3]) {
    const broken = path();
    broken.events.splice(remove, 1);
    assert.equal(measureAuthoringPath(broken, target, root).pass, false, `remove event ${remove}`);
  }
});
it('rejects echoed/help/failed commands, overlapping operations and stale checks', () => {
  const opaque = path();
  opaque.events.push(tool(4, 'bash', undefined, 'python -c mutate_target_after_check'));
  assert.equal(measureAuthoringPath(opaque, target, root).pass, false);
  for (const command of [
    'echo npx gennady sdd-new library --scope demo',
    'npx gennady sdd-new --help',
    'npx gennady sdd-new library; echo success',
  ]) {
    const broken = path();
    (broken.events[0] as ToolEvent).command = command;
    assert.equal(measureAuthoringPath(broken, target, root).pass, false, command);
  }
  const failed = path();
  (failed.events[3] as ToolEvent).exitCode = 4;
  assert.equal(measureAuthoringPath(failed, target, root).pass, false);
  const overlap = path();
  (overlap.events[0] as ToolEvent).finishedAt = 100;
  assert.equal(measureAuthoringPath(overlap, target, root).pass, false);
  const stale = path();
  stale.events.push(tool(4, 'write', JSON.stringify({ filePath: target })));
  assert.equal(measureAuthoringPath(stale, target, root).pass, false);
});

it('rejects foreign executables, noncreating manifest/list calls and invalid/overlapping Write intervals', () => {
  for (const command of [
    '/tmp/fake/gennady sdd-new library --scope demo',
    'npx gennady sdd-new library --manifest',
    'npx gennady sdd-new --list',
    'npx --package=untrusted gennady sdd-new library --scope demo',
  ]) {
    const broken = path();
    (broken.events[0] as ToolEvent).command = command;
    assert.equal(measureAuthoringPath(broken, target, root).pass, false, command);
  }
  const inverted = path();
  (inverted.events[2] as ToolEvent).finishedAt = 19;
  assert.equal(measureAuthoringPath(inverted, target, root).pass, false);
  const concurrent = path();
  (concurrent.events[2] as ToolEvent).finishedAt = 100;
  const extra = tool(4, 'write', JSON.stringify({ filePath: target }));
  extra.startedAt = 26;
  extra.finishedAt = 27;
  concurrent.events.splice(3, 0, extra);
  assert.equal(measureAuthoringPath(concurrent, target, root).pass, false);
  for (const suffix of [' --scope other', ' --out=elsewhere', ' --manifest=true']) {
    const broken = path();
    (broken.events[0] as ToolEvent).command += suffix;
    assert.equal(
      measureAuthoringPath(broken, target, root, true, ['library', '--scope', 'demo']).pass,
      false
    );
  }
});
it('rejects partial traces, missing identities, wrong-path suffixes and partial/outside writes', () => {
  const partial = path();
  partial.coverage!.complete = false;
  assert.equal(measureAuthoringPath(partial, target, root).pass, false);
  const identity = path();
  delete (identity.events[1] as ToolEvent).callId;
  assert.equal(measureAuthoringPath(identity, target, root).pass, false);
  const foreign = path();
  (foreign.events[1] as ToolEvent).arg = JSON.stringify({ filePath: '/foreign/' + target });
  assert.equal(measureAuthoringPath(foreign, target, root).pass, false);
  for (const name of ['edit', 'apply_patch']) {
    const bad = path();
    bad.events.push(tool(4, name, JSON.stringify({ filePath: target })));
    assert.equal(measureAuthoringPath(bad, target, root).pass, false);
  }
  const extra = path();
  extra.events.push(tool(4, 'write', JSON.stringify({ filePath: 'unrelated.md' })));
  assert.equal(measureAuthoringPath(extra, target, root).pass, false);
});
it('does not invent an exact portal/index authoring CLI that the product does not provide', () => {
  const portal = path();
  portal.events.pop();
  assert.equal(measureAuthoringPath(portal, target, root).pass, false);
  assert.equal(measureAuthoringPath(portal, target, root, false).pass, true);
});

function observations(): AuthoringObservation[] {
  return ['baseline', 'candidate'].flatMap((variant) =>
    [1, 2, 3].map((repetition) => ({
      campaign: 'baseline-study',
      caseId: 'scope-library',
      variant,
      repetition,
      sourceCommit: (variant === 'baseline' ? 'a' : 'b').repeat(40),
      dirty: false,
      taskDigest: 'a'.repeat(64),
      oracleDigest: 'b'.repeat(64),
      harnessDigest: 'c'.repeat(64),
      environmentDigest: 'd'.repeat(64),
      environmentVerified: true,
      model: 'llm-proxy/deepseek-v4-flash',
      modelVerified: true,
      artifactPass: true,
      trajectoryPass: true,
      durationMs: variant === 'baseline' ? 3000 : 2000,
      nonCacheTokens: 100,
      metrics: measureAuthoringPath(path(), target, root).metrics,
    }))
  );
}
const compare = (rows: AuthoringObservation[]) =>
  compareAuthoringExperiments(rows, 'baseline', 'candidate', ['scope-library']);
it('compares all repeated observations and labels small-sample inference honestly', () => {
  const result = compare(observations());
  assert.equal(result.comparable, true, result.issues.join(';'));
  assert.equal(result.cases[0]!.candidate.medianDurationMs, 2000);
  assert.match(result.inference, /no.*statistical/);
  assert.equal(result.monetaryCost, 'unknown');
});
it('refuses missing repetitions, duplicate IDs, dirty/mixed source, changed oracle and model fallback', () => {
  assert.equal(compare(observations().slice(1)).comparable, false);
  for (const change of [
    (row: AuthoringObservation) => {
      row.repetition = 2;
    },
    (row: AuthoringObservation) => {
      row.dirty = true;
    },
    (row: AuthoringObservation) => {
      row.oracleDigest = 'f'.repeat(64);
    },
    (row: AuthoringObservation) => {
      row.sourceCommit = 'e'.repeat(40);
    },
    (row: AuthoringObservation) => {
      row.model = 'llm-proxy/deepseek-v4-pro';
    },
    (row: AuthoringObservation) => {
      row.modelVerified = false;
    },
    (row: AuthoringObservation) => {
      delete row.durationMs;
    },
  ]) {
    const rows = observations();
    change(rows[0]!);
    assert.equal(compare(rows).comparable, false);
  }
});
it('does not discard failed candidate observations to manufacture a speed win', () => {
  const rows = observations();
  rows[3]!.artifactPass = false;
  const result = compare(rows);
  assert.equal(result.comparable, true);
  assert.deepEqual(result.regressions, ['scope-library']);
  assert.equal(result.recommendation, 'reject');
  assert.equal(result.cases[0]!.candidate.runs, 3);
});
