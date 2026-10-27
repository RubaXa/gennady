// @file: Authenticate all FORMAT2 attempts, portable replay and separately versioned calibration.
// @spec: AI-SKILLS
// @consumers: authoring research archive; offline evaluation regression suite

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';

const root = new URL('../results/authoring-campaigns/format2-oct23/', import.meta.url);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const prefix = relative(repository, fileURLToPath(root)).split('\\').join('/');
const model = 'llm-proxy/deepseek-v4-flash';
const arms = ['baseline', 'prose', 'pseudocode', 'observation'];
const cases = ['module-flat', 'module-nested'];
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
type Entry = { path: string; bytes: number; sha256: string };

function archiveBytes(path: string): Buffer {
  assert.match(path, /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);
  assert.ok(!path.split('/').some((part) => part === '..' || part === ''));
  const file = new URL(path, root);
  const stat = lstatSync(file);
  assert.equal(stat.isSymbolicLink(), false, path);
  assert.equal(stat.isFile(), true, path);
  assert.ok(stat.size <= 8 * 1024 * 1024, path);
  return readFileSync(file);
}
const load = (path: string) => JSON.parse(archiveBytes(path).toString('utf8'));
const manifest = load('manifest.json') as {
  schema: string;
  planned: number;
  recordedPrimary: number;
  files: Entry[];
  safeExportChecks: { gitIgnoredArchiveFiles: string[]; knownCredentialValuesFound: number };
};
const records = Array.from({ length: 24 }, (_, index) => load(`records/${index}.json`));
function primary(record: (typeof records)[number]) {
  assert.match(
    record.primary.directory,
    /^20\d\d-\d\d-\d\d-authoring-format2-oct23-(?:module-flat|module-nested)-(?:baseline|prose|pseudocode|observation)-r[123]$/
  );
  return `report-v1/permanent/${record.primary.directory}`;
}

function regularFiles(directory: URL, parent = '', depth = 0): string[] {
  assert.ok(depth <= 32);
  return readdirSync(directory).flatMap((name) => {
    const file = new URL(name, directory),
      stat = lstatSync(file);
    assert.equal(stat.isSymbolicLink(), false, `${parent}${name}`);
    if (stat.isDirectory())
      return regularFiles(new URL(`${name}/`, directory), `${parent}${name}/`, depth + 1);
    assert.equal(stat.isFile(), true, `${parent}${name}`);
    return [`${parent}${name}`];
  });
}

it('FORMAT2 exhaustively binds bounded archive bytes and every Git index blob, including all 24 logs', () => {
  assert.equal(manifest.schema, 'gennady.authoring-campaign-archive.1');
  assert.equal(manifest.planned, 24);
  assert.equal(manifest.recordedPrimary, 24);
  assert.ok(manifest.files.length > 0 && manifest.files.length <= 1200);
  const paths = manifest.files.map((entry) => entry.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(
    [...paths].sort(),
    regularFiles(root)
      .filter((path) => path !== 'manifest.json')
      .sort()
  );
  assert.deepEqual(manifest.safeExportChecks.gitIgnoredArchiveFiles, []);
  assert.equal(manifest.safeExportChecks.knownCredentialValuesFound, 0);
  assert.ok(!paths.some((path) => /^(?:server-|node_modules\/|dist\/)/.test(path)));
  for (let index = 0; index < 24; index++)
    assert.ok(paths.includes(`controller-output/${index}.txt`), `bounded log ${index}`);
  let total = 0;
  for (const entry of manifest.files) {
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0);
    const bytes = archiveBytes(entry.path);
    total += bytes.length;
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
  assert.ok(total <= 64 * 1024 * 1024);
  for (const mapping of load('original-byte-mappings.json')) {
    const bytes = archiveBytes(mapping.path);
    assert.equal(bytes.length, mapping.bytes, mapping.path);
    assert.equal(sha(bytes), mapping.sha256, mapping.path);
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const entries = [
    ...manifest.files,
    { path: 'manifest.json', sha256: sha(archiveBytes('manifest.json')) },
  ];
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repository,
    env,
    input: entries.map((entry) => `:${prefix}/${entry.path}`).join('\n') + '\n',
    maxBuffer: 72 * 1024 * 1024,
  });
  let cursor = 0;
  for (const entry of entries) {
    const end = blobs.indexOf(10, cursor);
    assert.ok(end >= cursor, `Missing index blob: ${entry.path}`);
    const header = /^[0-9a-f]{40,64} blob ([0-9]+)$/.exec(
      blobs.subarray(cursor, end).toString('utf8')
    );
    assert.ok(header, `Evidence must survive a fresh checkout: ${entry.path}`);
    const size = Number(header[1]);
    cursor = end + 1;
    assert.ok(Number.isSafeInteger(size) && size >= 0 && cursor + size < blobs.length);
    assert.equal(sha(blobs.subarray(cursor, cursor + size)), entry.sha256, entry.path);
    cursor += size;
    assert.equal(blobs[cursor++], 10);
  }
  assert.equal(cursor, blobs.length);
});

