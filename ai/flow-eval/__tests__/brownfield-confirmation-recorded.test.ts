// @file: Authenticate the two bounded brownfield confirmations without rerunning a model or regrading censored evidence.
// @spec: AI-SKILLS
// @consumers: clean-clone BF3 confirmation replay

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { brownfieldConfirmationAccepted } from '../brownfield-benchmark.ts';

const root = fileURLToPath(
  new URL('../results/2026-11-03-brownfield-e3-e4-confirmation/', import.meta.url)
);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const runner = 'e0908aa5ab413db8172dce222bd46592adceaaa8';
const product = '0a506340d6fe6a509b752f2585c17ff8b57ca326';
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const load = <T>(name: string): T => JSON.parse(readFileSync(join(root, name), 'utf8')) as T;
type Record = Parameters<typeof brownfieldConfirmationAccepted>[0] & {
  index: number;
  caseId: string;
  arm: string;
  sourceCommit: string;
  confirmationAccepted: boolean;
  confirmationStatus: string;
  terminal: string;
  toolCalls: number;
  workerElapsedMs: number;
  trajectoryStatus: string;
  privateEvidenceSha256: string;
  usage: {
    input: number;
    output: number;
    reasoning: number;
    total: number;
    cacheRead: number;
    models: string[];
    complete: boolean;
    costZeroIsNotFree: boolean;
  };
  judgeUsage: { total: number };
  reflection: { tokens: number };
  oracle: {
    persistencePass?: boolean;
    proposalInvocationProven?: boolean;
    phase2Dispatched?: boolean;
    canonicalPassJournal?: boolean;
  };
  hostReviewReceipt?: { exit: number };
  cleanup: {
    safeCleanup: boolean;
    rootRemoved: boolean;
    sharedDependenciesPreserved: boolean;
    logicalBytesRemoved: number;
  };
};
const records = () => [load<Record>('records/0.json'), load<Record>('records/1.json')];

/** @purpose Read exact archive membership without following symlinks or accepting absent evidence. */
function archive(directory = root, parent = ''): Map<string, Buffer> {
  assert.equal(lstatSync(directory).isSymbolicLink(), false);
  const result = new Map<string, Buffer>();
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const key = parent ? `${parent}/${name}` : name;
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory())
      for (const [childKey, bytes] of archive(path, key)) result.set(childKey, bytes);
    else {
      assert.equal(stat.isFile(), true);
      result.set(key, readFileSync(path));
    }
  }
  return result;
}

/** @purpose Fail for missing, modified or extra artifacts, including locally present but Git-ignored evidence. */
function authenticate(files: Map<string, Buffer>): void {
  const manifest = JSON.parse(files.get('manifest.json')!.toString()) as {
    files: { [path: string]: string };
  };
  assert.deepEqual(
    Object.keys(manifest.files).sort(),
    [...files.keys()].filter((path) => path !== 'manifest.json').sort()
  );
  for (const [path, expected] of Object.entries(manifest.files)) {
    assert.ok(!path.split('/').some((part) => !part || part === '..' || part === '.'));
    assert.match(expected, /^[a-f0-9]{64}$/);
    assert.equal(hash(files.get(path)!), expected, path);
  }
}

test('confirmation archive is exhaustive, hash-bound, Git-tracked and rejects tampering', () => {
  const files = archive();
  authenticate(files);
  const prefix = relative(repository, root).split('\\').join('/');
  const tracked = execFileSync('git', ['ls-files', '-z', '--', prefix], { cwd: repository })
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((path) => path.slice(prefix.length + 1));
  assert.deepEqual(tracked.sort(), [...files.keys()].sort());
  const changed = new Map(files);
  changed.set('records/0.json', Buffer.from('{}'));
  assert.throws(() => authenticate(changed));
  const missing = new Map(files);
  missing.delete('independent/1.json');
  assert.throws(() => authenticate(missing));
});

test('executed v2 harness and runtime bind to reviewed product; no third model position is hidden', () => {
  const p = load<{
    commits: { candidate: string };
    reviewedProductCommit: string;
    fixtureRevision: string;
    model: string;
    primaryAttempts: number;
    replacements: number;
    sourceOverlay: boolean;
    runtimeSourceOverlay: boolean;
    schedule: unknown[];
    harness: { path: string; sha256: string }[];
    packageManifestSha256: string;
  }>('protocol.json');
  assert.equal(p.commits.candidate, runner);
  assert.equal(p.reviewedProductCommit, product);
  assert.equal(p.fixtureRevision, 'e3-host-cache-and-scoped-invocation-v2');
  assert.equal(p.model, 'llm-proxy/deepseek-v4-flash');
  assert.equal(p.primaryAttempts, 2);
  assert.equal(p.replacements, 0);
  assert.equal(p.sourceOverlay, false);
  assert.equal(p.runtimeSourceOverlay, false);
  assert.deepEqual(p.schedule, [
    { caseId: 'E3', arm: 'candidate' },
    { caseId: 'E4', arm: 'candidate' },
  ]);
  for (const source of p.harness)
    assert.equal(hash(readFileSync(join(root, 'harness', `${source.path}.txt`))), source.sha256);
  assert.equal(hash(readFileSync(join(root, 'runtime-manifest.json'))), p.packageManifestSha256);
  const q = load<{ complete: boolean; modelCalls: number; controls: unknown[] }>(
    'qualification.json'
  );
  assert.equal(q.complete, true);
  assert.equal(q.modelCalls, 0);
  assert.equal(q.controls.length, 2);
  const report = load<{
    planned: number;
    recorded: number;
    replacements: number;
    complete: boolean;
    accepted: number;
    modelBehaviorWinClaimed: boolean;
    records: Record[];
  }>('report.json');
  assert.equal(report.planned, 2);
  assert.equal(report.recorded, 2);
  assert.equal(report.replacements, 0);
  assert.equal(report.complete, true);
  assert.equal(report.accepted, 1);
  assert.equal(report.modelBehaviorWinClaimed, false);
  assert.deepEqual(report.records, records());
});

