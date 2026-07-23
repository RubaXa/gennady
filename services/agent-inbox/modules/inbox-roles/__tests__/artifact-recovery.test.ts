// @file: Integration/unit tests for artifact-recovery — scanReportsDir/reconcileActionable classify
//   and plan against real disk snapshots; recoverLegacyArtifact re-verifies a REAL, byte-copied
//   pre-D-86 legacy artifact (vk-workspace/superapp!599, D-116 — no synthetic fixture for that shape)
//   against the CURRENT live diff, never a blind carry-over of its recorded verdict.
// @consumers: node:test runner
// @tasks: TSK-140

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  scanReportsDir,
  reconcileActionable,
  recoverLegacyArtifact,
  legacyReportDir,
  type PersistedReviewJson,
  type RecoveredFinding,
} from '../artifact-recovery.ts';
import { mrKey, registryPath } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { StateStore } from '../../inbox-core/state-store.ts';
import { VcsInboxReal } from '../../inbox-core/vcs-inbox.real.ts';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';
import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';

/** @purpose The real, already-materialized pre-D-86 legacy artifact this suite copies (D-116). */
const REAL_LEGACY_SOURCE_DIR = join(
  homedir(),
  '.gennady',
  'agent-inbox',
  'reports',
  'vk-workspace__superapp-599'
);
/** @purpose The real MR this legacy artifact belongs to — copy-of-real-bytes, not a fixture MR. */
const REAL_MR_REF = { project: 'vk-workspace/superapp', iid: '599' };
const REAL_MR_URL = 'https://gitlab.corp.mail.ru/vk-workspace/superapp/-/merge_requests/599';
const REAL_MR_HOST = 'gitlab.corp.mail.ru';

/** @purpose Build a minimal `VcsActionableMr` — every field the type requires, only `overrides` vary per case. */
function createActionableMr(overrides: Partial<VcsActionableMr> = {}): VcsActionableMr {
  return {
    iid: '1',
    project: 'group/project',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/1',
    title: 'Test MR',
    description: 'Description',
    author: 'author',
    reviewers: [],
    approvedBy: [],
    updatedAt: new Date().toISOString(),
    draft: false,
    state: 'opened',
    role: 'reviewer',
    events: [],
    directlyAddressed: false,
    todoIds: [],
    ...overrides,
  };
}

/** @purpose Single per-file lifecycle context: an isolated temp state dir, torn down after each case. */
type ArtifactRecoveryContext = { stateDir: string };

let ctx: ArtifactRecoveryContext;

beforeEach(() => {
  ctx = { stateDir: makeTestTmpDir('artifact-recovery-') };
});

afterEach(() => {
  cleanupTestTmp(ctx.stateDir);
});

/** @purpose Seed a synthetic `canonical` snapshot (review.json only) — generic shape, not the real legacy artifact. */
function seedCanonicalDir(stateDir: string, dirName: string, review: PersistedReviewJson): string {
  const dir = legacyReportDir(stateDir, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'review.json'), JSON.stringify(review));
  return dir;
}

/** @purpose Byte-copy the REAL legacy artifact (D-116) into this case's isolated legacy reports tree. */
function seedRealLegacyCopy(stateDir: string): string {
  const dirName = mrKey(`${REAL_MR_REF.project}!${REAL_MR_REF.iid}`);
  const dir = legacyReportDir(stateDir, dirName);
  mkdirSync(join(stateDir, 'agent-inbox', 'reports'), { recursive: true });
  cpSync(REAL_LEGACY_SOURCE_DIR, dir, { recursive: true });
  return dir;
}

/**
 * @purpose Cheap reachability probe (D-116 honest-skip pattern, mirrors reviewer.e2e.test.ts) — the
 *   real GitLab token/host must actually answer before `recoverLegacyArtifact`'s live re-verification runs.
 */
