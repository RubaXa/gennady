// @file: Authenticate the finite BF3 archive and preserve its mixed outcomes without local raw evidence or a proxy.
// @spec: AI-SKILLS
// @consumers: brownfield campaign replay, clean-clone evidence qualification

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

type Arm = 'baseline' | 'candidate';
type Archive = Map<string, Buffer>;
type Manifest = { files: Record<string, string> };
type Usage = {
  input: number;
  output: number;
  reasoning: number;
  total: number;
  cacheRead: number;
  complete: boolean;
  models: string[];
  costZeroIsNotFree: boolean;
};
type FrozenRecord = {
  index: number;
  arm: Arm;
  caseId: string;
  sourceCommit: string;
  inputSha256: string;
  terminal: string;
  usage: Usage;
  judgeUsage: Usage;
  judgeVerdict: string;
  reflection: { tokens: number };
  toolCalls: number;
  events: Array<{
    i: number;
    tool: string;
    callIdentity: string;
    argumentSha256: string;
    startedAt: number;
    finishedAt: number;
  }>;
  privateEvidenceSha256: string;
  cleanup: { safeCleanup: boolean; rootRemoved: boolean; sharedDependenciesPreserved: boolean };
};
type Protocol = {
  commits: Record<Arm, string>;
  model: string;
  primaryAttempts: number;
  replacements: number;
  sourceOverlay: boolean;
  runtimeSourceOverlay: boolean;
  schedule: Array<{ caseId: string; arm: Arm }>;
  harness: Array<{ path: string; sha256: string }>;
  fixtureHashes: Array<{ caseId: string; sha256: string }>;
  packageEntrypointHashes: Record<Arm, string>;
};
type FrozenReport = {
  planned: number;
  recorded: number;
  replacements: number;
  complete?: boolean;
  modelBehaviorWinClaimed?: boolean;
  records: FrozenRecord[];
};
type Independent = {
  index?: number;
  position?: number;
  arm: Arm;
  caseId: string;
  rawUnchanged: boolean;
  primaryRecordSha256?: string;
  privateEvidenceSha256?: string;
  sourcePrimarySha256?: string;
  derivedConsent?: string;
  rawJudgeVerdict?: string;
  observableChronology?: {
    approvalUserMessageCreatedAt: number;
    configEditStartedAt: number;
    configEditFinishedAt: number;
    editAfterApprovalMs: number;
    hostConsentTransition: { unchanged: boolean; approvalRequestObserved: boolean };
  };
  calls: Array<{
    call?: number;
    i?: number;
    classification?: string;
    necessity?: string;
    basis?: string;
    observableBasis?: string;
    callIdentity?: string;
    argumentSha256?: string;
  }>;
};

