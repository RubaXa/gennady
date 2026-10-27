// @file: Pure saved-tool profiler controls; no filesystem, model or network access.
// @spec: AI-SKILLS
// @consumers: offline authoring analysis; profileAuthoringTrajectory

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { profileAuthoringTrajectory } from '../authoring-trajectory-profile.ts';
import type { ToolEvent, Trajectory, TrajectoryEvent } from '../trajectory.ts';
import type { SddEvalUsage } from '../types.ts';

const context = {
  caseId: 'module-flat',
  target: 'specs/demo/run/run.spec.md',
  directory: '/owned/sandbox',
};
function tool(i: number, name: string, args: unknown, command?: string): ToolEvent {
  return {
    type: 'tool',
    i,
    tool: name,
    arg: JSON.stringify(args),
    command,
    callId: `call_${i}`,
    messageId: `msg_${i}`,
    sessionId: 'root',
    status: 'completed',
    startedAt: i * 10,
    finishedAt: i * 10 + 5,
    ...(name === 'bash' ? { exitCode: 0 } : {}),
  };
}
const read = (i: number, path: string) => tool(i, 'read', { filePath: path });
const bash = (i: number, command: string, extra: Record<string, unknown> = {}) =>
  tool(i, 'bash', { command, cwd: '.', ...extra }, command);
function profile(events: TrajectoryEvent[], complete = true) {
  const trajectory: Trajectory = {
    scenario: 'saved',
    coverage: { complete, sessions: 1, reasons: [] },
    events,
  };
  const before = JSON.stringify(trajectory);
  const result = profileAuthoringTrajectory(trajectory, context);
  assert.equal(JSON.stringify(trajectory), before, 'pure: never mutate saved evidence');
  assert.deepEqual(result, profileAuthoringTrajectory(trajectory, context), 'deterministic');
  return result;
}

it('profiles ordered calls, exact safe Bash, categories, paths and IDs without exporting tool bodies', () => {
  const result = profile([
    read(0, 'ai/directives/sdd-v2/module.directive.xml'),
    read(1, 'ai/directives/sdd-v2/formats/module-spec-structure.xml'),
    read(2, 'shared/sdd/templates.ts'),
    read(3, 'manifest.json'),
    read(4, context.target),
    bash(5, 'npx --no-install gennady sdd-new module --manifest'),
    bash(6, 'npx --no-install gennady sdd-new module --scope demo --module run'),
    tool(7, 'write', {
      filePath: context.target,
      content: 'PRIVATE_WRITE_BODY',
      env: { SECRET: 'PRIVATE_ENV' },
    }),
    bash(8, `npx --no-install gennady sdd-check --spec ${context.target} --authoring`),
    tool(9, 'glob', { pattern: '**/*.xml' }),
  ]);
  assert.equal(result.captureComplete, true);
  assert.equal(result.classificationComplete, true);
  assert.equal(result.toolHistogram.read, 5);
  assert.equal(result.toolHistogram.bash, 3);
  assert.deepEqual(
    result.calls.map((c) => c.category),
    [
      'directive',
      'format',
      'template',
      'manifest',
      'target',
      'manifest',
      'create',
      'target',
      'check',
      'discovery',
    ]
  );
  assert.equal(
    result.calls[8]!.command,
    `npx --no-install gennady sdd-check --spec ${context.target} --authoring`
  );
  assert.equal(result.calls[8]!.cliVerb, 'sdd-check');
  assert.equal(result.calls[8]!.callId, 'call_8');
  assert.deepEqual(result.writePaths, [{ path: context.target, orders: [7] }]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /PRIVATE_WRITE_BODY|PRIVATE_ENV|"(?:pattern|content|env)":/
  );
  assert.equal(result.cliVerbHistogram['sdd-new'], 2);
});

it('reports repeats and adjacent temporal batching only as observations, not intent or proven waste', () => {
  const result = profile([read(0, 'docs/one.md'), read(1, 'docs/one.md'), read(2, 'docs/two.md')]);
  assert.deepEqual(result.repeatReads, [{ path: 'docs/one.md', orders: [0, 1] }]);
  assert.equal(result.redundantReadOpportunities.length, 1);
  assert.equal(result.possibleBatchingCandidates.length, 1);
  assert.match(
    result.redundantReadOpportunities[0]!.reason,
    /ranges\/content stability are unknown/
  );
  assert.match(
    result.possibleBatchingCandidates[0]!.reason,
    /dependencies\/tool batch support are unknown/
  );
});