async function checkLivePreconditions(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const token = process.env.GITLAB_PERSONAL_TOKEN;
  if (!token) return { ok: false, reason: 'GITLAB_PERSONAL_TOKEN not set' };
  try {
    const res = await fetch(`https://${REAL_MR_HOST}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok)
      return { ok: false, reason: `GitLab API returned ${res.status} for ${REAL_MR_HOST}` };
  } catch (cause) {
    return { ok: false, reason: `GitLab API unreachable at ${REAL_MR_HOST}: ${String(cause)}` };
  }
  return { ok: true };
}

describe('scanReportsDir + reconcileActionable — canonical snapshot (generic, synthetic shape)', () => {
  it('resume from disk when canonical review.json exists', () => {
    // contract: a snapshot already backed by review.json resumes from disk, never recreated from
    // zero — this is the fix for the blind `!existingInstance` guard (role-scheduler.ts).
    const mr = createActionableMr();
    const dirName = mrKey(`${mr.project}!${mr.iid}`);
    seedCanonicalDir(ctx.stateDir, dirName, { verdict: 'ok', findings: [], revision: 1 });

    const snapshots = scanReportsDir(ctx.stateDir);
    const plan = reconcileActionable(snapshots, [mr]);

    assert.strictEqual(plan[0]?.action, 'resume');
    assert.strictEqual(plan[0]?.snapshot?.format, 'canonical');
  });

  it('does not re-run recovery on canonical snapshot', () => {
    // failure mode: a caller that gates `recoverLegacyArtifact` behind `action === 'recover'`
    // (role-scheduler.ts#_assignRole) must never invoke it for an already-canonical MR.
    const canonicalMr = createActionableMr({ iid: '1' });
    seedCanonicalDir(ctx.stateDir, mrKey(`${canonicalMr.project}!${canonicalMr.iid}`), {
      verdict: 'ok',
      findings: [],
      revision: 1,
    });
    seedRealLegacyCopy(ctx.stateDir); // real legacy dir under its own dirName (vk-workspace__superapp-599)
    const legacyRealMr = createActionableMr({
      project: REAL_MR_REF.project,
      iid: REAL_MR_REF.iid,
      webUrl: REAL_MR_URL,
    });

    const snapshots = scanReportsDir(ctx.stateDir);
    const plan = reconcileActionable(snapshots, [canonicalMr, legacyRealMr]);

    // #region START_MIXED_PLAN_ASSERT_ROUTING
    const canonicalDecision = plan.find((p) => p.mr === canonicalMr);
    const legacyDecision = plan.find((p) => p.mr === legacyRealMr);
    assert.notStrictEqual(canonicalDecision?.action, 'recover');
    assert.strictEqual(legacyDecision?.action, 'recover');
    // #endregion END_MIXED_PLAN_ASSERT_ROUTING
  });
});

describe('scanReportsDir + reconcileActionable — real vk-workspace/superapp!599 legacy artifact (D-116)', () => {
  it('classifies real superapp!599 legacy artifact', () => {
    seedRealLegacyCopy(ctx.stateDir);

    const snapshots = scanReportsDir(ctx.stateDir);
    const dirName = mrKey(`${REAL_MR_REF.project}!${REAL_MR_REF.iid}`);
    const snapshot = snapshots.find((s) => s.dirName === dirName);

    assert.ok(snapshot, `expected a snapshot for ${dirName}`);
    assert.strictEqual(snapshot?.format, 'legacy');
  });

  it('reconciles without inbox-registry.json', () => {
    // contract: `inbox-registry.json` is never consulted by reconcileActionable — absence AND
    // corruption must both leave the plan unaffected (D-127).
    seedRealLegacyCopy(ctx.stateDir);
    const mr = createActionableMr({
      project: REAL_MR_REF.project,
      iid: REAL_MR_REF.iid,
      webUrl: REAL_MR_URL,
    });

    assert.ok(!existsSync(registryPath(ctx.stateDir)), 'registry absent for this case so far');
    const snapshots = scanReportsDir(ctx.stateDir);
    const planWithoutRegistry = reconcileActionable(snapshots, [mr]);
    assert.strictEqual(planWithoutRegistry[0]?.action, 'recover');

    // #region START_CORRUPT_REGISTRY_ASSERT_UNAFFECTED
    mkdirSync(ctx.stateDir, { recursive: true });
    writeFileSync(registryPath(ctx.stateDir), '{ not valid json ][');
    const planWithCorruptRegistry = reconcileActionable(scanReportsDir(ctx.stateDir), [mr]);
    assert.strictEqual(planWithCorruptRegistry[0]?.action, 'recover');
    // #endregion END_CORRUPT_REGISTRY_ASSERT_UNAFFECTED
  });

  it('re-verifies legacy verdict against current diff', async (t) => {
    // invariant: recovery re-verifies the legacy HISTORY.md verdict against the CURRENT diff — it
    // never copies it as-is. The outcome (confirmed vs stale) depends on whether wsDeeplink.ts has
    // changed since 2026-07-17 on the live MR — asserted explicitly, not presumed either way (D-129).
    const pre = await checkLivePreconditions();
    if (!pre.ok) {
      t.skip(
        `D-116: live prerequisites not met — ${pre.reason}. No fixture fallback — honest skip.`
      );
      return;
    }

    const dir = seedRealLegacyCopy(ctx.stateDir);
    const mr = createActionableMr({
      project: REAL_MR_REF.project,
      iid: REAL_MR_REF.iid,
      webUrl: REAL_MR_URL,
    });
    const store = new StateStore(ctx.stateDir);
    const vcs = new VcsInboxReal({ host: REAL_MR_HOST });

    await recoverLegacyArtifact(dir, mr, { vcs, store });

    const reviewJsonPath = join(dir, 'review.json');
    assert.ok(existsSync(reviewJsonPath), 'recoverLegacyArtifact must materialize review.json');
    const review = JSON.parse(readFileSync(reviewJsonPath, 'utf-8')) as {
      verdict: string;
      findings: RecoveredFinding[];
      revision: number;
    };

    // #region START_REVERIFY_ASSERT_ALIGNED_SHAPE
    assert.strictEqual(review.findings.length, 1, 'HISTORY.md records exactly one legacy finding');
    const finding = review.findings[0]!;
    assert.match(finding.file, /wsDeeplink\.ts$/);
    assert.ok(
      finding.recoveryStatus === 'confirmed' || finding.recoveryStatus === 'stale',
      `recoveryStatus must be an explicit re-verification outcome, got ${finding.recoveryStatus}`
    );
    assert.strictEqual(
      review.revision,
      1,
      'first materialization on a legacy dir starts at revision 1'
    );
    assert.strictEqual(typeof review.verdict, 'string');
    // #endregion END_REVERIFY_ASSERT_ALIGNED_SHAPE
  });
});
