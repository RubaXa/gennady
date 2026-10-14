// @file: Causal command identity contracts shared by runner, report and journal.
// @spec: CLI-VERIFY
// @consumers: CI

import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { VerifyRunReport } from '../model/verify-report.type.ts';
import { projectVerifyReport } from '../reporting/report-safety.ts';
import {
  createVerifyCommandIdentity,
  createRepositoryRootCommandIdentity,
} from '../reporting/command-identity.ts';

it('binds argv boundaries, cwd, environment overrides and effective timeout deterministically', () => {
  const command = {
    argv: ['xcodebuild', '-scheme', 'App'],
    cwd: '/repo',
    env: { B: '2', A: '1' },
    timeoutMs: 1_000,
  };
  const identity = createVerifyCommandIdentity(command, '/repo');
  assert.match(identity, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    identity,
    createVerifyCommandIdentity({ ...command, cwd: '/other', env: { A: '1', B: '2' } }, '/other')
  );
  assert.equal(identity, createRepositoryRootCommandIdentity(command));
  for (const changed of [
    { ...command, argv: ['xcodebuild', '-scheme', 'Other'] },
    { ...command, argv: ['xcodebuild', '-scheme App'] },
    { ...command, cwd: '/repo/subdir' },
    { ...command, env: { A: '1', B: 'different' } },
    { ...command, timeoutMs: 2_000 },
  ])
    assert.notEqual(identity, createVerifyCommandIdentity(changed, '/repo'));
  const bare = { argv: command.argv, cwd: command.cwd, timeoutMs: command.timeoutMs };
  assert.equal(
    createVerifyCommandIdentity(bare, '/repo'),
    createVerifyCommandIdentity({ ...bare, env: {} }, '/repo')
  );
});

it('projects the same effective command identity without exposing argv/env and safely reports invalid cwd', () => {
  const root = '/repo';
  const command = {
    argv: ['node', '--secret=hidden'],
    cwd: root,
    env: { PRIVATE_VALUE: 'hidden' },
    timeoutMs: 2_000,
  };
  const rules = { digest: `sha256:${'a'.repeat(64)}`, required: [], suggested: [], skipped: [] };
  const report: VerifyRunReport = {
    context: {
      request: { root, phase: 'unit', scope: { mode: 'files', files: [] } },
      plugins: ['node'],
      frameworks: [],
      headSha: '1'.repeat(40),
      rules,
    },
    readiness: { status: 'READY', entries: [] },
    plan: {
      phase: 'unit',
      trust: { level: 'local-runner', source: 'test' },
      steps: [
        {
          id: 'node:unit',
          plugin: 'node',
          tags: ['unit'],
          needs: [],
          executor: 'local',
          effect: 'observe',
          command,
          requires: [],
          timeoutMs: 1_000,
          onFailure: 'stop-phase',
        },
      ],
    },
    results: [],
    mutations: [],
    evidence: [],
    rules,
    verdict: 'pass',
  };
  const projected = projectVerifyReport(report, root, false) as any;
  assert.equal(
    projected.plan.steps[0].command.identity,
    createVerifyCommandIdentity({ ...command, timeoutMs: 1_000 }, root)
  );
  assert.equal(projected.plan.steps[0].command.timeoutMs, 1_000);
  assert.equal(JSON.stringify(projected).includes('hidden'), false);
  const invalid = {
    ...report,
    plan: {
      ...report.plan,
      steps: report.plan.steps.map((step) => ({
        ...step,
        command: { ...command, cwd: '/outside' },
      })),
    },
  };
  const invalidProjection = projectVerifyReport(invalid, root, false) as any;
  assert.equal(invalidProjection.plan.steps[0].command.cwd, '<external>');
  assert.notEqual(
    invalidProjection.plan.steps[0].command.identity,
    projected.plan.steps[0].command.identity
  );
});
