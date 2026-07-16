// @file: Unit + contract tests for inbox-chat MutationApplier — snapshot-before-CAS-write (D-94/D-99),
//   undo restoring the pre-mutation snapshot (CH-10), provenance surfaced before Apply (CH-09/D-98),
//   and the closed op set rejected pre-preview both via preview() and via apply() (fail-fast throw).
// @consumers: node:test runner
// @tasks: TSK-127

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MutationApplier } from '../mutation-applier.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import type { MutationProposal } from '../types.ts';
import { makeTestTmpDir } from '../../inbox-core/test-support/test-tmp.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

/** @purpose MR reference every case in this file applies mutations against. */
const REF = 'group/proj!101';

/** @purpose Minimal `review.json` finding fixture — mirrors `MutationApplier`'s internal `ReviewFinding` shape. */
type FindingFixture = { id: string; severity?: string; message?: string };

/** @purpose Minimal `review.json` document fixture — mirrors `MutationApplier`'s internal `ReviewDocument` shape. */
type ReviewDocumentFixture = { verdict?: string; findings?: FindingFixture[]; revision?: number };

// ── unified context ──

type MutationApplierContext = {
  stateDir: string;
  dir: string;
  store: StateStore;
  applier: MutationApplier;
};

function createMutationApplierContext(): MutationApplierContext {
  const stateDir = makeTestTmpDir('mutation-applier-test-');
  const store = new StateStore(stateDir);
  const applier = new MutationApplier({ store });
  const dir = mrReportsDir(stateDir, REF);
  return { stateDir, dir, store, applier };
}

/**
 * @purpose Seed `<dir>/review.json` with a fixture document, as if a prior scaffold pass had written it.
 * @param dir Report directory (`reports/<mr>/`).
 * @param document Fixture document to write.
 * @sideEffect FS: creates `dir` and writes `review.json`.
 */
function seedReviewJson(dir: string, document: ReviewDocumentFixture): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'review.json'), JSON.stringify(document, null, 2), 'utf-8');
}

/**
 * @param dir Report directory (`reports/<mr>/`).
 * @returns Parsed `review.json` document.
 */
function readReviewJson(dir: string): ReviewDocumentFixture {
  return JSON.parse(readFileSync(join(dir, 'review.json'), 'utf-8')) as ReviewDocumentFixture;
}

// ── tests ──

describe('MutationApplier — type contract', () => {
  it('Типизация контракта MutationApplier', async () => {
    const proposal: MutationProposal = { op: 'edit', target: 'F-1', before: 'a', after: 'b' };
    // @ts-expect-error - MutationProposal#op is a closed union; arbitrary strings must not compile
    const invalidProposal: MutationProposal = {
      op: 'bogus',
      target: 'F-1',
      before: 'a',
      after: 'b',
    };

    const ctx = createMutationApplierContext();
    seedReviewJson(ctx.dir, { revision: 0, findings: [] });

    const applied = await ctx.applier.apply(proposal, { mrRef: REF, revision: 0 });
    assert.strictEqual(applied.ok, true);
    if (applied.ok) {
      assert.strictEqual(typeof applied.snapshot, 'string');
    }

    // revision is now 1 on disk — the same call with the stale caller-side revision 0 must discriminate to STALE_REVISION
    const stale = await ctx.applier.apply(proposal, { mrRef: REF, revision: 0 });
    assert.strictEqual(stale.ok, false);
    if (!stale.ok) {
      assert.strictEqual(stale.error, 'STALE_REVISION');
    }

    assert.strictEqual(invalidProposal.op, 'bogus');
  });
});

