// @file: Causal UV-26 exact E-18 evidence/checker and host-first collector contract tests.
// @spec: INFRA-BASE
// @consumers: package audit:e18; UV-26 review evidence

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  createRepositoryRootCommandIdentity,
  createVerifyCommandIdentity,
} from '../../shared/verify/reporting/command-identity.ts';
import {
  runWithSddAttemptJournal,
  validateCurrentSddPhaseAttempt,
} from '../../shared/sdd/verify/sdd-attempt-journal.ts';
import { buildGroupReceipt, upsertGroupReceipt } from '../../shared/sdd/group-receipt.ts';
import { executeLocalStep } from '../../shared/verify/execution/local.executor.ts';
import { acquireWorkspaceGuard } from '../../shared/verify/execution/workspace-guard.ts';
import type { VerifyRunReport } from '../../shared/verify/model/verify-report.type.ts';
import type { PlannedVerifyStep } from '../../shared/verify/model/verify-step.type.ts';
import type { RemotePipelineObserver } from '../../shared/verify/execution/remote-watcher.ts';
import {
  checkE18Evidence,
  collectE18Evidence,
  preflightE18Environment,
} from '../e18-exact-evidence.ts';

const fixturePath = resolve(import.meta.dirname, 'fixtures/e18-exact-evidence.valid.json');