it('overlap, foreign sessions, writes, checkpoints, opaque calls and incomplete capture are barriers', () => {
  for (const events of [
    [read(0, 'docs/one.md'), { ...read(1, 'docs/two.md'), startedAt: 1 }],
    [read(0, 'docs/one.md'), { ...read(1, 'docs/two.md'), sessionId: 'child' }],
    [read(0, 'docs/one.md'), tool(1, 'write', { filePath: 'docs/two.md' }), read(2, 'docs/two.md')],
    [
      read(0, 'docs/one.md'),
      { type: 'checkpoint' as const, i: 1, id: 'probe', cmd: 'arbitrary', exit: 0, green: true },
      read(2, 'docs/two.md'),
    ],
    [read(0, 'docs/one.md'), bash(1, 'cd . && cat docs/two.md'), read(2, 'docs/two.md')],
  ])
    assert.equal(profile(events).possibleBatchingCandidates.length, 0);
  assert.equal(
    profile([read(0, 'docs/one.md'), read(1, 'docs/two.md')], false).possibleBatchingCandidates
      .length,
    0
  );
});

it('malformed/truncated/missing arguments and unsafe paths remain unknown, never guessed from suffixes', () => {
  const result = profile([
    { ...read(0, context.target), arg: '{"filePath":"specs/demo' },
    { ...read(1, context.target), arg: undefined },
    read(2, '/other/sandbox/' + context.target),
    read(3, '../../private.md'),
    tool(4, 'read', { filePath: 3 }),
    { ...read(5, context.target), arg: '[]' },
  ]);
  assert.equal(result.captureComplete, true);
  assert.equal(result.classificationComplete, false);
  assert.equal(result.readTargets.length, 0);
  assert.equal(
    result.calls.every((c) => !c.path && c.category === 'unknown'),
    true
  );
  assert.doesNotMatch(JSON.stringify(result), /other\/sandbox|private\.md/);
});

it('duplicate identities remain counted and flagged, and cannot create temporal opportunities', () => {
  const left = read(0, 'docs/one.md');
  const right = { ...left, startedAt: 10, finishedAt: 15 };
  const result = profile([left, right]);
  assert.equal(result.totalToolEvents, 2);
  assert.equal(result.toolHistogram.read, 2);
  assert.equal(
    result.calls.every((c) => c.issues.includes('duplicate-identity')),
    true
  );
  assert.equal(result.redundantReadOpportunities.length, 0);
  assert.equal(
    profile([left, { ...right, messageId: 'different-message' }]).calls[1]!.issues.includes(
      'duplicate-identity'
    ),
    true
  );
  assert.equal(profile([{ ...left, callId: undefined }]).classificationComplete, false);
});

it('does not infer direct CLI verbs from opaque shell, prose, foreign cwd or interpreter payloads', () => {
  for (const command of [
    'echo npx gennady sdd-check --spec fake --authoring',
    'cd . && npx gennady sdd-check --spec fake --authoring',
    "node -e \"require('child_process').execSync('gennady sdd-check')\"",
    '/tmp/foreign/gennady sdd-check --spec fake --authoring',
    'npx --package=untrusted gennady sdd-check --spec fake',
  ]) {
    const call = profile([bash(0, command)]).calls[0]!;
    assert.equal(call.cliVerb, undefined, command);
    assert.equal(call.category, 'unknown');
  }
  const call = profile([bash(0, 'gennady sdd-check --spec fake', { workdir: '/other' })]).calls[0]!;
  assert.equal(call.cliVerb, undefined);
  assert.ok(call.issues.includes('missing-or-foreign-command-directory'));
  const conflict = profile([
    { ...bash(0, 'gennady sdd-check --spec fake'), arg: JSON.stringify({ command: 'pwd' }) },
  ]).calls[0]!;
  assert.equal(conflict.cliVerb, undefined);
  assert.ok(conflict.issues.includes('conflicting-command'));
});

it('help/list/manifest are not creation/check work, and failed CLI attempts retain their actual exit', () => {
  const result = profile([
    bash(0, 'gennady sdd-new --list'),
    bash(1, 'gennady sdd-check --help'),
    bash(2, 'gennady sdd-new module --manifest'),
    { ...bash(3, 'gennady sdd-check --spec fake --authoring'), status: 'error', exitCode: 4 },
  ]);
  assert.deepEqual(
    result.calls.map((c) => c.category),
    ['discovery', 'discovery', 'manifest', 'check']
  );
  assert.equal(result.calls[3]!.exitCode, 4);
  assert.equal(result.calls[3]!.status, 'error');
});

