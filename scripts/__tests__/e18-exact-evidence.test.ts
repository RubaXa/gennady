// @file: Causal UV-26 exact E-18 evidence/checker and host-first collector contract tests.
// @spec: INFRA-BASE
// @consumers: package audit:e18; UV-26 review evidence

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { checkE18Evidence, preflightE18Environment } from '../e18-exact-evidence.ts';

const fixturePath = resolve(import.meta.dirname, 'fixtures/e18-exact-evidence.valid.json');

function fixture(): Record<string, any> {
  const value = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, any>;
  const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
  const task = 'ai/tasks/cloud.task.T1.md';
  const phase = 'P3';
  const projectConfig = JSON.stringify({
    schema: 'gennady.e18-project.v1',
    workspace: value.project.workspace,
    scheme: value.project.scheme,
    destination: value.project.destination,
    coverageThresholdBasisPoints: 8000,
    coverageStepId: 'swift:coverage',
    xcresult: value.coverage.xcresult.path,
    sourceRoots: ['Sources'],
  });
  value.project.config = {
    path: 'config/e18-project.json',
    content: projectConfig,
    sha256: hash(projectConfig),
  };
  const attempt = {
    schema: 'gennady.sdd-verify-attempt.v1',
    runId: 'attempt-e18-001',
    sddPhase: phase,
    selector: 'coverage',
    state: 'PASS',
    startedAt: '2026-10-08T12:00:00.000Z',
    finishedAt: '2026-10-08T12:10:00.000Z',
    durationMs: 600000,
    reportState: 'complete',
    processes: [
      {
        stepId: 'swift:coverage',
        status: 'pass',
        exitCode: 0,
        durationMs: 300000,
        identity: 'cmd-xcodebuild',
        startedAt: '2026-10-08T12:04:00.000Z',
        finishedAt: '2026-10-08T12:09:00.000Z',
        termination: 'completed',
        signal: null,
      },
    ],
    trust: { level: 'remote-provider', source: 'ci', resolved: true },
  };
  const rawAttempt = Buffer.from(JSON.stringify(attempt)).toString('base64url');
  Object.assign(value.execution.attempt, {
    task,
    phase,
    rawEvidence: rawAttempt,
    rawEvidenceDigest: hash(rawAttempt),
  });
  const signature = 'sha256:' + '4'.repeat(64);
  value.execution.groupState = { members: ['cloud.task.T1.md'], signature };
  value.execution.artifact = { path: 'Sources/App/App.swift', sha256: '5'.repeat(64) };
  for (const receipt of value.execution.groupReceipts) {
    const raw = JSON.stringify({
      schema: 1,
      kind: receipt.kind,
      group: 'specs/cloud.spec.md',
      members: ['cloud.task.T1.md'],
      gitRef: value.cloudIos.headSha,
      verdict: 'PASS',
      ts: '2026-10-08T12:10:00.000Z',
      signature,
    });
    receipt.raw = raw;
    receipt.digest = hash(raw);
  }
  const watcher = {
    state: 'REMOTE_SUCCESS',
    pipelineId: value.remote.pipelineId,
    proof: {
      schema: 'gennady.verify-remote-proof.v1',
      provider: value.remote.provider,
      project: 'example/cloud-ios',
      definitionId: value.remote.pipelineDefinitionId,
      sourceSha: value.remote.exactSha,
      pipelineId: value.remote.pipelineId,
      pipelineSha: value.remote.exactSha,
      rawStatus: 'success',
      terminalState: 'REMOTE_SUCCESS',
      observedAt: value.remote.observedAt,
      jobs: value.remote.jobs.map((job: { id: string; name: string }) => ({
        ...job,
        rawStatus: 'success',
      })),
    },
    evidence: [],
    message: 'success',
  };
  value.remote.rawWatcher = JSON.stringify(watcher);
  value.remote.rawWatcherDigest = hash(value.remote.rawWatcher);
  const xccov = JSON.stringify({
    targets: [
      {
        name: 'CloudIOS',
        files: [
          {
            path: 'Sources/App/App.swift',
            coveredLines: 90,
            executableLines: 100,
          },
        ],
      },
    ],
  });
  value.coverage.xccov.payload = xccov;
  value.coverage.xccov.sha256 = hash(xccov);
  const argvByRole: Record<string, string[]> = {
    'cloud-ios-execute': ['gennady', 'sdd-verify', '--task', task, '--phase', phase],
    'remote-observe': [
      'gennady:remote-watcher',
      value.remote.provider,
      value.remote.exactSha,
      value.remote.pipelineId,
    ],
    'xcodebuild-coverage': [
      'xcodebuild',
      '-workspace',
      value.project.workspace,
      '-scheme',
      value.project.scheme,
      '-destination',
      value.project.destination,
      '-enableCodeCoverage',
      'YES',
      '-resultBundlePath',
      value.coverage.xcresult.path,
      'test',
    ],
    'xccov-export': ['xcrun', 'xccov', 'view', '--report', '--json', value.coverage.xcresult.path],
  };
  for (const command of value.execution.commands) {
    if (command.role === 'cloud-ios-execute') command.id = 'attempt-e18-001';
    command.argv = argvByRole[command.role];
    command.argvIdentity = hash(command.argv.join('\u0000'));
    command.log.content = command.role === 'xccov-export' ? xccov : `${command.role} PASS`;
    command.log.bytes = Buffer.byteLength(command.log.content);
    command.log.sha256 = hash(command.log.content);
    command.log.truncated = false;
  }
  return value;
}

