// @file: Authenticate fresh fact/link context trials and independently recompute measured effects.
// @spec: AI-SKILLS
// @consumers: authoring experiment archive; offline eval regression suite

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';

const root = new URL('../results/authoring-campaigns/factlink1-oct24/', import.meta.url);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const prefix = relative(repository, fileURLToPath(root)).split('\\').join('/');
const model = 'llm-proxy/deepseek-v4-flash';
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
function bytes(path: string): Buffer {
  assert.match(path, /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);
  assert.ok(!path.split('/').some((part) => part === '..' || part === ''));
  const stat = lstatSync(new URL(path, root));
  assert.equal(stat.isSymbolicLink(), false, path);
  assert.equal(stat.isFile(), true, path);
  assert.ok(stat.size <= 8 * 1024 * 1024);
  return readFileSync(new URL(path, root));
}
const load = (path: string) => JSON.parse(bytes(path).toString('utf8'));
const manifest = load('manifest.json');
const config = load('protocol/config.json');
const records = Array.from({ length: 24 }, (_, i) => load(`records/${i}.json`));
const primary = (record: any) => {
  assert.match(
    record.primary.directory,
    /^20\d\d-\d\d-\d\d-authoring-factlink1-oct24-(module-flat|module-nested)-(baseline|facts)-r[1-6]$/
  );
  return `report-v1/permanent/${record.primary.directory}`;
};
function files(directory: URL, parent = ''): string[] {
  return readdirSync(directory).flatMap((name) => {
    const url = new URL(name, directory),
      stat = lstatSync(url);
    assert.equal(stat.isSymbolicLink(), false);
    return stat.isDirectory()
      ? files(new URL(name + '/', directory), parent + name + '/')
      : [parent + name];
  });
}
it('FACTLINK1 retains every bounded primary byte and Git-index blob, including all 24 logs', () => {
  assert.equal(manifest.schema, 'gennady.authoring-campaign-archive.1');
  assert.equal(manifest.planned, 24);
  assert.equal(manifest.recordedPrimary, 24);
  assert.ok(manifest.files.length > 0 && manifest.files.length <= 1200);
  assert.deepEqual(
    manifest.files.map((e: any) => e.path).sort(),
    files(root)
      .filter((p) => p !== 'manifest.json')
      .sort()
  );
  assert.equal(new Set(manifest.files.map((e: any) => e.path)).size, manifest.files.length);
  assert.equal(manifest.safeExportChecks.knownCredentialValuesFound, 0);
  assert.deepEqual(manifest.safeExportChecks.gitIgnoredArchiveFiles, []);
  let total = 0;
  for (const entry of manifest.files) {
    const data = bytes(entry.path);
    total += data.length;
    assert.equal(data.length, entry.bytes);
    assert.equal(sha(data), entry.sha256, entry.path);
  }
  assert.ok(total <= 64 * 1024 * 1024);
  assert.equal(total, manifest.bytesExcludingManifest);
  for (let i = 0; i < 24; i++)
    assert.ok(manifest.files.some((e: any) => e.path === `controller-output/${i}.txt`));
  const entries = [
    ...manifest.files,
    { path: 'manifest.json', sha256: sha(bytes('manifest.json')) },
  ];
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repository,
    env,
    input: entries.map((e) => `:${prefix}/${e.path}`).join('\n') + '\n',
    maxBuffer: 72 * 1024 * 1024,
  });
  let cursor = 0;
  for (const entry of entries) {
    const end = blobs.indexOf(10, cursor);
    assert.ok(end >= cursor);
    const match = /^[a-f0-9]{40,64} blob ([0-9]+)$/.exec(blobs.subarray(cursor, end).toString());
    assert.ok(match, entry.path);
    const size = Number(match[1]);
    cursor = end + 1;
    assert.equal(sha(blobs.subarray(cursor, cursor + size)), entry.sha256, entry.path);
    cursor += size;
    assert.equal(blobs[cursor++], 10);
  }
  assert.equal(cursor, blobs.length);
});
it('FACTLINK1 binds a fresh balanced 2×2×6 matrix to exactly two clean Flash-only sources', () => {
  const pre = load('protocol/preregistered-protocol.json'),
    protocol = load('protocol/controller-protocol.json'),
    batch = load('protocol/batch.json');
  assert.equal(config.attempts.length, 24);
  assert.equal(batch.complete, true);
  assert.equal(batch.errors, 0);
  assert.equal(batch.recorded, 24);
  assert.equal(protocol.configSha256, sha(bytes('protocol/config.json')));
  assert.equal(protocol.preregistrationSha256, sha(bytes('protocol/preregistered-protocol.json')));
  assert.equal(pre.controlProgram.sha256, sha(bytes('code/controller.mjs.txt')));
  assert.equal(pre.offlineReporting.sha256, sha(bytes('code/offline-report.mts.txt')));
  assert.equal(pre.mechanism.sha256, sha(bytes('code/mechanism.mjs.txt')));
  const identities = {
    baseline: '09c2329bdeafa34209b58d0c0470b05d2c2ca721',
    facts: '67326bc51786cd548b2334e4e5fbcb4a9bc66c53',
  };
  assert.deepEqual(
    Object.fromEntries(pre.sources.map((s: any) => [s.arm, s.sourceSHA])),
    identities
  );
  assert.equal(pre.sources[0].dist.sha256, pre.sources[1].dist.sha256);
  for (const role of ['workerModel', 'judgeModel', 'reflectionModel'])
    assert.equal(pre.runtime[role], model);
  for (const arm of ['baseline', 'facts'])
    for (const caseId of ['module-flat', 'module-nested']) {
      assert.deepEqual(
        config.attempts
          .map((a: any) => a.scenario.authoringBenchmark)
          .filter((a: any) => a.variant === arm && a.caseId === caseId)
          .map((a: any) => a.repetition)
          .sort(),
        [1, 2, 3, 4, 5, 6]
      );
      assert.equal(
        pre.order.blocks.filter((b: any) => b.caseId === caseId && b.arms[0] === arm).length,
        3
      );
    }
  for (const [index, record] of records.entries()) {
    const labels = config.attempts[index].scenario.authoringBenchmark,
      summary = load(primary(record) + '/summary.json');
    assert.equal(record.index, index);
    assert.equal(record.sourceSha, identities[labels.variant as keyof typeof identities]);
    assert.equal(sha(bytes(primary(record) + '/summary.json')), record.primary.summarySha256);
    assert.equal(sha(bytes(primary(record) + '/trajectory.json')), record.primary.trajectorySha256);
    assert.equal(summary.authoringBenchmark.sourceCommit, record.sourceSha);
    assert.equal(summary.authoringBenchmark.dirty, false);
    assert.equal(summary.authoringBenchmark.environmentVerified, true);
    assert.deepEqual(summary.model, { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' });
    assert.deepEqual(summary.usage.models, [model]);
  }
});
it('FACTLINK1 independently recomputes per-case medians and paired differences without changing grades', () => {
  const raw = load('report-v1/raw-metrics.json').attempts,
    net = load('report-v1/net-effects.json');
  assert.equal(raw.length, 24);
  assert.equal(net.adoptionAuthorized, false);
  const median = (values: number[]) => {
    const a = [...values].sort((x, y) => x - y);
    return (a[2]! + a[3]!) / 2;
  };
  const read: Record<string, (r: any) => number> = {
    tokens: (r) => r.worker.total,
    tools: (r) => r.observation.metrics.tools,
    messages: (r) => r.worker.messages,
    timeMs: (r) => r.worker.wallClockMs,
  };
  for (const c of net.cases) {
    for (const key of Object.keys(read)) {
      const b = raw.filter((r: any) => r.caseId === c.caseId && r.variant === 'baseline'),
        t = raw.filter((r: any) => r.caseId === c.caseId && r.variant === 'facts');
      assert.equal(b.length, 6);
      assert.equal(t.length, 6);
      const a = median(b.map(read[key]!)),
        z = median(t.map(read[key]!));
      assert.equal(c.medians[key].baseline.median, a);
      assert.equal(c.medians[key].candidate.median, z);
      assert.equal(c.medians[key].percent, (100 * (z - a)) / a);
      for (const pair of c.paired) {
        const left = b.find((r: any) => r.repetition === pair.repetition),
          right = t.find((r: any) => r.repetition === pair.repetition);
        assert.equal(pair.deltas[key].absolute, read[key]!(right) - read[key]!(left));
      }
    }
    assert.equal(c.adoptionAuthorized, false);
  }
  for (const record of records) {
    const original = load(primary(record) + '/summary.json'),
      row = raw.find((r: any) => r.index === record.index);
    assert.deepEqual(row.artifact, original.quality);
    assert.deepEqual(row.path, original.trajectory);
    assert.equal(row.verdict, original.verdict);
  }
});
it('FACTLINK1 portable existing-CLI replays are byte-identical and cleanup preserves the full denominator', () => {
  const replay = load('replay-proof.json'),
    cleanup = load('cleanup-proof.json'),
    runtime = load('runtime-cleanup-summary.json');
  assert.equal(replay.expectedCommands, 5);
  assert.equal(replay.commands.length, 5);
  assert.equal(replay.allExpectedExits, true);
  assert.equal(replay.allProducedResultsByteEqual, true);
  assert.equal(replay.modelCalls, 0);
  assert.equal(replay.temporaryReplayDirectoryRemoved, true);
  assert.equal(cleanup.attempts.length, 24);
  assert.equal(runtime.status, 'complete');
  assert.equal(runtime.server.stopped, true);
  const erratum = load('runtime-summary-erratum.json');
  assert.equal(erratum.rawSummarySha256, sha(bytes('runtime-cleanup-summary.json')));
  assert.equal(erratum.executedScriptSha256, sha(bytes('code/finalize-owned-runtime.mjs.txt')));
  assert.equal(erratum.guardedActualPort, 4199);
  assert.equal(erratum.rawRecordedValue, runtime.server.port);
  assert.equal(load('protocol/server-pid.json').baseUrl, 'http://127.0.0.1:4199');
  assert.equal(erratum.primaryRecordRewritten, false);
  for (const r of records) {
    assert.equal(r.persistence, true);
    assert.equal(r.tempRemoved, true);
    assert.deepEqual(r.cleanupErrors, []);
    assert.ok(r.sessions.length >= 2);
    assert.ok(r.sessions.every((s: any) => s.deleted === true));
  }
});

it('FACTLINK1 separately calibrates SECTION references without rewriting primary or semantic grades', () => {
  const replay = load('recalibration/calibrated-v5-replay.json');
  assert.equal(replay.primaryGradesReplaced, false);
  assert.equal(replay.semanticGradesReplaced, false);
  assert.equal(replay.modelCalls, 0);
  assert.deepEqual(replay.cleanup, {
    fixturesCreated: 96,
    fixturesRemoved: 96,
    scratchRemoved: true,
  });
  assert.equal(replay.records.length, 96);
  assert.equal(replay.oracleSha256, sha(bytes('code/authoring-benchmark.calibrated-v5.ts.txt')));
  assert.equal(replay.scriptSha256, sha(bytes('code/replay-v5.mts.txt')));
  for (const r of replay.records) {
    assert.equal(r.rawQualityMatches, true, r.scenarioId);
    assert.ok(r.differences.every((d: any) => d.id === 'relative-links'));
    assert.deepEqual(
      r.v4.checks.filter((c: any) => c.id !== 'relative-links'),
      r.v5.checks.filter((c: any) => c.id !== 'relative-links')
    );
    if (r.campaign === 'factlink1-oct24') {
      const record = records.find((x: any) => x.scenarioId === r.scenarioId);
      assert.ok(record);
      assert.equal(record.primary.summarySha256, r.summarySha256);
      assert.deepEqual(load(primary(record) + '/summary.json').quality, r.v4);
    }
  }
});
