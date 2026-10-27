// @file: Authenticate offline M2 regression inputs without claiming live judge qualification.
// @spec: AI-SKILLS
// @consumers: authoring measurement qualification; offline regression suite

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { it } from 'node:test';
import { buildAuthoringSemanticControls } from '../authoring-semantic-controls.ts';

const root = new URL('../../../', import.meta.url);
const archive = 'ai/flow-eval/results/authoring-campaigns/transfer1-oct25/';
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function text(path: string): string {
  assert.match(path, /^ai\/[a-zA-Z0-9._/-]+$/);
  assert.ok(!path.split('/').includes('..'));
  const url = new URL(path, root),
    stat = lstatSync(url);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.ok(stat.size < 1024 * 1024);
  return readFileSync(url, 'utf8');
}
const input = JSON.parse(text('ai/flow-eval/docs/AUTHORING-M2-REGRESSION-INPUT.json'));
const original = text(input.artifact.path);

it('M2 follow-up binds actual child, parent and owner formats without modifying the old seven controls', () => {
  assert.equal(input.schema, 'gennady.authoring-m2-regression-input.1');
  assert.equal(input.status, 'offline-input-not-model-qualified');
  assert.equal(input.newLiveExecutions, 0);
  assert.equal(input.automaticLiveBudget, 0);
  assert.equal(input.historicalGradesChanged, false);
  assert.equal(sha(original), input.artifact.sha256);
  assert.equal(input.references.length, 3);
  for (const reference of input.references) {
    const content = text(reference.path);
    assert.equal(sha(content), reference.sha256);
    for (const clause of reference.requiredClauses) assert.ok(content.includes(clause), clause);
  }
  assert.ok(original.includes('Уточняет `DEL-REQ-1`'));
  assert.ok(original.includes('0 <= nowMs - seenAtMs < ttlMs'));
  assert.equal(input.positiveControl.mutation, null);
  assert.equal(input.positiveControl.overallSemanticLabel, 'inconclusive');
  assert.equal(buildAuthoringSemanticControls().length, 7);
  const old = JSON.parse(text(archive + 'records/10.json'));
  assert.equal(old.primary.verdict, 'fail');
  const manual = JSON.parse(text(archive + 'manual-review.json'));
  assert.equal(manual.rows.find((r: any) => r.index === 10).semantic, 'inconclusive');
});

it('M2 negative inputs change only one in-memory clause and preserve concrete contradiction witnesses', () => {
  assert.equal(input.negativeControls.length, 2);
  for (const control of input.negativeControls) {
    const { before, after } = control.replaceOnce;
    const parts = original.split(before);
    assert.equal(parts.length, 2, control.id);
    const mutated = parts[0] + after + parts[1];
    assert.notEqual(mutated, original);
    assert.equal(mutated.replace(after, before), original);
    assert.equal(control.expected, 'fail');
    assert.ok(control.witness.length > 60);
    if (control.id === 'dedupe-explicit-parent-wait-override') {
      assert.ok(mutated.includes('Вопреки DEL-REQ-1 операция выполняет ожидание'));
      const parent = input.references.find((r: any) => r.role === 'parent');
      assert.ok(text(parent.path).includes('never perform network I/O, wait'));
    } else {
      assert.equal(control.id, 'dedupe-inclusive-ttl-contradiction');
      assert.ok(mutated.includes('0 <= nowMs - seenAtMs <= ttlMs'));
      assert.ok(mutated.includes('| `isDuplicate(100,110,10)` | `false` |'));
      assert.equal(110 - 100 <= 10, true);
      assert.equal(110 - 100 < 10, false);
    }
  }
  assert.equal(sha(text(input.artifact.path)), input.artifact.sha256);
});

it('proposed M2 evidence includes task and owner context but no scoring labels or new activation authority', () => {
  const tasks = JSON.parse(text(archive + 'protocol/task-inputs.json'));
  const task = tasks.cases.find((r: any) => r.taskId === 'delivery-dedupe').definition;
  const evidence = {
    brief: task.brief,
    artifact: original,
    references: [
      ...Object.entries(task.files)
        .filter(([path]) => path.startsWith('docs/') || path.startsWith('specs/'))
        .map(([path, content]) => ({ path, content })),
      ...input.references
        .filter((r: any) => r.role === 'owner-format')
        .map((r: any) => ({ path: r.path, content: text(r.path) })),
    ],
  };
  assert.ok(evidence.brief.includes('isDuplicate'));
  assert.ok(evidence.references.some((r) => r.content === text(input.references[0].path)));
  assert.ok(evidence.references.some((r) => String(r.content).includes('no language signatures')));
  const keys = (value: unknown): string[] =>
    value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)])
      : [];
  assert.ok(
    !keys(evidence).some((key) =>
      ['expected', 'labelEvidence', 'facetExpectation', 'oracle'].includes(key)
    )
  );
  const ledger = JSON.parse(text('ai/flow-eval/docs/AUTHORING-DECISIONS.json'));
  assert.equal(ledger.authorizationScope.researchStatus, 'merged-after-independent-review');
  assert.equal(
    ledger.authorizationScope.researchMergeCommit,
    '052308f91fc396c6b7a00a0f63dd1523e2933d9f'
  );
  assert.equal(ledger.authorizationScope.candidatePackageActivationAuthorized, false);
  assert.equal(ledger.authorizationScope.npmPublicationAuthorized, false);
  assert.equal(ledger.finalAdjudication.mergeAuthorized, false);
});