it('FORMAT2 preserves the exact 24-attempt matrix, four frozen source SHAs and Flash-only identities', () => {
  const config = load('protocol/config.json');
  const batch = load('protocol/batch.json');
  const preregistration = load('protocol/preregistered-protocol.json');
  const protocol = load('protocol/controller-protocol.json');
  assert.equal(config.attempts.length, 24);
  assert.equal(batch.planned, 24);
  assert.equal(batch.dispatched, 24);
  assert.equal(batch.recorded, 24);
  assert.equal(batch.complete, true);
  assert.equal(batch.interrupted, null);
  assert.equal(batch.errors, 0);
  assert.equal(new Set(config.attempts.map((attempt: any) => attempt.scenario.id)).size, 24);
  const identities: Record<string, string> = {
    baseline: 'c676bb090e6f4f93a199c9a46f9726be9260c865',
    prose: 'd7435fac581043d29a493e45d5539a3fb0bf20e9',
    pseudocode: '7f3656672f18463044a9d84706b5d3c4de4d031c',
    observation: '822ba00b0ece32697fc60e2dd5f2348188a5e270',
  };
  assert.deepEqual(
    Object.fromEntries(
      preregistration.sources.map((source: any) => [source.arm, source.sourceSHA])
    ),
    identities
  );
  for (const arm of arms)
    for (const caseId of cases)
      assert.deepEqual(
        config.attempts
          .map((attempt: any) => attempt.scenario.authoringBenchmark)
          .filter((label: any) => label.variant === arm && label.caseId === caseId)
          .map((label: any) => label.repetition)
          .sort(),
        [1, 2, 3]
      );
  for (const role of ['workerModel', 'judgeModel', 'reflectionModel'])
    assert.equal(preregistration.runtime[role], model);
  assert.equal(preregistration.runtime.fallback, false);
  assert.equal(protocol.model, model);
  assert.equal(protocol.configSha256, sha(archiveBytes('protocol/config.json')));
  assert.equal(
    protocol.preregistrationSha256,
    sha(archiveBytes('protocol/preregistered-protocol.json'))
  );
  assert.equal(
    preregistration.offlineReporting.sha256,
    sha(archiveBytes('code/offline-report.mts.txt'))
  );
  for (const [index, record] of records.entries()) {
    const attempt = config.attempts[index];
    assert.equal(record.index, index);
    assert.equal(record.scenarioId, attempt.scenario.id);
    assert.equal(record.sourceSha, identities[attempt.scenario.authoringBenchmark.variant]);
    const summary = load(`${primary(record)}/summary.json`);
    assert.equal(
      sha(archiveBytes(`${primary(record)}/summary.json`)),
      record.primary.summarySha256
    );
    assert.equal(
      sha(archiveBytes(`${primary(record)}/trajectory.json`)),
      record.primary.trajectorySha256
    );
    assert.equal(summary.scenarioId, record.scenarioId);
    assert.equal(summary.sha, record.sourceSha);
    assert.equal(summary.authoringBenchmark.sourceCommit, record.sourceSha);
    assert.equal(summary.authoringBenchmark.model, model);
    assert.equal(summary.authoringBenchmark.modelVerified, true);
    assert.equal(summary.authoringBenchmark.environmentVerified, true);
    assert.equal(summary.authoringBenchmark.dirty, false);
    for (const selected of [summary.model, summary.judgeModel])
      assert.deepEqual(selected, { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' });
    for (const usage of [summary.usage, summary.judgeUsage.usage])
      assert.deepEqual(usage.models, [model]);
    const reflection = load(`${primary(record)}/reflection.json`);
    if (reflection.models) assert.deepEqual(reflection.models, [model]);
  }
});

it('FORMAT2 records persistence, 48 deleted sessions, all fixtures removed and restored private-runtime boundaries', () => {
  const sessionIds: string[] = [];
  for (const record of records) {
    assert.equal(record.persistence, true);
    assert.equal(record.tempRemoved, true);
    assert.deepEqual(record.cleanupErrors, []);
    assert.equal(record.sessions.length, 2);
    for (const session of record.sessions) {
      assert.equal(session.deleted, true);
      sessionIds.push(session.id);
    }
    assert.ok(
      record.knownSessions.every((known: any) =>
        record.sessions.some((s: any) => s.id === known.id && s.deleted)
      )
    );
  }
  assert.equal(sessionIds.length, 48);
  assert.equal(new Set(sessionIds).size, 48);
  const cleanup = load('cleanup-proof.json');
  assert.equal(cleanup.attempts.length, 24);
  assert.equal(cleanup.sessionDeletionAcknowledgements, 48);
  for (const attempt of cleanup.attempts) {
    assert.equal(attempt.persistence, true);
    assert.equal(attempt.tempRemoved, true);
    assert.equal(attempt.caseDirectoryAbsent, true);
    assert.deepEqual(attempt.cleanupErrors, []);
    assert.ok(
      attempt.sessionDeletionAcknowledgements.every((s: any) => s.deleted && s.directoryAbsent)
    );
  }
  assert.equal(cleanup.ownedServer.launcherPidPresent, false);
  assert.equal(cleanup.ownedServer.serverPidPresent, false);
  assert.equal(cleanup.journals.length, 4);
  for (const journal of cleanup.journals) {
    assert.equal(journal.mode, 0o644);
    assert.equal(journal.actualMode, 0o644);
    assert.equal(journal.restored, true);
  }
  assert.equal(cleanup.privateDirectories.length, 10);
  assert.ok(cleanup.privateDirectories.every((directory: any) => directory.absent === true));
  const runtime = load('runtime-cleanup-summary.json');
  assert.equal(runtime.status, 'complete');
  assert.equal(runtime.attemptsFinalized, 24);
  assert.equal(runtime.deletedSessionFacts, 48);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.server.stopped, true);
  assert.equal(runtime.removedPaths.length, 10);
  assert.equal(runtime.journalModesRestored.length, 4);
  assert.ok(
    runtime.journalModesRestored.every(
      (journal: any) => journal.from === '444' && journal.to === '644'
    )
  );
  // Historical absolute paths above are serialized proof data, never live filesystem targets.
});

it('FORMAT2 portable replay retains all 13 successful outputs and unchanged input bytes', () => {
  const proof = load('replay-proof.json');
  assert.equal(proof.status, 'passed');
  assert.equal(proof.modelCalls, 0);
  assert.equal(proof.expectedCommands, 13);
  assert.equal(proof.commands.length, 13);
  assert.equal(proof.allExpectedExits, true);
  assert.equal(proof.allProducedResultsByteEqual, true);
  assert.equal(proof.comparisonAggregateByteEqual, true);
  assert.equal(proof.primaryInputBytesUnchanged, true);
  assert.equal(proof.copiedInputBytesUnchanged, true);
  assert.equal(proof.temporaryReplayDirectoryRemoved, true);
  assert.deepEqual(proof.errors, []);
  const comparisons = load('report-v1/comparisons.json');
  for (const command of proof.commands) {
    assert.equal(command.status, 0, command.name);
    assert.equal(command.expectedStatus, 0, command.name);
    assert.equal(command.expectedExitMatches, true, command.name);
    assert.equal(command.equalsArchivedResult, true, command.name);
    assert.equal(command.modelCalls, 0);
    let expected: Buffer;
    if (command.script === 'authoring-baseline-report.ts') {
      const arm = command.name.replace(/-baseline$/, '');
      assert.ok(arms.includes(arm));
      expected = archiveBytes(`report-v1/${arm}.report.json`);
    } else if (command.script === 'authoring-call-audit.ts') {
      const arm = command.name.replace(/-audit$/, '');
      assert.ok(arms.includes(arm));
      expected = archiveBytes(`report-v1/${arm}.calls.md`);
    } else {
      assert.equal(command.script, 'authoring-experiment.ts');
      const [left, right] = command.name.split('-vs-');
      const comparison = comparisons.find(
        (row: any) => row.baseline === left && row.candidate === right
      );
      assert.ok(comparison, command.name);
      const { baseline: _baseline, candidate: _candidate, ...result } = comparison;
      expected = Buffer.from(JSON.stringify(result, null, 2) + '\n');
    }
    assert.equal(sha(expected), command.output.sha256, command.name);
    assert.equal(expected.length, command.output.bytes, command.name);
  }
  for (const binding of proof.inputBindings) {
    const bytes = archiveBytes(`report-v1/${binding.path}`);
    assert.equal(sha(bytes), binding.sha256, binding.path);
    assert.equal(bytes.length, binding.bytes, binding.path);
  }
  const bindings = load('report-v1/bindings.json');
  for (const [path, binding] of Object.entries(bindings.replayInputs) as Array<[string, Entry]>)
    assert.equal(sha(archiveBytes(`report-v1/${path}`)), binding.sha256);
  assert.equal(bindings.analysisProgramSha256, proof.analysisProgram.sha256);
});

it('FORMAT2 separately replays v4 without rewriting v3 outcomes or either semantic erratum', () => {
  const calibration = load('recalibration/calibrated-v4-replay.json');
  assert.equal(calibration.historicalGradesReplaced, false);
  assert.equal(calibration.liveModelCalls, 0);
  assert.equal(calibration.sequential, true);
  assert.equal(calibration.oracleDefault, 'calibrated-v4');
  assert.equal(calibration.sourceCommitIsObservedHEADNotCleanOracleProof, true);
  assert.equal(calibration.sourceTreeClean, false);
  assert.deepEqual(calibration.cleanup, {
    fixturesCreated: 116,
    fixturesRemoved: 116,
    scratchRemoved: true,
  });
  assert.equal(sha(archiveBytes('code/replay-calibrated-v4.mts.txt')), calibration.scriptSHA256);
  assert.equal(calibration.configSHA256, sha(archiveBytes('protocol/config.json')));
  assert.equal(calibration.finalBatchSHA256, sha(archiveBytes('protocol/batch.json')));
  assert.equal(calibration.records.length, 116);
  assert.equal(calibration.summary.length, 6);
  for (const summary of calibration.summary) {
    assert.equal(summary.unknownComparisons, 0);
    assert.deepEqual(summary.unknown, []);
    if (summary.key.startsWith('spec-trajectory-oct23/')) {
      assert.equal(summary.artifacts, 30);
      assert.equal(summary.validComparisons, 30);
      assert.equal(summary.validV3Passed, 26);
      assert.equal(summary.validV4Passed, 26);
      assert.deepEqual(summary.changed, []);
    } else if (summary.key.startsWith('format-oct23/')) {
      assert.equal(summary.artifacts, 4);
      assert.equal(summary.validComparisons, 4);
      assert.equal(summary.validV3Passed, 4);
      assert.equal(summary.validV4Passed, 4);
      assert.deepEqual(summary.changed, []);
    } else {
      assert.match(summary.key, /^format2-oct23\//);
      assert.equal(summary.artifacts, 24);
      assert.equal(summary.validComparisons, 24);
      assert.equal(summary.validV3Passed, 20);
      assert.equal(summary.validV4Passed, 21);
      assert.equal(summary.changed.length, 1);
      assert.equal(summary.changed[0].attempt, records[9].scenarioId);
      assert.equal(summary.changed[0].validComparison, true);
      assert.deepEqual(
        summary.changed[0].differences.map((change: any) => change.id),
        ['pending-approval']
      );
      assert.equal(summary.changed[0].differences[0].before.pass, false);
      assert.equal(summary.changed[0].differences[0].after.pass, true);
    }
  }
  const byId = new Map(records.map((record) => [record.scenarioId, record]));
  for (const row of calibration.records) {
    assert.equal(row.validComparison, true);
    if (row.campaign !== 'format2-oct23') {
      assert.deepEqual(row.v4, row.v3, row.attempt);
      assert.deepEqual(row.differences, [], row.attempt);
      continue;
    }
    const record = byId.get(row.attempt);
    assert.ok(record, row.attempt);
    const summary = load(`${primary(record)}/summary.json`);
    assert.deepEqual(row.v3, summary.quality, `Raw v3 reproduction: ${row.attempt}/${row.mode}`);
    assert.equal(row.rawQualityReplay.match, true);
    assert.equal(row.rawQualityReplay.originalJSONSHA256, sha(JSON.stringify(summary.quality)));
    assert.equal(row.rawQualityReplay.replayJSONSHA256, sha(JSON.stringify(summary.quality)));
    assert.deepEqual(row.rawQualityReplay.differingCheckIds, []);
    assert.deepEqual(row.rawQualityReplay.differingTopLevelFields, []);
    assert.equal(row.originalPrimaryHashes.summarySHA256, record.primary.summarySha256);
    assert.equal(row.originalPrimaryHashes.trajectorySHA256, record.primary.trajectorySha256);
    assert.equal(
      row.originalPrimaryHashes.recordSHA256,
      sha(archiveBytes(`records/${record.index}.json`))
    );
    if (record.index === 9) {
      assert.equal(row.v3.pass, false);
      assert.equal(row.v4.pass, true);
      assert.deepEqual(
        row.differences.map((change: any) => change.id),
        ['pending-approval']
      );
    } else assert.deepEqual(row.v4, row.v3, row.attempt);
  }
  const ninth = load(`${primary(records[9])}/summary.json`);
  const fifteenth = load(`${primary(records[15])}/summary.json`);
  assert.equal(ninth.quality.pass, false, 'Frozen lexical false-negative remains frozen');
  assert.equal(ninth.verdict, 'fail', 'Artifact calibration cannot rewrite the semantic verdict');
  assert.equal(fifteenth.quality.pass, true);
  assert.equal(fifteenth.verdict, 'fail', 'Boundary erratum is not a rewritten semantic PASS');
});