function fixture(): Record<string, any> {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, any>;
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
  it('rejects an arbitrary cloud-ios base even when all other evidence is valid', () => {
    const value = fixture();
    value.cloudIos.baseSha = '2'.repeat(40);
    expectInvalid(value, /immutable reviewed cloud-ios base/);
  });

  it('fails closed for historical/malformed identities and non-reviewed cwd/env/timeout after rehash', () => {
    const canonicalArgv = fixture().execution.commands[2].argv;
    const identities = [
      undefined,
      'sha256:malformed',
      createRepositoryRootCommandIdentity({
        argv: canonicalArgv,
        env: { DEVELOPER_DIR: '/Applications/Other.app/Contents/Developer' },
        timeoutMs: 5_400_000,
      }),
      createRepositoryRootCommandIdentity({ argv: canonicalArgv, timeoutMs: 1_000 }),
      createVerifyCommandIdentity(
        { argv: canonicalArgv, cwd: '/repo/subdir', timeoutMs: 5_400_000 },
        '/repo'
      ),
    ];
    for (const commandIdentity of identities) {
      const value = fixture();
      const attempt = JSON.parse(
        Buffer.from(value.execution.attempt.rawEvidence, 'base64url').toString('utf8')
      );
      if (commandIdentity === undefined) delete attempt.processes[0].commandIdentity;
      else attempt.processes[0].commandIdentity = commandIdentity;
      value.execution.attempt.rawEvidence = Buffer.from(JSON.stringify(attempt)).toString(
        'base64url'
      );
      value.execution.attempt.rawEvidenceDigest = createHash('sha256')
        .update(value.execution.attempt.rawEvidence)
        .digest('hex');
      expectInvalid(value, /commandIdentity|command identity/);
    }
    const stale = fixture();
    stale.execution.attempt.currentWorktreeDigest = `sha256:${'f'.repeat(64)}`;
    expectInvalid(stale, /worktreeDigest must match/);
  });
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

  it('rejects a self-consistent PASS attempt whose executed xcode command was different', () => {
    const value = fixture();
    const attempt = JSON.parse(
      Buffer.from(value.execution.attempt.rawEvidence, 'base64url').toString('utf8')
    );
    attempt.processes[0].commandIdentity = createRepositoryRootCommandIdentity({
      argv: [
        'xcodebuild',
        '-workspace',
        'Other.xcworkspace',
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
      timeoutMs: 5_400_000,
    });
    value.execution.attempt.rawEvidence = Buffer.from(JSON.stringify(attempt)).toString(
      'base64url'
    );
    value.execution.attempt.rawEvidenceDigest = createHash('sha256')
      .update(value.execution.attempt.rawEvidence)
      .digest('hex');
    expectInvalid(value, /runner-owned coverage command identity does not match/u);
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

describe('UV-26 durable journal collector lifecycle', () => {
  async function lifecycle(
    drift?: 'before' | 'watch-head' | 'watch-bundle' | 'watch-config' | 'wrong-command'
  ) {
    const sandbox = fs.realpathSync(fs.mkdtempSync(resolve(os.tmpdir(), 'e18-lifecycle-')));
    const cloud = resolve(sandbox, 'cloud');
    const gennady = resolve(sandbox, 'gennady');
    const bin = resolve(sandbox, 'bin');
    const oldPath = process.env.PATH;
    const git = (root: string, ...args: string[]) =>
      execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        encoding: 'utf8',
      }).trim();
    const put = (root: string, name: string, content: string) => {
      fs.mkdirSync(resolve(root, name, '..'), { recursive: true });
      fs.writeFileSync(resolve(root, name), content);
    };
    const output = resolve(gennady, 'ai/flow-eval/.baseline/e18-exact-evidence.json');
    try {
      for (const root of [cloud, gennady]) {
        fs.mkdirSync(root);
        git(root, 'init', '-q', '-b', 'main');
      }
      put(gennady, 'ai/flow-eval/.baseline/.gitkeep', '');
      git(gennady, 'add', '.');
      git(gennady, 'commit', '-qm', 'product');
      const value = fixture();
      const project = JSON.parse(value.project.config.content);
      const task = 'ai/tasks/cloud.task.T1.md';
      const spec = 'specs/cloud.spec.md';
      const ticket =
        '# Task\n<!--SECTION:META-->\n- **Status:** [x] DONE\n<!--/SECTION:META-->\n<!--SECTION:PHASES_OVERVIEW-->\n| ID | Kind | Deps | Status |\n|---|---|---|---|\n| P3 | unit | — | [x] |\n<!--/SECTION:PHASES_OVERVIEW-->\n<!--SECTION:PHASE_P3-->\n### P3\n- **Target Files:**\n  - Sources/App/App.swift\n- **Deleted Files:**\n  - none\n<!--/SECTION:PHASE_P3-->\n<!--SECTION:EXECUTION_LOG-->\n<!--/SECTION:EXECUTION_LOG-->\n';
      put(cloud, task, ticket);
      put(cloud, 'Sources/App/App.swift', 'public let value = 1\n');
      put(cloud, '.mise.toml', '[tools]\ntuist = "4.202.0"\n');
      put(cloud, '.gitignore', 'build/\n');
      put(cloud, 'config/e18-project.json', value.project.config.content);
      put(cloud, `${project.workspace}/contents.xcworkspacedata`, '<Workspace/>');
      let specContent = '# Cloud\n';
      for (const kind of ['audit', 'review'] as const) {
        const receipt = buildGroupReceipt(
          kind,
          spec,
          [{ file: task, content: ticket }],
          '1'.repeat(40),
          'PASS',
          new Date().toISOString()
        );
        assert.equal(receipt.ok, true);
        if (receipt.ok) specContent = upsertGroupReceipt(specContent, receipt.receipt);
      }
      put(cloud, spec, specContent);
      git(cloud, 'add', '.');
      git(cloud, 'commit', '-qm', 'reviewed product/config/receipts');
      const verifiedHead = git(cloud, 'rev-parse', 'HEAD');
      fs.mkdirSync(bin);
      put(
        bin,
        'xcodebuild',
        `#!${process.execPath}\nconst fs = require('node:fs'); const args = process.argv.slice(2); const result = args[args.indexOf('-resultBundlePath') + 1]; fs.mkdirSync(result, {recursive:true}); fs.writeFileSync(result + '/Data', 'observed test output');\n`
      );
      fs.chmodSync(resolve(bin, 'xcodebuild'), 0o755);
      process.env.PATH = `${bin}:${oldPath}`;
      const argv = value.execution.commands.find(
        (command: any) => command.role === 'xcodebuild-coverage'
      ).argv;
      if (drift === 'wrong-command') argv[2] = 'Other.xcworkspace';
      const step: PlannedVerifyStep = {
        id: 'swift:coverage',
        plugin: 'swift',
        tags: ['coverage'],
        needs: [],
        executor: 'local',
        effect: 'observe',
        command: { argv, cwd: cloud, timeoutMs: project.coverageTimeoutMs },
        requires: [],
        timeoutMs: project.coverageTimeoutMs,
        onFailure: 'stop-phase',
      };
      const outcome = await runWithSddAttemptJournal({
        root: cloud,
        ticketPath: resolve(cloud, task),
        sddPhase: 'P3',
        run: async () => {
          const acquired = acquireWorkspaceGuard(cloud, { signalHandlers: false });
          assert.equal(acquired.kind, 'guard');
          if (acquired.kind !== 'guard') throw acquired.error;
          const executed = await executeLocalStep(step, acquired.guard);
          assert.equal(executed.verdict, 'pass');
          assert.deepEqual(acquired.guard.release(), { kind: 'released' });
          const rules = {
            digest: `sha256:${'b'.repeat(64)}`,
            required: [],
            suggested: [],
            skipped: [],
          };
          const report: VerifyRunReport = {
            context: {
              request: {
                root: cloud,
                phase: 'coverage',
                scope: { mode: 'files', files: ['Sources/App/App.swift'] },
              },
              plugins: ['swift'],
              frameworks: [],
              headSha: verifiedHead,
              rules,
            },
            readiness: { status: 'READY', entries: [] },
            plan: {
              phase: 'coverage',
              trust: { level: 'local-runner', source: 'contract:actual-executor' },
              steps: [step],
            },
            results: [executed.result!],
            mutations: [],
            evidence: executed.evidence,
            rules,
            verdict: 'pass',
          };
          return { exitCode: 0, stdout: '', stderr: '', report };
        },
      });
      assert.equal(outcome.exitCode, 0);
      git(cloud, 'add', task);
      git(cloud, 'commit', '-qm', 'durable journal');
      const collectedHead = git(cloud, 'rev-parse', 'HEAD');
      assert.notEqual(collectedHead, verifiedHead);
      assert.deepEqual(validateCurrentSddPhaseAttempt(cloud, resolve(cloud, task), 'P3'), {
        ok: true,
      });
      const configPath = resolve(sandbox, 'run.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          schema: 'gennady.e18-run.v1',
          cloudIosBaseSha: verifiedHead,
          task,
          sddPhase: 'P3',
          owningSpec: spec,
          groupMembers: [task],
          artifact: 'Sources/App/App.swift',
          projectConfig: 'config/e18-project.json',
          remote: { timeoutMs: 1_000, pollIntervalMs: 100 },
        })
      );
      if (drift === 'before') {
        put(cloud, 'Sources/App/App.swift', 'public let value = 2\n');
        git(cloud, 'add', '.');
        git(cloud, 'commit', '-qm', 'product drift');
      }
      const run = (_cwd: string, command: string) => ({
        status: 0,
        stderr: '',
        stdout:
          command === 'sw_vers'
            ? '15.2'
            : command === 'xcodebuild'
              ? 'Xcode 16.2'
              : command === 'xcode-select'
                ? '/Applications/Xcode.app/Contents/Developer'
                : command === 'tuist'
                  ? '4.202.0'
                  : value.coverage.xccov.payload,
      });
      const collect = () =>
        collectE18Evidence(gennady, cloud, configPath, {
          reviewedCloudIosBaseSha: verifiedHead,
          platform: 'darwin',
          run,
          resolveRemote: () => ({ ok: true, observer: {} as RemotePipelineObserver }),
          watchRemote: async ({ sourceSha }) => {
            if (drift === 'watch-head') {
              put(cloud, 'Sources/App/App.swift', 'public let value = 2\n');
              git(cloud, 'add', '.');
              git(cloud, 'commit', '-qm', 'concurrent product drift');
            }
            if (drift === 'watch-config')
              put(cloud, 'config/e18-project.json', `${value.project.config.content}\n`);
            if (drift === 'watch-bundle') put(cloud, `${project.xcresult}/Data`, 'changed output');
            return {
              state: 'REMOTE_SUCCESS',
              pipelineId: 'pipeline-8001',
              message: 'success',
              evidence: [],
              proof: {
                schema: 'gennady.verify-remote-proof.v1',
                provider: 'github',
                project: 'example/cloud-ios',
                definitionId: 'workflow-7001',
                sourceSha,
                pipelineSha: sourceSha,
                pipelineId: 'pipeline-8001',
                rawStatus: 'success',
                terminalState: 'REMOTE_SUCCESS',
                observedAt: new Date().toISOString(),
                jobs: [{ id: 'job-9001', name: 'tests', rawStatus: 'success' }],
              },
            };
          },
        });
      if (drift) {
        await assert.rejects(
          collect,
          drift === 'before'
            ? /PASS is stale/
            : drift === 'wrong-command'
              ? /E18_XCODE_COMMAND_MISMATCH/
              : /E18_SOURCE_DRIFT|E18_CLOUD_IOS.*DIRTY/
        );
        assert.equal(fs.existsSync(output), false);
      } else {
        const report = await collect();
        assert.equal(report.ok, true);
        const observed = JSON.parse(fs.readFileSync(output, 'utf8'));
        const raw = JSON.parse(
          Buffer.from(observed.execution.attempt.rawEvidence, 'base64url').toString('utf8')
        );
        assert.equal(raw.identity.headSha, verifiedHead);
        assert.equal(observed.cloudIos.headSha, collectedHead);
        assert.equal(observed.remote.exactSha, collectedHead);
        assert.equal(raw.identity.worktreeDigest, observed.execution.attempt.currentWorktreeDigest);
        assert.equal(
          checkE18Evidence(observed, {
            reviewedCloudIosBaseSha: verifiedHead,
            resolveTree: () => git(gennady, 'rev-parse', 'HEAD^{tree}'),
          }).ok,
          true
        );
        assert.equal(
          checkE18Evidence(observed, {
            resolveTree: () => git(gennady, 'rev-parse', 'HEAD^{tree}'),
          }).ok,
          false
        );
      }
    } finally {
      process.env.PATH = oldPath;
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  }
  it('runs a real local process, journals it, commits the journal and collects current exact-SHA evidence', () =>
    lifecycle());
  it('rejects product drift after the durable-journal commit', () => lifecycle('before'));
  it('rejects PASS with the correct stepId from a different actual argv command', () =>
    lifecycle('wrong-command'));
  it('rejects a committed HEAD/product change during the watcher without persisting evidence', () =>
    lifecycle('watch-head'));
  it('rejects config changes during the watcher without persisting evidence', () =>
    lifecycle('watch-config'));
  it('rejects ignored xcresult changes during the watcher without persisting evidence', () =>
    lifecycle('watch-bundle'));
});