describe('MutationApplier#apply', () => {
  it('Успешный apply — снапшот + CAS + аудит', async () => {
    const ctx = createMutationApplierContext();
    const original: ReviewDocumentFixture = {
      revision: 0,
      findings: [{ id: 'F-1', severity: 'major', message: 'x' }],
    };
    seedReviewJson(ctx.dir, original);
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'F-1',
      before: 'major',
      after: 'minor',
    };

    const result = await ctx.applier.apply(proposal, { mrRef: REF, revision: 0 });

    assert.strictEqual(result.ok, true);
    if (!result.ok) return;

    // #region START_SUCCESSFUL_APPLY_ASSERT_SNAPSHOT_AND_WRITE
    const snapshot = JSON.parse(
      readFileSync(join(ctx.dir, 'snapshots', `${result.snapshot}.json`), 'utf-8')
    );
    assert.deepStrictEqual(snapshot.review, original);

    const updated = readReviewJson(ctx.dir);
    assert.strictEqual(updated.revision, 1);
    assert.deepStrictEqual(updated.findings, [{ id: 'F-1', severity: 'minor', message: 'x' }]);
    // #endregion END_SUCCESSFUL_APPLY_ASSERT_SNAPSHOT_AND_WRITE

    const auditEntries = await ctx.store.queryAudit(REF);
    const mutationEntry = auditEntries.find((e) => e.event === 'chat_mutation');
    assert.ok(mutationEntry);
    assert.strictEqual(mutationEntry!.role, 'chat');
    assert.deepStrictEqual(JSON.parse(mutationEntry!.detail!), {
      op: 'set-severity',
      target: 'F-1',
      before: 'major',
      after: 'minor',
    });
  });

  it('CAS-конфликт — устаревшая ревизия', async () => {
    const ctx = createMutationApplierContext();
    seedReviewJson(ctx.dir, { revision: 5, findings: [{ id: 'F-1', severity: 'major' }] });
    const beforeBytes = readFileSync(join(ctx.dir, 'review.json'), 'utf-8');
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'F-1',
      before: 'major',
      after: 'minor',
    };

    const result = await ctx.applier.apply(proposal, { mrRef: REF, revision: 0 });

    assert.strictEqual(result.ok, false);
    if (result.ok) return;
    assert.strictEqual(result.error, 'STALE_REVISION');
    assert.strictEqual(readFileSync(join(ctx.dir, 'review.json'), 'utf-8'), beforeBytes);
    assert.ok(!existsSync(join(ctx.dir, 'snapshots')));
  });
});

describe('MutationApplier#undo', () => {
  it('Undo восстанавливает снапшот', async () => {
    const ctx = createMutationApplierContext();
    const original: ReviewDocumentFixture = {
      revision: 0,
      findings: [{ id: 'F-1', severity: 'major' }],
    };
    seedReviewJson(ctx.dir, original);
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'F-1',
      before: 'major',
      after: 'minor',
    };
    const applyResult = await ctx.applier.apply(proposal, { mrRef: REF, revision: 0 });
    assert.strictEqual(applyResult.ok, true);
    if (!applyResult.ok) return;

    const undoResult = await ctx.applier.undo({ mrRef: REF, snapshotId: applyResult.snapshot });

    assert.strictEqual(undoResult.ok, true);
    assert.deepStrictEqual(readReviewJson(ctx.dir), original);

    const auditEntries = await ctx.store.queryAudit(REF);
    const undoEntry = auditEntries.find((e) => e.event === 'chat_mutation_undo');
    assert.ok(undoEntry);
    assert.deepStrictEqual(JSON.parse(undoEntry!.detail!), { snapshotId: applyResult.snapshot });
  });
});

describe('MutationApplier#preview', () => {
  it('Provenance-тег на понижение из MR-текста', () => {
    const ctx = createMutationApplierContext();
    const proposal: MutationProposal = {
      op: 'set-severity',
      target: 'F-1',
      before: 'major',
      after: 'minor',
      provenance: { groundedInMrText: true, quote: 'this is a nit, not a blocker' },
    };

    const result = ctx.applier.preview(proposal);

    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.deepStrictEqual(result.preview.provenance, {
      groundedInMrText: true,
      quote: 'this is a nit, not a blocker',
    });
  });

  it('Невалидный op отклоняется до превью', async () => {
    const ctx = createMutationApplierContext();
    const proposal = {
      op: 'bogus' as MutationProposal['op'],
      target: 'F-1',
      before: 'major',
      after: 'minor',
    };

    const previewResult = ctx.applier.preview(proposal);
    assert.strictEqual(previewResult.ok, false);
    if (previewResult.ok) return;
    assert.strictEqual(previewResult.error, 'UNSUPPORTED_OP');

    await assert.rejects(
      () => ctx.applier.apply(proposal, { mrRef: REF, revision: 0 }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /Unsupported op/);
        return true;
      }
    );
  });
});
