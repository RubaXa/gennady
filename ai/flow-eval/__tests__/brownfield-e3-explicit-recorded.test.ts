// @file: Replay one authorized E3 v3 observation while preserving prior FAIL and the conservative raw recognizer outcome.
// @spec: AI-SKILLS
// @consumers: local brownfield confirmation evidence review

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { brownfieldConfirmationAccepted } from '../brownfield-benchmark.ts';

const root = fileURLToPath(
  new URL('../results/2026-11-03-brownfield-e3-explicit-command/', import.meta.url)
);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const load = <T>(name: string): T => JSON.parse(readFileSync(join(root, name), 'utf8')) as T;
const base = '9f19fb431fda609b945aae9f4906b7228e01e9c8';

type Attempt = Parameters<typeof brownfieldConfirmationAccepted>[0] & {
  sourceCommit: string;
  index: number;
  confirmationAccepted: boolean;
  confirmationStatus: string;
  inputSha256: string;
  privateEvidenceSha256: string;
  toolCalls: number;
  workerElapsedMs: number;
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
  cleanup: {
    safeCleanup: boolean;
    rootRemoved: boolean;
    logicalBytesRemoved: number;
    sharedDependenciesPreserved: boolean;
  };
};

/** @purpose Enumerate only regular frozen files; absent, extra and symlink evidence is never silently accepted. */
function archive(directory = root, parent = ''): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  assert.equal(lstatSync(directory).isSymbolicLink(), false);
  for (const name of readdirSync(directory)) {
    const path = join(directory, name),
      key = parent ? `${parent}/${name}` : name;
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory())
      for (const [child, bytes] of archive(path, key)) result.set(child, bytes);
    else {
      assert.equal(stat.isFile(), true);
      result.set(key, readFileSync(path));
    }
  }
  return result;
}

/** @purpose Prove exact archive membership and bytes rather than trusting a completed flag alone. */
function authenticate(files: Map<string, Buffer>): void {
  const m = JSON.parse(files.get('manifest.json')!.toString()) as { files: Record<string, string> };
  assert.deepEqual(
    Object.keys(m.files).sort(),
    [...files.keys()].filter((p) => p !== 'manifest.json').sort()
  );
  for (const [path, expected] of Object.entries(m.files)) {
    assert.ok(!path.split('/').some((part) => !part || part === '.' || part === '..'));
    assert.match(expected, /^[a-f0-9]{64}$/);
    assert.equal(hash(files.get(path)!), expected, path);
  }
}

test('one-case archive is exhaustive, Git-tracked and rejects changed or absent evidence', () => {
  const files = archive();
  authenticate(files);
  const prefix = relative(repository, root).split('\\').join('/');
  const tracked = execFileSync('git', ['ls-files', '-z', '--', prefix], { cwd: repository })
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((p) => p.slice(prefix.length + 1));
  assert.deepEqual(tracked.sort(), [...files.keys()].sort());
  const changed = new Map(files);
  changed.set('records/0.json', Buffer.from('{}'));
  assert.throws(() => authenticate(changed));
  const missing = new Map(files);
  missing.delete('independent-observation.json');
  assert.throws(() => authenticate(missing));
});

test('exactly one E3 ran on committed v3; temporary controller differs only in location, one-case queue and provenance', () => {
  const p = load<{
    commits: { candidate: string };
    reviewedProductCommit: string;
    schedule: unknown[];
    primaryAttempts: number;
    replacements: number;
    fixtureRevision: string;
    sourceOverlay: boolean;
    model: string;
    packageManifestSha256: string;
    harness: { path: string; sha256: string }[];
    controllerProvenance: { canonicalRunnerSha256: string; controllerTracked: boolean };
  }>('protocol.json');
  assert.equal(p.commits.candidate, base);
  assert.equal(p.reviewedProductCommit, '0a506340d6fe6a509b752f2585c17ff8b57ca326');
  assert.equal(p.primaryAttempts, 1);
  assert.equal(p.replacements, 0);
  assert.deepEqual(p.schedule, [{ caseId: 'E3', arm: 'candidate' }]);
  assert.equal(p.fixtureRevision, 'e3-explicit-proposal-command-v3');
  assert.equal(p.sourceOverlay, false);
  assert.equal(p.model, 'llm-proxy/deepseek-v4-flash');
  assert.equal(p.controllerProvenance.controllerTracked, false);
  const snapshots = load<Record<string, string>>('snapshot-paths.json');
  for (const source of p.harness)
    assert.equal(hash(readFileSync(join(root, snapshots[source.path]!))), source.sha256);
  assert.equal(hash(readFileSync(join(root, 'runtime-manifest.json'))), p.packageManifestSha256);
  const canonical = readFileSync(join(root, 'harness/canonical-runner.ts.txt'), 'utf8');
  assert.equal(hash(canonical), p.controllerProvenance.canonicalRunnerSha256);
  const controller = readFileSync(join(root, 'harness/one-case-controller.ts.txt'), 'utf8');
  const prereg = load<{ controllerSha256: string }>('preregistration.json');
  assert.equal(hash(controller), prereg.controllerSha256);
  const schedule = `  const baseCampaign = brownfieldCampaign(mode);
  assert.equal(baseCampaign.confirmation, true, 'one-case controller is confirmation-only');
  const positions = Object.freeze(baseCampaign.positions.filter((position) => position.caseId === 'E3'));
  assert.deepEqual(positions, [{ caseId: 'E3', arm: 'candidate' }], 'exactly one authorized E3 position');
  const campaign = Object.freeze({ ...baseCampaign, id: 'bf3-e3-explicit-command-single', positions, qualificationPositions: positions });`;
  assert.ok(controller.includes(schedule));
  const normalized = controller
    .replaceAll(
      "from '../../ai/flow-eval/scripts/execution-autonomy-shell-carrier.ts'",
      "from './execution-autonomy-shell-carrier.ts'"
    )
    .replaceAll("from '../../ai/flow-eval/", "from '../")
    .replace(
      "const root = resolve(import.meta.dirname, '../..');",
      "const root = resolve(import.meta.dirname, '../../..');"
    )
    .replace(schedule, '  const campaign = brownfieldCampaign(mode);')
    .replace(/^      controllerProvenance: .*\n/m, '');
  assert.equal(normalized, canonical, 'No safety/acceptance/fixture/model logic may differ');
  for (const name of ['reservations', 'dispatches', 'records'])
    assert.deepEqual(readdirSync(join(root, name)), ['0.json']);
  const q = load<{
    complete: boolean;
    modelCalls: number;
    controls: { caseId: string; reference: { persistencePass: boolean } }[];
  }>('qualification.json');
  assert.equal(q.complete, true);
  assert.equal(q.modelCalls, 0);
  assert.equal(q.controls.length, 1);
  assert.equal(q.controls[0]!.caseId, 'E3');
  assert.equal(q.controls[0]!.reference.persistencePass, true);
});