it('redacts secret flags and withholds env, heredoc and inline source bodies rather than leaking them', () => {
  const secret = 'DUMMY_PRIVATE_CREDENTIAL_123';
  const result = profile([
    bash(0, `gennady sdd-check --token ${secret} --spec fake`),
    bash(1, `AUTH_TOKEN=${secret} gennady sdd-check --spec fake`),
    bash(2, `cat > fake <<EOF\nFULL_WRITE_BODY_${secret}\nEOF`),
    bash(3, `node -e 'FULL_WRITE_BODY_${secret}'`),
    tool(4, 'write', { filePath: context.target, content: secret, env: { KEY: secret } }),
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /DUMMY_PRIVATE_CREDENTIAL|FULL_WRITE_BODY|AUTH_TOKEN|"env"/
  );
  assert.match(result.calls[0]!.command!, /\[redacted\]/);
  for (const call of result.calls.slice(1, 4)) assert.equal(call.commandWithheld, true);
});

it('caps output and does not interpret a truncated command as a direct invocation', () => {
  const command = 'gennady sdd-check ' + 'x'.repeat(17000);
  const result = profile([
    bash(0, command),
    ...Array.from({ length: 520 }, (_, i) => read(i + 1, 'docs/one.md')),
  ]);
  assert.equal(result.calls.length, 512);
  assert.equal(result.omittedToolEvents, 9);
  assert.equal(result.captureComplete, false);
  assert.equal(result.classificationComplete, false);
  assert.equal(result.calls[0]!.cliVerb, undefined);
  assert.ok(result.calls[0]!.command!.length <= 4096);
  assert.ok(result.calls[0]!.issues.includes('truncated-or-redacted-command'));
  assert.equal(result.possibleBatchingCandidates.length, 0);
});

it('keeps observed assistant-message and token counters separated by role, never claiming HTTP calls', () => {
  const usage: SddEvalUsage = {
    messages: 7,
    input: 1,
    output: 2,
    reasoning: 3,
    cacheRead: 4,
    cacheWrite: 5,
    total: 6,
    cost: 0,
    complete: true,
    models: ['llm-proxy/deepseek-v4-flash'],
  };
  const trajectory: Trajectory = {
    scenario: 'saved',
    events: [],
    coverage: { complete: true, sessions: 1, reasons: [] },
  };
  const result = profileAuthoringTrajectory(trajectory, context, {
    worker: usage,
    judge: { ...usage, messages: 2 },
    reflection: { ...usage, messages: -1 },
  });
  assert.equal(result.usageByRole.worker!.assistantMessagesObserved, 7);
  assert.equal(result.usageByRole.judge!.assistantMessagesObserved, 2);
  assert.deepEqual(result.usageByRole.worker!.models, ['llm-proxy/deepseek-v4-flash']);
  assert.equal(result.usageByRole.reflection!.assistantMessagesObserved, undefined);
  assert.equal(result.usageByRole.reflection!.complete, false);
  assert.equal(Object.hasOwn(result, 'httpRequests'), false);
  assert.match(result.limitations.join(' '), /not HTTP requests/);
});

it('histogram keys cannot access inherited object properties', () => {
  const result = profile([tool(0, 'constructor', {})]);
  assert.equal(result.toolHistogram.constructor, 1);
  assert.equal(result.captureComplete, true);
  assert.equal(result.classificationComplete, false);
});

it('conflicting path aliases and nonterminal calls do not qualify as known reads', () => {
  const result = profile([
    tool(0, 'read', { filePath: 'docs/one.md', path: 'docs/two.md' }),
    { ...read(1, 'docs/one.md'), status: 'running' },
    read(2, 'docs/two.md'),
  ]);
  assert.equal(result.calls[0]!.path, undefined);
  assert.ok(result.calls[0]!.issues.includes('conflicting-paths'));
  assert.equal(result.classificationComplete, false);
  assert.equal(result.possibleBatchingCandidates.length, 0);
});

it('opaque classification does not relabel complete capture as missing evidence', () => {
  const result = profile([bash(0, 'cd . && pwd')]);
  assert.equal(result.captureComplete, true);
  assert.equal(result.classificationComplete, false);
  assert.equal(profile([read(0, context.target)], false).captureComplete, false);
  assert.match(result.limitations.join(' '), /groups count observed attempts/);
});