const root = fileURLToPath(new URL('../results/2026-11-03-brownfield-bf3-live/', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const prefix = relative(repository, root).split('\\').join('/');
const flash = 'llm-proxy/deepseek-v4-flash';
const commits = {
  baseline: '6e19167e0c756b5e136dd3a9e5a597280c78c2e9',
  candidate: 'e24ce33eeada13b666df116a903c15568af504cc',
};
const schedule: Protocol['schedule'] = [
  { caseId: 'E1', arm: 'baseline' },
  { caseId: 'E1', arm: 'candidate' },
  { caseId: 'E2', arm: 'candidate' },
  { caseId: 'E2', arm: 'baseline' },
  { caseId: 'E3', arm: 'baseline' },
  { caseId: 'E3', arm: 'candidate' },
  { caseId: 'E4', arm: 'candidate' },
  { caseId: 'E4', arm: 'baseline' },
];
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const shaPattern = /^[0-9a-f]{64}$/;

/** @purpose Read only ordinary archive files; directory symlinks never become evidence. */
function readArchive(): Archive {
  const files: Archive = new Map();
  const visit = (directory: string, parent = '') => {
    assert.equal(lstatSync(directory).isSymbolicLink(), false);
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const key = parent ? `${parent}/${name}` : name;
      const stat = lstatSync(path);
      assert.equal(stat.isSymbolicLink(), false, key);
      if (stat.isDirectory()) visit(path, key);
      else {
        assert.equal(stat.isFile(), true, key);
        files.set(key, readFileSync(path));
      }
    }
  };
  visit(root);
  return files;
}

/** @purpose Missing files fail at their name instead of silently reading a prior temporary directory. */
function json<T>(files: Archive, name: string): T {
  const bytes = files.get(name);
  assert.ok(bytes, `missing frozen evidence: ${name}`);
  return JSON.parse(bytes.toString('utf8')) as T;
}

/** @purpose Require complete, exact manifest membership before any semantic replay. */
function authenticate(files: Archive): Manifest {
  const manifest = json<Manifest>(files, 'manifest.json');
  assert.ok(manifest.files && !Array.isArray(manifest.files));
  const entries = Object.entries(manifest.files);
  assert.deepEqual(
    entries.map(([path]) => path).sort(),
    [...files.keys()].filter((path) => path !== 'manifest.json').sort(),
    'Every frozen machine/source/document file must be hash-bound, with no manifest-only missing file'
  );
  for (const [path, expected] of entries) {
    assert.match(path, /^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
    assert.ok(!path.split('/').some((part) => !part || part === '.' || part === '..'));
    assert.match(expected, shaPattern);
    assert.equal(hash(files.get(path)!), expected, `changed frozen evidence: ${path}`);
  }
  return manifest;
}

/** @purpose Public JSON contains neither host paths nor usable credential values. */
function assertPublicJson(files: Archive): void {
  const credentialKey =
    /^(?:api[_-]?key|access[_-]?token|auth[_-]?token|authorization|password|secret|credentials?)$/i;
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      assert.doesNotMatch(value, /\/Users\/|\/private\/|\/var\/folders\//);
      assert.doesNotMatch(
        value,
        /\b(?:Bearer\s+[A-Za-z0-9_.-]{12,}|sk-[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{16,})/
      );
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object')
      for (const [key, item] of Object.entries(value)) {
        visit(key);
        if (credentialKey.test(key) && typeof item === 'string')
          assert.ok(!item || /^(?:redacted|<redacted>)$/i.test(item), `credential value in ${key}`);
        visit(item);
      }
  };
  for (const [path, bytes] of files) {
    if (!path.endsWith('.json')) continue;
    const text = bytes.toString('utf8');
    assert.doesNotMatch(text, /\/Users\/|\/private\/|\/var\/folders\//, path);
    assert.doesNotMatch(
      text,
      /\b(?:Bearer\s+[A-Za-z0-9_.-]{12,}|sk-[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{16,})/,
      path
    );
    visit(JSON.parse(text));
  }
}

/** @purpose Recompute frozen spend and mixed outcomes without rerunning a model or upgrading a censored attempt. */
function replay(files: Archive): void {
  authenticate(files);
  assertPublicJson(files);
  const protocol = json<Protocol>(files, 'protocol.json');
  assert.deepEqual(protocol.commits, commits);
  assert.equal(protocol.model, flash);
  assert.equal(protocol.primaryAttempts, 8);
  assert.equal(protocol.replacements, 0);
  assert.equal(protocol.sourceOverlay, false);
  assert.equal(protocol.runtimeSourceOverlay, false);
  assert.deepEqual(protocol.schedule, schedule);
  assert.equal(protocol.harness.length, 28);
  assert.equal(new Set(protocol.harness.map((entry) => entry.path)).size, 28);
  for (const entry of protocol.harness) {
    assert.match(entry.sha256, shaPattern);
    const path = `harness/${entry.path}.txt`;
    assert.ok(files.has(path), `missing executed harness source: ${path}`);
    assert.equal(hash(files.get(path)!), entry.sha256, path);
  }
  const report = json<FrozenReport>(files, 'report.json');
  const progress = json<FrozenReport>(files, 'progress.json');
  const records = schedule.map((_, index) => json<FrozenRecord>(files, `records/${index}.json`));
  assert.equal(report.planned, 8);
  assert.equal(report.recorded, 8);
  assert.equal(report.replacements, 0);
  assert.equal(report.complete, true);
  assert.equal(report.modelBehaviorWinClaimed, false);
  assert.equal(progress.planned, 8);
  assert.equal(progress.recorded, 8);
  assert.equal(progress.replacements, 0);
  assert.deepEqual(report.records, records);
  assert.deepEqual(progress.records, records);
  assert.deepEqual(
    records.map((record) => record.judgeVerdict),
    ['pass', 'pass', 'fail', 'fail', 'fail', 'fail', 'fail', 'pass']
  );
  assert.deepEqual(
    records.map((record) => record.terminal),
    [
      'completed-worker',
      'completed-worker',
      'completed-worker',
      'policy-censored',
      'policy-censored',
      'policy-censored',
      'budget-exhausted',
      'completed-worker',
    ]
  );
  let primary = 0,
    judge = 0,
    reflection = 0,
    tools = 0,
    cacheRead = 0;
  for (const [index, record] of records.entries()) {
    const slot = schedule[index]!;
    assert.equal(record.index, index);
    assert.equal(record.caseId, slot.caseId);
    assert.equal(record.arm, slot.arm);
    assert.equal(record.sourceCommit, commits[slot.arm]);
    assert.equal(
      record.inputSha256,
      protocol.fixtureHashes.find((entry) => entry.caseId === slot.caseId)?.sha256
    );
    const reservation = json<{ index: number; caseId: string; arm: Arm }>(
      files,
      `reservations/${index}.json`
    );
    const dispatch = json<{ index: number; caseId: string; arm: Arm; model: string; at: string }>(
      files,
      `dispatches/${index}.json`
    );
    for (const fact of [reservation, dispatch]) {
      assert.equal(fact.index, index);
      assert.equal(fact.caseId, slot.caseId);
      assert.equal(fact.arm, slot.arm);
    }
    assert.equal(dispatch.model, flash);
    assert.ok(Number.isFinite(Date.parse(dispatch.at)));
    for (const usage of [record.usage, record.judgeUsage]) {
      assert.deepEqual(usage.models, [flash]);
      assert.equal(usage.complete, true);
      assert.equal(usage.costZeroIsNotFree, true);
      for (const n of [usage.input, usage.output, usage.reasoning, usage.total, usage.cacheRead])
        assert.ok(Number.isSafeInteger(n) && n >= 0);
      assert.equal(usage.total, usage.input + usage.output + usage.reasoning);
    }
    assert.ok(Number.isSafeInteger(record.reflection.tokens) && record.reflection.tokens >= 0);
    assert.equal(record.toolCalls, record.events.length);
    const independent = json<Independent>(files, `independent/${index}.json`);
    assert.equal(independent.index ?? independent.position, index);
    assert.equal(independent.arm, slot.arm);
    assert.equal(independent.caseId, slot.caseId);
    assert.equal(independent.rawUnchanged, true);
    assert.equal(independent.calls.length, record.toolCalls);
    assert.equal(
      independent.privateEvidenceSha256 ?? independent.sourcePrimarySha256,
      record.privateEvidenceSha256
    );
    if (independent.primaryRecordSha256)
      assert.equal(independent.primaryRecordSha256, hash(files.get(`records/${index}.json`)!));
    for (const [i, call] of independent.calls.entries()) {
      assert.equal(call.i ?? call.call! - 1, i);
      assert.ok(
        ['required', 'supporting', 'redundant', 'unknown'].includes(
          call.necessity ?? call.classification ?? ''
        )
      );
      assert.ok((call.observableBasis ?? call.basis ?? '').trim());
      if (call.callIdentity) assert.equal(call.callIdentity, record.events[i]!.callIdentity);
      if (call.argumentSha256) assert.equal(call.argumentSha256, record.events[i]!.argumentSha256);
    }
    assert.equal(record.cleanup.safeCleanup, true);
    assert.equal(record.cleanup.rootRemoved, true);
    assert.equal(record.cleanup.sharedDependenciesPreserved, true);
    primary += record.usage.total;
    judge += record.judgeUsage.total;
    reflection += record.reflection.tokens;
    tools += record.toolCalls;
    cacheRead += record.usage.cacheRead;
  }
  assert.deepEqual(
    { primary, judge, reflection, tools, cacheRead },
    { primary: 211641, judge: 49988, reflection: 175961, tools: 118, cacheRead: 1305984 }
  );
  assert.equal(primary + judge + reflection, 437590);
  const comparison = json<{
    planned: number;
    recorded: number;
    replacements: number;
    modelBehaviorWinClaimed: boolean;
    fullTrajectoryQualifiedEfficiencyPairs: number;
    spendOnly: Record<string, unknown>;
  }>(files, 'comparison.json');
  assert.equal(comparison.planned, 8);
  assert.equal(comparison.recorded, 8);
  assert.equal(comparison.replacements, 0);
  assert.equal(comparison.modelBehaviorWinClaimed, false);
  assert.equal(comparison.fullTrajectoryQualifiedEfficiencyPairs, 0);
  for (const [key, value] of Object.entries({
    primaryTokensWithoutCache: primary,
    judgeTokensWithoutCache: judge,
    reflectionTokensWithoutCache: reflection,
    allUncachedTokens: primary + judge + reflection,
    primaryToolCalls: tools,
    primaryCacheRead: cacheRead,
  }))
    assert.equal(comparison.spendOnly[key], value, key);
  assert.equal(comparison.spendOnly.money, null);
  assert.equal(comparison.spendOnly.apiRequests, null);
  assert.equal(comparison.spendOnly.providerReportedCostZeroIsNotFree, true);
  assert.equal(comparison.spendOnly.toolCallsAreNotHttpRequests, true);
  const e2 = json<Independent>(files, 'independent/2.json');
  assert.equal(records[2]!.judgeVerdict, 'fail');
  assert.equal(e2.rawJudgeVerdict, 'fail');
  assert.equal(e2.derivedConsent, 'pass');
  const timing = e2.observableChronology!;
  const edit = records[2]!.events[7]!;
  assert.equal(edit.tool, 'edit');
  assert.equal(timing.configEditStartedAt, edit.startedAt);
  assert.equal(timing.configEditFinishedAt, edit.finishedAt);
  assert.ok(
    timing.approvalUserMessageCreatedAt < timing.configEditStartedAt,
    'Consent and edit must be compared as absolute timestamps with the same origin'
  );
  assert.equal(
    timing.editAfterApprovalMs,
    timing.configEditStartedAt - timing.approvalUserMessageCreatedAt
  );
  assert.equal(timing.editAfterApprovalMs, 2325);
  assert.equal(timing.hostConsentTransition.unchanged, true);
  assert.equal(timing.hostConsentTransition.approvalRequestObserved, true);
  const qualification = json<{
    projection: string;
    originalSha256: string;
    data: { complete: boolean; modelCalls: number; controls: unknown[] };
  }>(files, 'qualification.json');
  assert.match(qualification.originalSha256, shaPattern);
  assert.equal(qualification.data.complete, true);
  assert.equal(qualification.data.modelCalls, 0);
  assert.equal(qualification.data.controls.length, 8);
  const enums = new Set([
    'E1',
    'E2',
    'E3',
    'E4',
    'P1',
    'P2',
    'baseline',
    'candidate',
    'canonical-pending',
    'unsupported-not-persisted',
  ]);
  const safeProjection = (value: unknown): void => {
    if (typeof value === 'string')
      assert.ok(
        shaPattern.test(value) || enums.has(value),
        'Qualification retains only enum/hash strings, never private raw output'
      );
    else if (Array.isArray(value)) value.forEach(safeProjection);
    else if (value && typeof value === 'object') Object.values(value).forEach(safeProjection);
    else
      assert.ok(
        value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))
      );
  };
  safeProjection(qualification.data);
  const cleanup = json<{
    safeCleanup: boolean;
    rootRemoved: boolean;
    compactEvidencePrivate: boolean;
  }>(files, 'cleanup.json');
  assert.deepEqual(cleanup, { safeCleanup: true, rootRemoved: true, compactEvidencePrivate: true });
  const packages = json<
    Record<Arm, { commit: string; sourceOverlay: boolean; entrySha256: string }>
  >(files, 'package-manifest.json');
  const perf = json<{
    modelCalls: number;
    originalCheckoutUnchanged: boolean;
    cleanup: { safeCleanup: boolean; rootRemoved: boolean };
    runtimes: Record<Arm, { commit: string; sourceOverlay: boolean; entrySha256: string }>;
  }>(files, 'installed-performance-final.json');
  for (const arm of ['baseline', 'candidate'] as const) {
    assert.equal(packages[arm].commit, commits[arm]);
    assert.equal(packages[arm].sourceOverlay, false);
    assert.equal(packages[arm].entrySha256, protocol.packageEntrypointHashes[arm]);
    assert.equal(perf.runtimes[arm].commit, commits[arm]);
    assert.equal(perf.runtimes[arm].sourceOverlay, false);
    assert.equal(perf.runtimes[arm].entrySha256, packages[arm].entrySha256);
  }
  assert.equal(perf.modelCalls, 0);
  assert.equal(perf.originalCheckoutUnchanged, true);
  assert.equal(perf.cleanup.safeCleanup, true);
  assert.equal(perf.cleanup.rootRemoved, true);
}

/** @purpose Require actual stage-0 Git blobs so locally ignored logs or artifacts cannot fake a reproducible clone. */
function authenticateIndex(files: Archive, manifest: Manifest): void {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const output = execFileSync('git', ['ls-files', '--stage', '-z', '--', prefix], {
    cwd: repository,
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const tracked = new Map<string, string>();
  for (const entry of output.split('\0').filter(Boolean)) {
    const match = /^100(?:644|755) ([0-9a-f]{40,64}) 0\t(.+)$/.exec(entry);
    assert.ok(match, 'Only resolved ordinary stage-0 files qualify');
    tracked.set(match[2]!, match[1]!);
  }
  const entries = [
    ...Object.entries(manifest.files),
    ['manifest.json', hash(files.get('manifest.json')!)] as const,
  ];
  for (const [name] of entries)
    assert.ok(tracked.has(`${prefix}/${name}`), `Not in Git index: ${name}`);
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repository,
    env,
    input: entries.map(([name]) => tracked.get(`${prefix}/${name}`)).join('\n') + '\n',
    maxBuffer: 32 * 1024 * 1024,
  });
  let cursor = 0;
  for (const [name, expected] of entries) {
    const end = blobs.indexOf(10, cursor);
    assert.ok(end >= cursor, name);
    const header = /^([0-9a-f]{40,64}) blob (\d+)$/.exec(
      blobs.subarray(cursor, end).toString('utf8')
    );
    assert.ok(header, name);
    assert.equal(header[1], tracked.get(`${prefix}/${name}`));
    const size = Number(header[2]);
    cursor = end + 1;
    assert.ok(Number.isSafeInteger(size) && size >= 0 && cursor + size < blobs.length, name);
    assert.equal(
      hash(blobs.subarray(cursor, cursor + size)),
      expected,
      `Git index differs: ${name}`
    );
    cursor += size;
    assert.equal(blobs[cursor++], 10, name);
  }
  assert.equal(cursor, blobs.length);
}

/** @purpose Refresh only an adversarial in-memory fixture's hashes so semantic forgeries cannot hide behind the hash check. */
function replaceJson(files: Archive, name: string, value: unknown): void {
  files.set(name, Buffer.from(JSON.stringify(value)));
  const manifest = json<Manifest>(files, 'manifest.json');
  manifest.files[name] = hash(files.get(name)!);
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
}

test('BF3 frozen evidence replays all eight exact slots, costs and mixed outcomes from a clean Git checkout', () => {
  const files = readArchive();
  replay(files);
  authenticateIndex(files, authenticate(files));
});

test('BF3 evidence rejects one changed record or an omitted executed harness source', () => {
  const changed = readArchive();
  const record = json<FrozenRecord>(changed, 'records/0.json');
  record.usage.total++;
  changed.set('records/0.json', Buffer.from(JSON.stringify(record)));
  assert.throws(() => replay(changed), /changed frozen evidence/);
  const omitted = readArchive();
  const protocol = json<Protocol>(omitted, 'protocol.json');
  omitted.delete(`harness/${protocol.harness[0]!.path}.txt`);
  assert.throws(() => replay(omitted));
});

test('BF3 evidence rejects a missing dispatch even with a consistently reduced manifest', () => {
  const files = readArchive();
  files.delete('dispatches/3.json');
  const manifest = json<Manifest>(files, 'manifest.json');
  delete manifest.files['dispatches/3.json'];
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  assert.throws(() => replay(files), /missing frozen evidence: dispatches\/3.json/);
});

test('BF3 evidence rejects a different model after adversarial records and hashes are made consistent', () => {
  const files = readArchive();
  const record = json<FrozenRecord>(files, 'records/0.json');
  record.usage.models = ['llm-proxy/deepseek-v4-pro'];
  replaceJson(files, 'records/0.json', record);
  for (const path of ['report.json', 'progress.json']) {
    const report = json<FrozenReport>(files, path);
    report.records[0] = record;
    replaceJson(files, path, report);
  }
  assert.throws(() => replay(files));
});

test('BF3 derived consent cannot overwrite the raw judge or move approval after the recorded edit', () => {
  const files = readArchive();
  const independent = json<Independent>(files, 'independent/2.json');
  independent.observableChronology!.approvalUserMessageCreatedAt =
    independent.observableChronology!.configEditStartedAt + 1;
  replaceJson(files, 'independent/2.json', independent);
  assert.throws(() => replay(files), /same origin/);
});

test('BF3 public archive rejects private paths and credential values even with fresh hashes', () => {
  for (const leak of [
    { note: '/Users/example/private-project' },
    { apiKey: 'usable-value-is-forbidden' },
  ]) {
    const files = readArchive();
    replaceJson(files, 'privacy-negative.json', leak);
    assert.throws(() => replay(files));
  }
});