function check(value: unknown, tree = '1212121212121212121212121212121212121212') {
  return checkE18Evidence(value, { resolveTree: () => tree });
}

function expectInvalid(value: unknown, pattern: RegExp): void {
  const report = check(value);
  assert.equal(report.ok, false);
  assert.equal(report.derivedStatus, 'INVALID');
  assert.match(report.issues.join('\n'), pattern);
}

describe('UV-26 exact E-18 evidence', () => {
  it('accepts one frozen real-shape terminal projection and derives PASS', () => {
    const report = check(fixture());
    assert.deepEqual(report.issues, []);
    assert.equal(report.ok, true);
    assert.equal(report.derivedStatus, 'PASS');
    assert.equal(report.sourceCommit, '1111111111111111111111111111111111111111');
    assert.equal(report.cloudIosSha, '3333333333333333333333333333333333333333');
    assert.equal(report.pipelineId, 'pipeline-8001');
  });

  it('rejects a fabricated authored PASS without terminal facts', () => {
    expectInvalid(
      {
        schema: 'gennady.e18-exact-evidence.v2',
        sourceCommit: '1'.repeat(40),
        status: 'PASS',
        environment: 'cloud-ios',
      },
      /keys must be exactly/u
    );
  });

  it('rejects wrong Gennady source tree identity', () => {
    const report = check(fixture(), 'f'.repeat(40));
    assert.equal(report.ok, false);
    assert.match(report.issues.join('\n'), /treeSha does not match sourceCommit tree/u);
  });

  it('rejects dirty/wrong cloud-ios identity and wrong remote exact SHA', () => {
    const dirty = fixture();
    dirty.cloudIos.clean = false;
    expectInvalid(dirty, /cloudIos\.clean must be true/u);

    const wrongSha = fixture();
    wrongSha.remote.exactSha = 'f'.repeat(40);
    expectInvalid(wrongSha, /normalized fields do not match embedded watcher payload/u);
  });

  it('rejects nonterminal or unpinned pipeline evidence', () => {
    const pending = fixture();
    pending.remote.status = 'pending';
    expectInvalid(pending, /remote\.status must be success/u);

    const missingPipeline = fixture();
    missingPipeline.remote.pipelineId = '';
    expectInvalid(missingPipeline, /normalized fields do not match embedded watcher payload/u);
  });

  it('rejects stale xcresult and wrong xccov command identity', () => {
    const stale = fixture();
    stale.coverage.xcresult.createdAt = '2026-10-08T11:59:59.000Z';
    expectInvalid(stale, /xcresult is stale/u);

    const wrongCommand = fixture();
    wrongCommand.coverage.xccov.commandId = 'cmd-execute';
    expectInvalid(wrongCommand, /must bind xccov command/u);
  });

  it('binds xcodebuild evidence to reviewed config and the runner-owned process', () => {
    const wrongProcess = fixture();
    const attempt = JSON.parse(
      Buffer.from(wrongProcess.execution.attempt.rawEvidence, 'base64url').toString('utf8')
    );
    attempt.processes[0].identity = 'different-process';
    wrongProcess.execution.attempt.rawEvidence = Buffer.from(JSON.stringify(attempt)).toString(
      'base64url'
    );
    wrongProcess.execution.attempt.rawEvidenceDigest = createHash('sha256')
      .update(wrongProcess.execution.attempt.rawEvidence)
      .digest('hex');
    expectInvalid(wrongProcess, /runner-owned coverage process/u);

    const wrongConfig = fixture();
    const projectConfig = JSON.parse(wrongConfig.project.config.content);
    projectConfig.xcresult = 'build/Other.xcresult';
    wrongConfig.project.config.content = JSON.stringify(projectConfig);
    wrongConfig.project.config.sha256 = createHash('sha256')
      .update(wrongConfig.project.config.content)
      .digest('hex');
    expectInvalid(wrongConfig, /xcresult\.path does not match reviewed project config/u);
  });

  it('rejects duplicate coverage paths, malformed totals and threshold failure', () => {
    const duplicates = fixture();
    duplicates.coverage.sources.push({ ...duplicates.coverage.sources[0] });
    duplicates.coverage.totals = { coveredLines: 180, executableLines: 200 };
    expectInvalid(duplicates, /sources must be unique/u);

    const totals = fixture();
    totals.coverage.totals.coveredLines = 89;
    expectInvalid(totals, /totals must equal/u);

    const threshold = fixture();
    threshold.coverage.thresholdBasisPoints = 9500;
    expectInvalid(threshold, /threshold does not match embedded reviewed config/u);

    const downgrade = fixture();
    downgrade.coverage.thresholdBasisPoints = 0;
    expectInvalid(downgrade, /threshold does not match embedded reviewed config/u);
  });

  it('rejects missing R-COMPLETE/group receipt and failed process facts', () => {
    const receipt = fixture();
    receipt.execution.attempt.resultReceipt = 'R-PARTIAL';
    expectInvalid(receipt, /resultReceipt must be R-COMPLETE/u);

    const group = fixture();
    group.execution.groupReceipts.pop();
    expectInvalid(group, /must contain audit and review/u);

    const command = fixture();
    command.execution.commands[0].exitCode = 1;
    expectInvalid(command, /requires every observed command to exit 0/u);
  });

  it('bounds logs and rejects secret-like/absolute developer projections', () => {
    const oversized = fixture();
    oversized.execution.commands[0].log.bytes = 65537;
    expectInvalid(oversized, /log\.bytes does not match embedded content/u);

    const secret = fixture();
    secret.remote.jobs[0].name = 'Bearer ghp_super-secret';
    const watcher = JSON.parse(secret.remote.rawWatcher);
    watcher.proof.jobs[0].name = secret.remote.jobs[0].name;
    secret.remote.rawWatcher = JSON.stringify(watcher);
    secret.remote.rawWatcherDigest = createHash('sha256')
      .update(secret.remote.rawWatcher)
      .digest('hex');
    expectInvalid(secret, /secret-like value/u);

    const absolute = fixture();
    absolute.coverage.sources[0].path = '/Users/example/App.swift';
    expectInvalid(absolute, /repo-relative/u);
  });

  it('rejects authored argv substitution and normalized/raw remote disagreement', () => {
    const argv = fixture();
    argv.execution.commands[2].argv[2] = 'Other.xcworkspace';
    expectInvalid(argv, /argvIdentity does not match embedded argv/u);

    const rehashed = fixture();
    rehashed.execution.commands[2].argv[2] = 'Other.xcworkspace';
    rehashed.execution.commands[2].argvIdentity = createHash('sha256')
      .update(rehashed.execution.commands[2].argv.join('\u0000'))
      .digest('hex');
    expectInvalid(rehashed, /xcodebuild-coverage argv is not canonical/u);

    const remote = fixture();
    const parsed = JSON.parse(remote.remote.rawWatcher);
    parsed.proof.pipelineId = 'different-pipeline';
    remote.remote.rawWatcher = JSON.stringify(parsed);
    remote.remote.rawWatcherDigest = createHash('sha256')
      .update(remote.remote.rawWatcher)
      .digest('hex');
    expectInvalid(remote, /normalized fields do not match embedded watcher payload/u);
  });
});

