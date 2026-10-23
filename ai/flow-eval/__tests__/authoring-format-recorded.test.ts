// @file: Authenticate the stopped FORMAT1 pilot without a proxy or historical temporary paths.
// @spec: AI-SKILLS
// @consumers: authoring research archive; offline evaluation regression suite

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';

const root = new URL('../results/authoring-campaigns/format-oct23/', import.meta.url);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const prefix = relative(repository, fileURLToPath(root)).split('\\').join('/');
const load = (name: string) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
type Entry = { path: string; bytes: number; sha256: string };
const manifest = load('manifest.json') as {
  planned: number;
  recordedPrimary: number;
  files: Entry[];
};

function regularFiles(directory: URL, parent = ''): string[] {
  return readdirSync(directory).flatMap((name) => {
    const file = new URL(name, directory);
    const stat = lstatSync(file);
    assert.equal(stat.isSymbolicLink(), false, `${parent}${name}`);
    if (stat.isDirectory())
      return regularFiles(new URL(`${name}/`, directory), `${parent}${name}/`);
    assert.equal(stat.isFile(), true, `${parent}${name}`);
    return [`${parent}${name}`];
  });
}

it('FORMAT1 keeps every exported file hash-bound and in the Git index, including bounded logs', () => {
  assert.equal(manifest.planned, 24);
  assert.equal(manifest.recordedPrimary, 4);
  const paths = manifest.files.map((entry) => entry.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(
    [...paths].sort(),
    regularFiles(root)
      .filter((path) => path !== 'manifest.json')
      .sort()
  );
  for (const entry of manifest.files) {
    assert.match(entry.path, /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);
    assert.ok(!entry.path.split('/').some((part) => part === '..' || part === ''));
    const bytes = readFileSync(new URL(entry.path, root));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const entries = [
    ...manifest.files,
    { path: 'manifest.json', sha256: sha(readFileSync(new URL('manifest.json', root))) },
  ];
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repository,
    env,
    input: entries.map((entry) => `:${prefix}/${entry.path}`).join('\n') + '\n',
    maxBuffer: 16 * 1024 * 1024,
  });
  let cursor = 0;
  for (const entry of entries) {
    const end = blobs.indexOf(10, cursor);
    assert.ok(end >= cursor, `Missing staged blob: ${entry.path}`);
    const header = /^[0-9a-f]{40,64} blob ([0-9]+)$/.exec(
      blobs.subarray(cursor, end).toString('utf8')
    );
    assert.ok(header, `Evidence must be staged and survive a clean checkout: ${entry.path}`);
    const size = Number(header[1]);
    cursor = end + 1;
    assert.ok(Number.isSafeInteger(size) && size >= 0 && cursor + size < blobs.length);
    assert.equal(sha(blobs.subarray(cursor, cursor + size)), entry.sha256, entry.path);
    cursor += size;
    assert.equal(blobs[cursor++], 10);
  }
  assert.equal(cursor, blobs.length);
});

it('FORMAT1 preserves the interrupted denominator, raw failures, and all owned cleanup acknowledgements', () => {
  const batch = load('protocol/batch.json');
  assert.equal(batch.planned, 24);
  assert.equal(batch.recorded, 4);
  assert.equal(batch.complete, false);
  assert.equal(batch.interrupted, 'SIGINT');
  const records = [0, 1, 2, 3].map((index) => load(`records/${index}.json`));
  assert.deepEqual(
    records.map((record) => record.primary.status),
    ['completed', 'completed', 'completed', 'interrupted']
  );
  assert.equal(
    records[1].primary.artifactPass,
    false,
    'Original false-negative is never overwritten'
  );
  for (const record of records) {
    assert.equal(record.persistence, true);
    assert.equal(record.tempRemoved, true);
    assert.deepEqual(record.cleanupErrors, []);
    for (const session of record.sessions) assert.equal(session.deleted, true);
  }
  const cleanup = load('cleanup-proof.json');
  assert.equal(cleanup.sessionDeletionAcknowledgements, 7);
  assert.equal(cleanup.attempts.length, 4);
  for (const attempt of cleanup.attempts) assert.equal(attempt.caseDirectoryAbsent, true);
  assert.equal(cleanup.ownedServer.launcherPidPresent, false);
  assert.equal(cleanup.ownedServer.serverPidPresent, false);
  for (const journal of cleanup.journals) assert.equal(journal.restored, true);
  for (const directory of cleanup.postRunOperationalCleanup.privateDirectories)
    assert.equal(directory.absent, true);
});

it('FORMAT1 portable replays reject partial data instead of manufacturing a winning experiment', () => {
  const proof = load('replay-proof.json');
  assert.equal(proof.commands.length, 13);
  for (const command of proof.commands) {
    assert.equal(command.modelCalls, 0);
    assert.equal(command.expectedExitMatches, true);
    assert.ok(command.status === 1 || command.status === 2, 'Incomplete inputs fail closed');
    if (command.output) assert.equal(command.equalsArchivedResult, true);
  }
  const metrics = load('report-v1/raw-metrics.json');
  assert.equal(metrics.complete, false);
  const bindings = load('report-v1/bindings.json');
  for (const [path, binding] of Object.entries(bindings.replayInputs) as Array<
    [string, { sha256: string }]
  >)
    assert.equal(sha(readFileSync(new URL(`report-v1/${path}`, root))), binding.sha256);
});

it('FORMAT1 versioned recalibration changes only the known false-negative and leaves primary grades intact', () => {
  const calibration = load('recalibration/calibrated-v3-replay.json');
  assert.equal(calibration.historicalGradesReplaced, false);
  assert.equal(calibration.liveModelCalls, 0);
  assert.equal(calibration.oracleDefault, 'calibrated-v3');
  assert.deepEqual(calibration.cleanup, {
    fixturesCreated: 68,
    fixturesRemoved: 68,
    scratchRemoved: true,
  });
  assert.equal(
    sha(readFileSync(new URL('code/replay-calibrated-v3.mts.txt', root))),
    calibration.scriptSHA256
  );
  assert.equal(calibration.summary.length, 4);
  for (const summary of calibration.summary) {
    if (summary.key.startsWith('spec-trajectory-oct23/')) {
      assert.equal(summary.artifacts, 30);
      assert.equal(summary.v2Passed, 26);
      assert.equal(summary.v3Passed, 26);
      assert.deepEqual(summary.changed, []);
    } else {
      assert.match(summary.key, /^format-oct23\//);
      assert.equal(summary.changed.length, 1);
      assert.equal(
        summary.changed[0].attempt,
        '2026-10-23-authoring-format-oct23-module-flat-baseline-r1'
      );
      assert.deepEqual(
        summary.changed[0].differences.map((change: { id: string }) => change.id),
        ['pending-approval']
      );
      assert.equal(summary.changed[0].differences[0].before.pass, false);
      assert.equal(summary.changed[0].differences[0].after.pass, true);
    }
  }
  assert.equal(
    load('records/1.json').primary.artifactPass,
    false,
    'Frozen primary outcome is unchanged'
  );
  assert.equal(
    load('records/3.json').primary.status,
    'interrupted',
    'Artifact replay cannot complete an interrupted attempt'
  );
});
