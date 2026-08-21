// @file: BoardProviderDiskTests — proves the READ-ONLY disk viewer path against a temp fixture dir:
//   getReport/listArtifacts/readArtifact read straight from `report/`, and BoardProjection merges a
//   disk-scanned card in with syncState 'ok' even while snapshots are empty and a cold load is in
//   flight (TSK-190).
// @consumers: node:test runner
// @tasks: TSK-190

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BoardProviderDisk, decodeMrKey, scanDiskCardSeeds } from '../board-provider.disk.ts';
import { BoardProjection } from '../projections/board-projection.ts';
import { mrKey, mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';
import type { SyncSnapshot } from '../../inbox-vcs/sync.ts';
import type { EventJournal } from '../../inbox-core/event-journal.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';

const FIXTURE_REF = 'group/project!42';
const FIXTURE_WEB_URL = 'https://gitlab.example.com/group/project/-/merge_requests/42';

/** @purpose Materialize one reviewed MR's `report/` dir under a fixture stateDir. */
function seedReviewedMr(stateDir: string): void {
  const dir = mrReportsDir(stateDir, FIXTURE_REF);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'review.json'),
    JSON.stringify({
      verdict: 'COMMENT',
      revision: 1,
      findings: [{ severity: 'warning', file: 'a.ts', line: 10, message: 'test finding' }],
    })
  );
  writeFileSync(join(dir, 'verdict.json'), JSON.stringify({ mr: FIXTURE_REF, status: 'pass' }));
  writeFileSync(join(dir, 'README.md'), '# Test summary\n\nAll good.');
  writeFileSync(
    join(dir, 'context.json'),
    JSON.stringify({
      ref: FIXTURE_REF,
      title: 'Test MR title',
      webUrl: FIXTURE_WEB_URL,
      author: 'alice',
      description: 'A test description',
      reviewers: ['bob'],
      updatedAt: '2026-01-01T00:00:00Z',
    })
  );
}

function seedLegacyHostPrefixedReviewedMr(stateDir: string): void {
  const legacyRef = 'gitlab.example.com/group/project!42';
  const dir = mrReportsDir(stateDir, legacyRef);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'review.json'), JSON.stringify({ verdict: 'COMMENT', revision: 2 }));
  writeFileSync(join(dir, 'README.md'), '# Legacy report');
  writeFileSync(
    join(dir, 'context.json'),
    JSON.stringify({ title: 'Legacy reviewed MR', webUrl: FIXTURE_WEB_URL, author: 'alice' })
  );
}

function makeMockJournal() {
  const sinceFn = mock.fn((_cursor: number) => ({ entries: [], nextCursor: 0 }));
  return { since: sinceFn } as unknown as EventJournal;
}

function makeMockRegistry() {
  const loadFn = mock.fn(() => ({ entries: {} }));
  const recordFn = mock.fn(() => {});
  const saveFn = mock.fn(() => {});
  return { load: loadFn, recordLastRead: recordFn, save: saveFn } as unknown as InboxRegistryAccess;
}

describe('decodeMrKey', () => {
  it('reverses a flat project!iid key back to project!iid', () => {
    assert.strictEqual(decodeMrKey('mail__messenger-195'), 'mail/messenger!195');
  });

  it('reverses a key whose project name itself contains a dash', () => {
    assert.strictEqual(
      decodeMrKey('infra__iaas__ansible-devint-4777'),
      'infra/iaas/ansible-devint!4777'
    );
  });

  it('returns null for a raw-webUrl-derived key with no numeric iid', () => {
    assert.strictEqual(
      decodeMrKey('https:____gitlab.corp.mail.ru__mail__messenger__-__merge_requests__195-'),
      null
    );
  });
});