test('real pending observation stays separate from raw strict NOT PROVEN and never edits prior failures', () => {
  const r = load<Attempt>('records/0.json');
  assert.equal(r.terminal, 'completed-worker');
  assert.equal(r.domainPass, true);
  assert.equal(r.oracle?.persistencePass, true);
  assert.equal(r.judgeVerdict, 'pass');
  assert.equal(r.oracle?.proposalInvocationProven, false);
  assert.equal(r.confirmationAccepted, false);
  assert.equal(r.confirmationStatus, 'not-proven');
  assert.equal(brownfieldConfirmationAccepted(r), false);
  const audit = load<{
    evidenceSha256: { privatePrimary: string; rawRecord: string; protocol: string };
    inputSha256: string;
    derivedObservation: {
      canonicalPendingPersisted: boolean;
      selfVerdictInvocationObserved: boolean;
      directSpecEditToolObserved: boolean;
      sourceConfigAndOtherExistingSpecBytesPreserved: boolean;
      proposalActualExit: number;
      lintActualExit: number;
    };
    rawOutcome: { confirmationAccepted: boolean };
    recognizerExplanation: { noRetroactivePass: boolean };
  }>('independent-observation.json');
  assert.equal(audit.evidenceSha256.privatePrimary, r.privateEvidenceSha256);
  assert.equal(audit.evidenceSha256.rawRecord, hash(readFileSync(join(root, 'records/0.json'))));
  assert.equal(audit.evidenceSha256.protocol, hash(readFileSync(join(root, 'protocol.json'))));
  assert.equal(audit.inputSha256, r.inputSha256);
  assert.equal(audit.derivedObservation.canonicalPendingPersisted, true);
  assert.equal(audit.derivedObservation.selfVerdictInvocationObserved, false);
  assert.equal(audit.derivedObservation.directSpecEditToolObserved, false);
  assert.equal(audit.derivedObservation.sourceConfigAndOtherExistingSpecBytesPreserved, true);
  assert.equal(audit.derivedObservation.proposalActualExit, 0);
  assert.equal(audit.derivedObservation.lintActualExit, 1);
  assert.equal(audit.rawOutcome.confirmationAccepted, false);
  assert.equal(audit.recognizerExplanation.noRetroactivePass, true);
  const old = load<{ path: string; sha256: string }[]>('prior-evidence-bindings.json');
  for (const item of old)
    assert.equal(hash(readFileSync(join(repository, item.path))), item.sha256);
});

test('attempt count, complete spend, privacy and cleanup are verified offline', () => {
  const r = load<Attempt>('records/0.json');
  const report = load<{
    planned: number;
    recorded: number;
    complete: boolean;
    replacements: number;
    accepted: number;
    modelBehaviorWinClaimed: boolean;
    records: Attempt[];
  }>('report.json');
  assert.equal(report.planned, 1);
  assert.equal(report.recorded, 1);
  assert.equal(report.complete, true);
  assert.equal(report.replacements, 0);
  assert.equal(report.accepted, 0);
  assert.equal(report.modelBehaviorWinClaimed, false);
  assert.deepEqual(report.records, [r]);
  assert.equal(r.sourceCommit, base);
  assert.equal(r.toolCalls, 9);
  assert.equal(r.workerElapsedMs, 25224);
  assert.equal(r.usage.total, 12744);
  assert.equal(r.usage.total, r.usage.input + r.usage.output + r.usage.reasoning);
  assert.equal(r.judgeUsage.total, 4435);
  assert.equal(r.reflection.tokens, 6955);
  assert.equal(r.usage.total + r.judgeUsage.total + r.reflection.tokens, 24134);
  assert.equal(r.usage.cacheRead, 76288);
  assert.equal(r.usage.complete, true);
  assert.equal(r.usage.costZeroIsNotFree, true);
  assert.deepEqual(r.usage.models, ['llm-proxy/deepseek-v4-flash']);
  assert.equal(r.cleanup.safeCleanup, true);
  assert.equal(r.cleanup.rootRemoved, true);
  assert.equal(r.cleanup.sharedDependenciesPreserved, true);
  assert.equal(r.cleanup.logicalBytesRemoved, 107061552);
  for (const [path, bytes] of archive())
    if (path.endsWith('.json')) {
      const text = bytes.toString();
      assert.doesNotMatch(text, /\/Users\/|\/private\/|\/var\/folders\//, path);
      assert.doesNotMatch(
        text,
        /\b(?:Bearer\s+[A-Za-z0-9_.-]{12,}|glpat-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{16,})/,
        path
      );
      JSON.parse(text);
    }
});