describe('UV-26 host-first collector preflight', () => {
  it('rejects macOS 14 before Xcode, Tuist, project, network or write observations', () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    assert.throws(
      () =>
        preflightE18Environment('/must-not-be-read', {
          platform: 'darwin',
          run: (_cwd, command, args) => {
            calls.push({ command, args });
            return { status: 0, stdout: '14.8.5\n', stderr: '' };
          },
        }),
      /E18_ENV_MACOS_UNSUPPORTED/u
    );
    assert.deepEqual(calls, [{ command: 'sw_vers', args: ['-productVersion'] }]);
  });

  it('rejects absent Tuist after proving macOS and Xcode identities', () => {
    const calls: string[] = [];
    assert.throws(
      () =>
        preflightE18Environment('/must-not-be-read', {
          platform: 'darwin',
          run: (_cwd, command) => {
            calls.push(command);
            if (command === 'sw_vers') return { status: 0, stdout: '15.2\n', stderr: '' };
            if (command === 'xcodebuild')
              return { status: 0, stdout: 'Xcode 16.2\nBuild version 16C5032a\n', stderr: '' };
            if (command === 'xcode-select')
              return {
                status: 0,
                stdout: '/Applications/Xcode.app/Contents/Developer\n',
                stderr: '',
              };
            return { status: 127, stdout: '', stderr: 'tuist not found' };
          },
        }),
      /E18_ENV_TUIST_UNAVAILABLE/u
    );
    assert.deepEqual(calls, ['sw_vers', 'xcodebuild', 'xcode-select', 'tuist']);
  });
});