describe('BoardProviderDisk', () => {
  it('opens legacy host-prefixed report directories through the canonical live ref', () => {
    const stateDir = makeTestTmpDir('board-provider-disk-legacy-ref-');
    try {
      seedLegacyHostPrefixedReviewedMr(stateDir);
      const provider = new BoardProviderDisk({ stateDir });

      assert.strictEqual(scanDiskCardSeeds(stateDir)[0]?.ref, FIXTURE_REF);
      assert.strictEqual(provider.getReport(FIXTURE_REF)?.revision, 2);
      assert.strictEqual(
        provider.readArtifact(FIXTURE_REF, 'README.md')?.content,
        '# Legacy report'
      );
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('getReport reads verdict/findings/revision straight from review.json', () => {
    const stateDir = makeTestTmpDir('board-provider-disk-report-');
    try {
      seedReviewedMr(stateDir);
      const provider = new BoardProviderDisk({ stateDir });

      const detail = provider.getReport(FIXTURE_REF);

      assert.ok(detail);
      assert.strictEqual(detail!.verdict, 'COMMENT');
      assert.strictEqual(detail!.revision, 1);
      assert.strictEqual(detail!.findings.length, 1);
      assert.strictEqual(detail!.findings[0].message, 'test finding');
      assert.strictEqual(detail!.mr.title, 'Test MR title');
      assert.strictEqual(detail!.mr.webUrl, FIXTURE_WEB_URL);
      assert.strictEqual(detail!.mr.author, 'alice');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('getReport also resolves by webUrl, normalizing to project!iid internally', () => {
    const stateDir = makeTestTmpDir('board-provider-disk-weburl-');
    try {
      seedReviewedMr(stateDir);
      const provider = new BoardProviderDisk({ stateDir });

      const detail = provider.getReport(FIXTURE_WEB_URL);

      assert.ok(detail);
      assert.strictEqual(detail!.verdict, 'COMMENT');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('getReport returns null when no report exists for the MR', () => {
    const stateDir = makeTestTmpDir('board-provider-disk-missing-');
    try {
      const provider = new BoardProviderDisk({ stateDir });
      assert.strictEqual(provider.getReport('nope/nope!1'), null);
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('listArtifacts lists materialized report files', () => {
    const stateDir = makeTestTmpDir('board-provider-disk-artifacts-');
    try {
      seedReviewedMr(stateDir);
      const provider = new BoardProviderDisk({ stateDir });

      const artifacts = provider.listArtifacts(FIXTURE_REF);

      const readme = artifacts.find((a) => a.name === 'README.md');
      assert.ok(readme);
      assert.strictEqual(readme!.kind, 'md');
      assert.strictEqual(readme!.path, 'README.md');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('readArtifact returns the raw file content', () => {
    const stateDir = makeTestTmpDir('board-provider-disk-content-');
    try {
      seedReviewedMr(stateDir);
      const provider = new BoardProviderDisk({ stateDir });

      const content = provider.readArtifact(FIXTURE_REF, 'README.md');

      assert.ok(content);
      assert.strictEqual(content!.kind, 'md');
      assert.match(content!.content, /Test summary/);
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('readArtifact rejects an unsafe traversal path', () => {
    const stateDir = makeTestTmpDir('board-provider-disk-unsafe-');
    try {
      seedReviewedMr(stateDir);
      const provider = new BoardProviderDisk({ stateDir });
      assert.strictEqual(provider.readArtifact(FIXTURE_REF, '../../etc/passwd'), null);
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('getBoard scans every reviewed MR into a single reviewer/done lane', () => {
    const stateDir = makeTestTmpDir('board-provider-disk-board-');
    try {
      seedReviewedMr(stateDir);
      const provider = new BoardProviderDisk({ stateDir });

      const board = provider.getBoard();

      assert.strictEqual(board.roles.length, 1);
      assert.strictEqual(board.roles[0].lanes.done.length, 1);
      assert.strictEqual(board.roles[0].lanes.done[0].title, 'Test MR title');
      assert.strictEqual(board.unassigned.length, 0);
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('is view-only: assignMr/setRoleActive/executeAction/recordFixTaskCopy never mutate', async () => {
    const stateDir = makeTestTmpDir('board-provider-disk-readonly-');
    try {
      seedReviewedMr(stateDir);
      const provider = new BoardProviderDisk({ stateDir });

      assert.deepStrictEqual(provider.assignMr(FIXTURE_WEB_URL, 'reviewer'), { ok: false });
      assert.deepStrictEqual(provider.setRoleActive('reviewer', true), { ok: false });
      assert.deepStrictEqual(
        provider.executeAction(FIXTURE_WEB_URL, { questionId: 'q1', choice: 'approve' }),
        { ok: false }
      );
      assert.strictEqual(await provider.recordFixTaskCopy(FIXTURE_REF), null);
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('mrKey/mrReportsDir round-trip via decodeMrKey matches the fixture ref', () => {
    // Cross-check: encoding the fixture ref with the real mrKey and decoding the resulting
    // directory name back must reproduce the same ref — proves decodeMrKey truly inverts mrKey.
    assert.strictEqual(decodeMrKey(mrKey(FIXTURE_REF)), FIXTURE_REF);
  });
});

describe('BoardProjection disk-merge', () => {
  it('yields a card for the disk MR with attention ✅ when no live snapshot covers it', () => {
    const stateDir = makeTestTmpDir('board-projection-disk-merge-');
    try {
      seedReviewedMr(stateDir);
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const proj = new BoardProjection([], journal, registry, undefined, undefined, () =>
        scanDiskCardSeeds(stateDir)
      );

      const result = proj.project();

      assert.strictEqual(result.cards.length, 1);
      const [card] = result.cards;
      assert.strictEqual(card.ref, FIXTURE_REF);
      assert.strictEqual(card.title, 'Test MR title');
      assert.strictEqual(card.attention, '✅');
      assert.strictEqual(result.groups['✅'].includes(FIXTURE_REF), true);
      assert.strictEqual(result.syncState, 'ok');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('does not duplicate a card whose ref is already covered by a live snapshot', () => {
    const stateDir = makeTestTmpDir('board-projection-disk-dedupe-');
    try {
      seedReviewedMr(stateDir);
      const journal = makeMockJournal();
      const registry = makeMockRegistry();
      const liveSnapshot = {
        mr: {
          iid: '42',
          project: 'group/project',
          webUrl: FIXTURE_WEB_URL,
          title: 'Live title wins',
          description: '',
          author: 'live-author',
          reviewers: [],
          approvedBy: [],
          updatedAt: '2026-01-02T00:00:00Z',
          draft: false,
          state: 'opened',
          role: 'reviewer',
          events: [],
          directlyAddressed: false,
          todoIds: [],
        },
        role: 'reviewer',
        attention: '⏳',
        stage: 'review_needed',
        approvals: { n: 0, m: 1, approvedBy: [] },
        reviewers: [],
        ci: { status: 'pending' },
        threads: { open: 0, total: 0, awaitingMe: 0 },
        headSha: 'abc',
        lastReviewedHeadSha: null,
        updatedAt: '2026-01-02T00:00:00Z',
        estimated: false,
      } as unknown as SyncSnapshot;
      const proj = new BoardProjection(
        [liveSnapshot],
        journal,
        registry,
        undefined,
        undefined,
        () => scanDiskCardSeeds(stateDir)
      );

      const result = proj.project();

      assert.strictEqual(result.cards.length, 1);
      assert.strictEqual(result.cards[0].title, 'Live title wins');
      assert.strictEqual(result.cards[0].work.state, 'done');
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('reports syncState ok for disk cards even mid cold-load, unlike an empty board with no content', async () => {
    const stateDir = makeTestTmpDir('board-projection-disk-syncstate-');
    try {
      seedReviewedMr(stateDir);
      const journal = makeMockJournal();
      const registry = makeMockRegistry();

      let resolveLoad!: (snapshots: SyncSnapshot[]) => void;
      const pendingLoad = new Promise<SyncSnapshot[]>((resolve) => {
        resolveLoad = resolve;
      });

      // Control: an empty board with NO disk source, mid cold-load, is genuinely 'syncing'.
      const controlProj = new BoardProjection([], journal, registry, undefined, () => pendingLoad);
      controlProj.refreshInBackground();
      assert.strictEqual(controlProj.project().syncState, 'syncing');

      // Subject: same cold-load-in-flight condition, but disk cards exist — there IS content.
      const diskProj = new BoardProjection(
        [],
        journal,
        registry,
        undefined,
        () => pendingLoad,
        () => scanDiskCardSeeds(stateDir)
      );
      diskProj.refreshInBackground();
      assert.strictEqual(diskProj.project().syncState, 'ok');

      resolveLoad([]);
      await pendingLoad;
    } finally {
      cleanupTestTmp(stateDir);
    }
  });
});
