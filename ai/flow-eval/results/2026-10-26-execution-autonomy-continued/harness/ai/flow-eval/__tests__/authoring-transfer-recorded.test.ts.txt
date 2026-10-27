// @file: Authenticate the bounded fresh-domain transfer experiment, including failures and cleanup.
// @spec: AI-SKILLS
// @consumers: authoring transfer archive; offline eval regression suite

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { it } from 'node:test';

const root = new URL('../results/authoring-campaigns/transfer1-oct25/', import.meta.url);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const prefix = relative(repository, fileURLToPath(root)).split('\\').join('/');
const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
function bytes(path: string): Buffer {
  assert.match(path, /^[a-zA-Z0-9._/-]+$/);
  assert.ok(!path.split('/').some((part) => part === '..' || part === ''));
  const url = new URL(path, root),
    stat = lstatSync(url);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.ok(stat.size <= 8 * 1024 * 1024);
  return readFileSync(url);
}
const load = (path: string) => JSON.parse(bytes(path).toString());
const manifest = load('manifest.json');
const pre = load('protocol/preregistered-protocol.json');
const config = load('protocol/config.json');
const records = Array.from({ length: 12 }, (_, i) => load(`records/${i}.json`));
const primary = (i: number) => `permanent/${records[i].primary.directory}`;
function files(url: URL, prefix = ''): string[] {
  return readdirSync(url).flatMap((name) => {
    const next = new URL(name, url),
      stat = lstatSync(next);
    assert.equal(stat.isSymbolicLink(), false);
    return stat.isDirectory()
      ? files(new URL(name + '/', url), prefix + name + '/')
      : [prefix + name];
  });
}
it('TRANSFER1 preserves every exported byte in Git, without private server state or ignored logs', () => {
  assert.equal(manifest.schema, 'gennady.authoring-transfer-archive.1');
  assert.equal(manifest.planned, 12);
  assert.equal(manifest.recordedPrimary, 12);
  assert.deepEqual(
    manifest.files.map((e: any) => e.path).sort(),
    files(root)
      .filter((p) => p !== 'manifest.json')
      .sort()
  );
  assert.equal(new Set(manifest.files.map((e: any) => e.path)).size, manifest.files.length);
  assert.ok(manifest.files.length <= 1200);
  let total = 0;
  for (const entry of manifest.files) {
    const data = bytes(entry.path);
    total += data.length;
    assert.equal(data.length, entry.bytes);
    assert.equal(sha(data), entry.sha256, entry.path);
    assert.ok(!entry.path.startsWith('private/'));
  }
  assert.equal(total, manifest.bytesExcludingManifest);
  assert.ok(total <= 32 * 1024 * 1024);
  assert.equal(manifest.safeExportChecks.knownCredentialValuesFound, 0);
  assert.equal(manifest.safeExportChecks.privateConfigOrStateIncluded, false);
  assert.deepEqual(manifest.safeExportChecks.gitIgnoredArchiveFiles, []);
  const entries = [
    ...manifest.files,
    { path: 'manifest.json', sha256: sha(bytes('manifest.json')) },
  ];
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const data = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repository,
    env,
    input: entries.map((e) => `:${prefix}/${e.path}`).join('\n') + '\n',
    maxBuffer: 40 * 1024 * 1024,
  });
  let cursor = 0;
  for (const entry of entries) {
    const end = data.indexOf(10, cursor),
      match = /^[a-f0-9]{40,64} blob (\d+)$/.exec(data.subarray(cursor, end).toString());
    assert.ok(match, entry.path);
    const count = Number(match[1]);
    cursor = end + 1;
    assert.equal(sha(data.subarray(cursor, cursor + count)), entry.sha256, entry.path);
    cursor += count;
    assert.equal(data[cursor++], 10);
  }
  assert.equal(cursor, data.length);
});
it('TRANSFER1 binds six new tasks to one frozen host harness and two exact unchanged CLI revisions', () => {
  assert.equal(config.attempts.length, 12);
  assert.equal(pre.taskCorpus.length, 6);
  assert.equal(new Set(pre.taskCorpus.map((t: any) => t.domain)).size, 2);
  assert.equal(pre.taskCorpus.filter((t: any) => t.layout === 'module-flat').length, 3);
  assert.equal(pre.maximumAuthoringAttempts, 12);
  assert.equal(pre.maximumJudgeExecutions, 12);
  assert.equal(pre.maximumReflectionExecutions, 0);
  assert.equal(sha(bytes('code/controller.mjs.txt')), pre.controlProgram.sha256);
  assert.equal(sha(bytes('code/prepare-campaign.mts.txt')), pre.controlProgram.preparationSha256);
  assert.equal(sha(bytes('code/analyze.mjs.txt')), pre.offlineAnalysis.sha256);
  assert.equal(sha(bytes('protocol/config.json')), pre.config.sha256);
  assert.equal(sha(bytes('protocol/REPEAT-CONTRACT.md')), pre.repeatContract.sha256);
  assert.equal(sha(bytes('protocol/tool-output-proof.json')), pre.toolOutputProof.sha256);
  for (const file of pre.hostHarness.files)
    assert.equal(sha(bytes('host-code/' + file.path + '.txt')), file.sha256);
  assert.deepEqual(
    pre.sources.map((s: any) => s.sourceSHA),
    ['ddd26bd88a4b80389faf95e2533766ae44e6f84f', 'bab3ecc8579bf6a7603fed71df75b3b7922bbe3c']
  );
  const inputs = load('protocol/task-inputs.json').cases;
  for (const task of pre.taskCorpus) {
    const definition = inputs.find((c: any) => c.taskId === task.id).definition;
    assert.equal(sha(JSON.stringify(definition, null, 2) + '\n'), task.caseSha256);
    assert.ok(!definition.brief.includes('normalizeToken'));
    assert.deepEqual(pre.sources[0].identities[task.id], pre.sources[1].identities[task.id]);
    assert.equal(config.attempts.filter((a: any) => a.taskId === task.id).length, 2);
  }
  assert.equal(pre.order.filter((b: any) => b.first === 'plan').length, 3);
});
it('TRANSFER1 retains primary outcomes and per-attempt cleanup, not just successful documents', () => {
  assert.equal(load('protocol/batch.json').complete, true);
  for (const [index, r] of records.entries()) {
    const summary = load(primary(index) + '/summary.json');
    assert.equal(r.index, index);
    assert.equal(r.taskId, config.attempts[index].taskId);
    assert.equal(summary.authoringBenchmark.transferTask.id, r.taskId);
    assert.equal(summary.sha, r.sourceSha);
    assert.equal(r.hostHarnessSHA, pre.hostHarness.sourceSHA);
    assert.equal(sha(bytes(primary(index) + '/summary.json')), r.primary.summarySha256);
    assert.equal(sha(bytes(primary(index) + '/trajectory.json')), r.primary.trajectorySha256);
    assert.deepEqual(summary.model, { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' });
    assert.equal(summary.authoringBenchmark.dirty, false);
    assert.equal(r.primary.verdict, summary.verdict);
    assert.equal(r.primary.artifactPass, summary.quality.pass);
    assert.equal(r.persistence, true);
    assert.equal(r.tempRemoved, true);
    assert.deepEqual(r.cleanupErrors, []);
    assert.ok(r.sessions.length >= 1 && r.sessions.every((s: any) => s.deleted === true));
    assert.ok(!manifest.files.some((e: any) => e.path === primary(index) + '/reflection.json'));
  }
});
it('TRANSFER1 aggregate arithmetic and the frozen recommendation never erase a quality failure', () => {
  const result = load('analysis.json'),
    rows = load('raw-rows.json');
  assert.equal(rows.length, 12);
  const totals = (arm: string, get: (row: any) => number) =>
    rows.filter((r: any) => r.variant === arm).reduce((n: number, r: any) => n + get(r), 0);
  for (const arm of ['baseline', 'facts']) {
    const key = arm === 'facts' ? 'candidate' : 'baseline';
    assert.equal(
      result.totals.tokens[key],
      totals(arm, (r) => r.worker.total)
    );
    assert.equal(
      result.totals.tools[key],
      totals(arm, (r) => r.metrics.tools)
    );
    assert.equal(
      result.totals.timeMs[key],
      totals(arm, (r) => r.worker.wallClockMs)
    );
  }
  assert.equal(result.adoptionAuthorized, false);
  const quality = rows
    .filter((r: any) => r.variant === 'facts')
    .every((r: any) => r.artifact.pass && r.semanticVerdict === 'pass' && r.status === 'completed');
  assert.equal(result.rawQualityGate, quality);
  if (!quality || !result.resourceGate || !result.manualQualityGate)
    assert.equal(result.recommendation, 'retain-current-default');
  const proof = load('protocol/tool-output-proof.json');
  assert.equal(proof.skeletonsIdentical, true);
  assert.equal(proof.fixturesRemoved, true);
  assert.equal(proof.outputs.length, 12);
  assert.ok(proof.outputs.every((r: any) => r.referenceCheckExit === 0));
});

it('TRANSFER1 additional audit authenticates every document and keeps its findings separate from raw grades', () => {
  const manual = load('manual-review.json'),
    rows = load('raw-rows.json');
  assert.equal(manual.rows.length, 12);
  assert.equal(new Set(manual.rows.map((r: any) => r.index)).size, 12);
  for (const audit of manual.rows) {
    const task = pre.taskCorpus.find((t: any) => t.id === rows[audit.index].taskId);
    const basename = task.module.split('/').at(-1);
    assert.equal(audit.reviewed, true);
    assert.equal(
      sha(bytes(`${primary(audit.index)}/specs/${task.domain}/${task.module}/${basename}.spec.md`)),
      audit.artifactSha256
    );
  }
  const delay = bytes(`${primary(6)}/specs/delivery/policies/delay/delay.spec.md`).toString();
  assert.match(delay, /^### DEL-REQ-1 /m);
  assert.match(delay, /родительский DEL-REQ-1/);
  assert.equal(rows[6].semanticVerdict, 'pass');
  assert.equal(manual.rows.find((r: any) => r.index === 6).semantic, 'fail');
  assert.equal(rows[7].semanticVerdict, 'worker-error');
  assert.equal(rows[7].metrics.wholeWrites, 0);
  assert.equal(rows[10].semanticVerdict, 'fail');
  assert.equal(manual.rows.find((r: any) => r.index === 10).semantic, 'inconclusive');
  const final = load('post-export-cleanup.json'),
    checkpoint = load('cleanup-proof.json');
  for (const key of [
    'ownedRuntimeRemoved',
    'privateConfigStateCacheRemoved',
    'ownedServerStopped',
    'temporarySourceWorktreesRemoved',
    'sharedDependenciesPreserved',
  ])
    assert.equal(final[key], true);
  assert.equal(final.ownedSDKSessionCountAfterCleanup, 0);
  assert.deepEqual(final.attemptCleanupErrors, []);
  assert.equal(checkpoint.attempts.length, 12);
  assert.equal(checkpoint.journalModesRestored, true);
});

it('TRANSFER1 successful-pair view excludes both members of incomplete or unconfirmed pairs', () => {
  const extra = load('supplemental.json'),
    rows = load('raw-rows.json'),
    manual = load('manual-review.json');
  const qualifies = (r: any) =>
    r.status === 'completed' &&
    r.semanticVerdict === 'pass' &&
    r.artifact.pass &&
    manual.rows.find((a: any) => a.index === r.index).semantic === 'pass';
  const ids = [...new Set(rows.map((r: any) => r.taskId))].filter((id) =>
    rows.filter((r: any) => r.taskId === id).every(qualifies)
  );
  assert.deepEqual(extra.successfulPairTaskIds, ids);
  assert.equal(ids.length, 4);
  for (const [metric, get] of Object.entries({
    tokens: (r: any) => r.worker.total,
    tools: (r: any) => r.metrics.tools,
    timeMs: (r: any) => r.worker.wallClockMs,
  })) {
    for (const arm of ['baseline', 'facts']) {
      const sum = rows
        .filter((r: any) => r.variant === arm && ids.includes(r.taskId))
        .reduce((n: number, r: any) => n + get(r), 0);
      assert.equal(
        extra.successfulPairTotals[metric][arm === 'facts' ? 'candidate' : 'baseline'],
        sum
      );
    }
  }
  assert.deepEqual(extra.observedRoleTokens.worker.executions, 12);
  assert.deepEqual(extra.observedRoleTokens.judge.executions, 11);
  assert.equal(extra.reflections, 0);
  assert.equal(extra.replacements, 0);
  assert.equal(extra.money, null);
});
