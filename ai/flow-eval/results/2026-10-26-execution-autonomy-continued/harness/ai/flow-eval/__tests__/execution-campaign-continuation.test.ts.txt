// @file: Finite campaign continuation rejects replacement, provenance drift and unsafe evidence.
// @spec: AI-SKILLS
// @consumers: execution campaign continuation regression suite

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { EXECUTION_AUTONOMY_CASE_IDS } from '../execution-autonomy-cases.ts';
import {
  readExecutionContinuation,
  type ExecutionCampaignEntry,
} from '../execution-campaign-continuation.ts';

/** @purpose Create bounded synthetic public evidence; never use real campaign records.
 * @param context Test-owned cleanup registration.
 * @param spent Number of spent prefix records to seed.
 * @returns Isolated evidence, original schedule and reader for causal mutations.
 */
function fixture(context: TestContext, spent = 2) {
  const root = mkdtempSync(join(tmpdir(), 'gennady-continuation-test-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const prefix = 'ai/flow-eval/results/synthetic-prior';
  const directory = join(root, prefix);
  mkdirSync(join(directory, 'records'), { recursive: true });
  const schedule: ExecutionCampaignEntry[] = EXECUTION_AUTONOMY_CASE_IDS.flatMap(
    (caseId, index) => {
      const arms: ExecutionCampaignEntry['arm'][] =
        index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
      return arms.map((arm) => ({ caseId, arm }));
    }
  );
  const commits = { baseline: 'synthetic-baseline', candidate: 'synthetic-candidate' };
  const protocol = {
    planned: 16,
    model: 'llm-proxy/deepseek-v4-flash',
    schedule,
    commits,
  };
  const write = (name: string, value: unknown) =>
    writeFileSync(join(directory, name), JSON.stringify(value) + '\n');
  write('protocol.json', protocol);
  write('cleanup-recovery.json', { rootRemoved: true, privateConfigRemoved: true });
  write('stand-invalidation.json', {
    classification: 'invalid-fixture-full-audit',
    replaceAttempts: false,
  });
  for (let index = 0; index < spent; index++)
    write(`records/${index}.json`, { ...schedule[index], synthetic: true });
  return {
    root,
    prefix,
    directory,
    schedule,
    commits,
    protocol,
    write,
    read: () => readExecutionContinuation(root, directory, schedule, commits),
  };
}

test('two spent attempts leave exactly the fourteen original unstarted attempts, never replacements', (t) => {
  const f = fixture(t);
  const original = structuredClone(f.schedule);
  const result = f.read();
  assert.equal(result.spent, 2);
  assert.equal(result.remaining.length, 14);
  assert.deepEqual(result.remaining, original.slice(2));
  assert.deepEqual(f.schedule, original);
  assert.deepEqual(result.provenance.invalidCases, [original[0]!.caseId]);
  assert.ok(result.remaining.every((entry) => entry.caseId !== original[0]!.caseId));
  assert.equal(result.provenance.priorDirectory, f.prefix);
  assert.equal(result.provenance.originalBudget, 16);
  assert.equal(result.provenance.replacementAttempts, 0);
  assert.match(result.provenance.limitation, /NOT PROVEN/);
  assert.match(result.provenance.limitation, /never pool fixture versions/);
});

test('provenance binds every consumed input to its exact bytes, including prior attempt facts', (t) => {
  const f = fixture(t);
  const result = f.read();
  const names = [
    'protocol.json',
    'cleanup-recovery.json',
    'stand-invalidation.json',
    'records/0.json',
    'records/1.json',
  ];
  assert.deepEqual(
    result.provenance.bindings,
    names.map((name) => ({
      path: `${f.prefix}/${name}`,
      sha256: createHash('sha256')
        .update(readFileSync(join(f.directory, name)))
        .digest('hex'),
    }))
  );
  const before = result.provenance.bindings.at(-1)!;
  f.write('records/1.json', { ...f.schedule[1], synthetic: true, censored: true });
  const after = f.read();
  assert.deepEqual(after.remaining, result.remaining);
  assert.deepEqual(after.provenance.bindings.slice(0, -1), result.provenance.bindings.slice(0, -1));
  assert.equal(after.provenance.bindings.at(-1)!.path, before.path);
  assert.notEqual(after.provenance.bindings.at(-1)!.sha256, before.sha256);
  writeFileSync(join(f.directory, 'protocol.json'), JSON.stringify(f.protocol, null, 2));
  assert.notEqual(f.read().provenance.bindings[0]!.sha256, result.provenance.bindings[0]!.sha256);
});

test('a gap or unsupported record name cannot be treated as an unstarted attempt', (t) => {
  const f = fixture(t);
  renameSync(join(f.directory, 'records/1.json'), join(f.directory, 'records/2.json'));
  assert.throws(f.read, /records have a gap or unsupported entry/);
  renameSync(join(f.directory, 'records/2.json'), join(f.directory, 'records/01.json'));
  assert.throws(f.read, /records have a gap or unsupported entry/);
});

for (const field of ['caseId', 'arm'] as const)
  test(`a spent record with the wrong ${field} is rejected`, (t) => {
    const f = fixture(t);
    f.write('records/0.json', {
      ...f.schedule[0],
      [field]: field === 'caseId' ? f.schedule[2]!.caseId : 'candidate',
    });
    assert.throws(f.read, /record identity differs from the original order/);
  });

for (const spent of [0, 1, 3, 16])
  test(`spent prefix ${spent} cannot authorize continuation`, (t) => {
    const f = fixture(t, spent);
    assert.throws(f.read, /complete spent pair-prefix and remaining budget/);
  });

for (const field of ['rootRemoved', 'privateConfigRemoved'] as const)
  test(`cleanup requires affirmative ${field} evidence`, (t) => {
    const f = fixture(t);
    for (const unsafe of [false, undefined, 'true']) {
      f.write('cleanup-recovery.json', {
        rootRemoved: true,
        privateConfigRemoved: true,
        [field]: unsafe,
      });
      assert.throws(f.read, /Prior writer recovery is incomplete/);
    }
  });

test('a consumed case cannot appear again even in a matching sixteen-entry protocol', (t) => {
  const f = fixture(t);
  f.schedule[2] = { ...f.schedule[2]!, caseId: f.schedule[0]!.caseId };
  f.write('protocol.json', f.protocol);
  assert.throws(f.read, /consumed case would be repeated/);
});

test('matrix, runtime, model and original budget identities must match the prior protocol', (t) => {
  const f = fixture(t);
  for (const patch of [
    { planned: 14 },
    { model: 'different-model' },
    { schedule: [...f.schedule].reverse() },
    { commits: { ...f.commits, candidate: 'changed-candidate' } },
    { commits: { ...f.commits, baseline: 'changed-baseline' } },
  ]) {
    f.write('protocol.json', { ...f.protocol, ...patch });
    assert.throws(f.read, /changed the original matrix, runtime or budget/);
  }
  f.write('protocol.json', f.protocol);
  assert.throws(
    () => readExecutionContinuation(f.root, f.directory, f.schedule.slice(2), f.commits),
    /changed the original matrix, runtime or budget/
  );
});

test('stand invalidation must explicitly deny replacement attempts', (t) => {
  const f = fixture(t);
  for (const invalidation of [
    { classification: 'invalid-fixture-full-audit', replaceAttempts: true },
    { classification: 'invalid-fixture-full-audit' },
    { classification: 'model-failure', replaceAttempts: false },
  ]) {
    f.write('stand-invalidation.json', invalidation);
    assert.throws(f.read, /explicit stand invalidation without replacement permission/);
  }
});

test('missing, symlinked and oversized evidence fail closed; outside results are not accepted', (t) => {
  const f = fixture(t);
  const record = join(f.directory, 'records/1.json');
  rmSync(record);
  assert.throws(f.read, /complete spent pair-prefix and remaining budget/);
  symlinkSync(join(f.directory, 'records/0.json'), record);
  assert.throws(f.read, /Unsafe\/missing continuation evidence/);
  rmSync(record);
  f.write('records/1.json', { ...f.schedule[1], padding: 'x'.repeat(2_000_001) });
  assert.throws(f.read, /Unbounded\/changed continuation evidence/);
  assert.throws(
    () => readExecutionContinuation(f.root, join(f.root, 'outside'), f.schedule, f.commits),
    /repository-owned prior evidence/
  );
});