test('E3 stays censored with no pending persistence; E4 requires actual host review after both phases', () => {
  const [e3, e4] = records() as [Record, Record];
  assert.equal(e3.terminal, 'policy-censored');
  assert.equal(e3.confirmationStatus, 'not-proven');
  assert.equal(e3.oracle.persistencePass, false);
  assert.equal(e3.oracle.proposalInvocationProven, false);
  assert.equal(e3.confirmationAccepted, false);
  assert.equal(brownfieldConfirmationAccepted(e3), false);
  assert.equal(e4.confirmationStatus, 'proven');
  assert.equal(e4.oracle.phase2Dispatched, true);
  assert.equal(e4.oracle.canonicalPassJournal, true);
  assert.equal(e4.hostReviewReceipt?.exit, 0);
  assert.equal(e4.confirmationAccepted, true);
  assert.equal(brownfieldConfirmationAccepted(e4), true);
  assert.equal(brownfieldConfirmationAccepted({ ...e4, hostReviewReceipt: undefined }), false);
  assert.equal(e4.trajectoryStatus, 'not-proven');
  const audit = load<{
    checks: {
      actualP1WriteNotSeededAnswer: boolean;
      actualP1AndP2VerifyPass: boolean;
      realHostReviewReceiptExit: number;
    };
    rawEvidenceBinding: { publicPrivateEvidenceSha256: string };
    toolCalls: unknown[];
  }>('independent/1.json');
  assert.equal(audit.checks.actualP1WriteNotSeededAnswer, true);
  assert.equal(audit.checks.actualP1AndP2VerifyPass, true);
  assert.equal(audit.checks.realHostReviewReceiptExit, 0);
  assert.equal(audit.rawEvidenceBinding.publicPrivateEvidenceSha256, e4.privateEvidenceSha256);
  assert.equal(audit.toolCalls.length, 17);
});

test('all measured stages and cleanup are accounted without claiming zero monetary cost', () => {
  const rows = records();
  assert.deepEqual(
    rows.map((r) => r.toolCalls),
    [8, 17]
  );
  assert.deepEqual(
    rows.map((r) => r.workerElapsedMs),
    [90482, 40472]
  );
  assert.equal(
    rows.reduce((sum, r) => sum + r.usage.total, 0),
    52232
  );
  assert.equal(
    rows.reduce((sum, r) => sum + r.judgeUsage.total, 0),
    16165
  );
  assert.equal(
    rows.reduce((sum, r) => sum + r.reflection.tokens, 0),
    42713
  );
  assert.equal(
    rows.reduce((sum, r) => sum + r.usage.total + r.judgeUsage.total + r.reflection.tokens, 0),
    111110
  );
  assert.equal(
    rows.reduce((sum, r) => sum + r.usage.cacheRead, 0),
    406144
  );
  assert.equal(
    rows.reduce((sum, r) => sum + r.cleanup.logicalBytesRemoved, 0),
    214625274
  );
  for (const row of rows) {
    assert.equal(row.sourceCommit, runner);
    assert.equal(row.usage.total, row.usage.input + row.usage.output + row.usage.reasoning);
    assert.deepEqual(row.usage.models, ['llm-proxy/deepseek-v4-flash']);
    assert.equal(row.usage.complete, true);
    assert.equal(row.usage.costZeroIsNotFree, true);
    assert.equal(row.cleanup.safeCleanup, true);
    assert.equal(row.cleanup.rootRemoved, true);
    assert.equal(row.cleanup.sharedDependenciesPreserved, true);
  }
});

test('public JSON excludes private checkout paths, source captures and credential values', () => {
  for (const [path, bytes] of archive()) {
    if (!path.endsWith('.json')) continue;
    const text = bytes.toString();
    assert.doesNotMatch(text, /\/Users\/|\/private\/|\/var\/folders\//, path);
    assert.doesNotMatch(
      text,
      /\b(?:Bearer\s+[A-Za-z0-9_.-]{12,}|glpat-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{16,})/,
      path
    );
  }
});
