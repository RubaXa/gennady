// @file: Unit + integration tests for BoardProviderReal — unassigned flow (F7), card enrichment,
//   and the real reports/<mr>/ artifact backing (TSK-122 gap-3: listArtifacts/readArtifact read
//   real files from disk under a temp state dir, with the same traversal guard as ArtifactRouter).
// @consumers: node:test runner
// @tasks: TSK-117, TSK-122

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BoardProviderReal } from '../board-provider.real.ts';
import type { RoleScheduler, RoleInstanceSnapshot } from '../../inbox-roles/role-scheduler.ts';
import type { RoleEngine } from '../../inbox-roles/role-engine.ts';
import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';

const MR: VcsActionableMr = {
  iid: '14623',
  project: 'group/proj',
  webUrl: 'https://gitlab.example.com/group/proj/-/merge_requests/14623',
  title: 'feat: real MR',
  description: '',
  author: 'j.doe',
  reviewers: ['k.lebedev'],
  approvedBy: [],
  updatedAt: '2026-07-11T10:00:00Z',
  draft: false,
  state: 'opened',
  role: 'reviewer',
  events: [],
} as unknown as VcsActionableMr;

/**
 * @purpose Minimal scheduler stub for provider tests.
 * @param opts Unassigned MRs and instance snapshots to expose.
 * @returns A RoleScheduler-compatible stub.
 */
function schedulerStub(opts: {
  unassigned: VcsActionableMr[];
  instances?: RoleInstanceSnapshot[];
}): RoleScheduler {
  const polled = new Map<string, VcsActionableMr>();
  for (const mr of opts.unassigned) polled.set(mr.webUrl, mr);
  return {
    listInstances: () => opts.instances ?? [],
    listUnassigned: () => opts.unassigned,
    getPolledMr: (url: string) => polled.get(url),
    assignManual: async () => {},
    findInstance: () => undefined,
  } as unknown as RoleScheduler;
}

/**
 * @purpose Minimal engine stub exposing two inactive roles.
 * @returns A RoleEngine-compatible stub.
 */
function engineStub(): RoleEngine {
  return {
    list: () => [
      { name: 'reviewer', active: false },
      { name: 'author', active: false },
    ],
  } as unknown as RoleEngine;
}

describe('BoardProviderReal (F7)', () => {
  it('exposes polled MRs without instance as unassigned', () => {
    const provider = new BoardProviderReal(
      schedulerStub({ unassigned: [MR] }),
      engineStub(),
      '/unused-state-dir'
    );
    const board = provider.getBoard();
    assert.equal(board.unassigned.length, 1);
    assert.equal(board.unassigned[0]!.project, 'group/proj');
    assert.equal(board.unassigned[0]!.iid, 14623);
    assert.equal(board.unassigned[0]!.title, 'feat: real MR');
  });

  it('returns empty unassigned when scheduler has none', () => {
    const provider = new BoardProviderReal(
      schedulerStub({ unassigned: [] }),
      engineStub(),
      '/unused-state-dir'
    );
    assert.equal(provider.getBoard().unassigned.length, 0);
  });

  it('enriches instance cards from the last poll', () => {
    const snap: RoleInstanceSnapshot = {
      key: `reviewer:${MR.webUrl}`,
      role: 'reviewer',
      mr: MR.webUrl,
      state: 'running',
      currentNode: 'scaffold',
      findings: [],
      verdict: 'pending',
      awaitingOperator: false,
    };
    const provider = new BoardProviderReal(
      schedulerStub({ unassigned: [MR], instances: [snap] }),
      engineStub(),
      '/unused-state-dir'
    );
    const board = provider.getBoard();
    const reviewer = board.roles.find((r) => r.name === 'reviewer')!;
    assert.equal(reviewer.lanes.inProgress.length, 1);
    assert.equal(reviewer.lanes.inProgress[0]!.title, 'feat: real MR');
    assert.equal(reviewer.lanes.inProgress[0]!.project, 'group/proj');
  });

  it('resolves getReport by the dashboard composite key (project!iid), not only webUrl', () => {
    const snap: RoleInstanceSnapshot = {
      key: `reviewer:${MR.webUrl}`,
      role: 'reviewer',
      mr: MR.webUrl,
      state: 'done',
      currentNode: 'gate_review_synthesis',
      findings: [],
      verdict: 'approved',
      awaitingOperator: false,
    };
    const provider = new BoardProviderReal(
      schedulerStub({ unassigned: [MR], instances: [snap] }),
      engineStub(),
      '/unused-state-dir'
    );

    // The dashboard routes on `${project}!${iid}` (MrCard#mrKey), never the raw webUrl.
    const report = provider.getReport(`${MR.project}!${MR.iid}`);
    assert.ok(report);
    assert.equal(report!.verdict, 'approved');
    assert.equal(report!.mr.project, 'group/proj');
  });
});

describe('BoardProviderReal — reports/<mr>/ artifact backing (TSK-122 gap-3)', () => {
  const REF = 'group/proj!14623';

  /**
   * @purpose Seed a temp state dir with a `reports/<mr>/` tree mirroring what
   *   `materializeReviewScaffold`/`materializeSynthesisReadme` write to disk in a live pass.
   * @returns The temp state dir root — caller removes it after the test.
   */
  function seedTempReportsDir(): string {
    const stateDir = mkdtempSync(join(tmpdir(), 'board-provider-real-test-'));
    const dir = mrReportsDir(stateDir, REF);
    mkdirSync(join(dir, 'tasks'), { recursive: true });
    writeFileSync(join(dir, 'PLAN.md'), '# Plan\n\nДорожки: auth');
    writeFileSync(
      join(dir, 'README.md'),
      '# Отчёт ревью\n\n## Архитектура\n\n```mermaid\ngraph TD\n  mr["MR changeset"]\n```\n'
    );
    writeFileSync(join(dir, 'tasks', 'review.task.md'), '# Task: review');
    return stateDir;
  }

  it('listArtifacts reads the real files materialized under reports/<mr>/', () => {
    const stateDir = seedTempReportsDir();
    try {
      const provider = new BoardProviderReal(
        schedulerStub({ unassigned: [] }),
        engineStub(),
        stateDir
      );
      const artifacts = provider.listArtifacts(REF);
      assert.ok(artifacts.some((a) => a.path === 'PLAN.md' && a.kind === 'md'));
      assert.ok(artifacts.some((a) => a.path === 'README.md' && a.kind === 'md'));
      assert.ok(artifacts.some((a) => a.path === join('tasks', 'review.task.md')));
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('returns an empty list for an MR with no materialized reports dir', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'board-provider-real-test-'));
    try {
      const provider = new BoardProviderReal(
        schedulerStub({ unassigned: [] }),
        engineStub(),
        stateDir
      );
      assert.deepStrictEqual(provider.listArtifacts('nobody/nothing!1'), []);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('readArtifact returns README.md content with its mermaid block', () => {
    const stateDir = seedTempReportsDir();
    try {
      const provider = new BoardProviderReal(
        schedulerStub({ unassigned: [] }),
        engineStub(),
        stateDir
      );
      const content = provider.readArtifact(REF, 'README.md');
      assert.ok(content);
      assert.equal(content!.kind, 'md');
      assert.ok(content!.content.includes('```mermaid'));
      assert.ok(content!.content.includes('graph TD'));
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('returns null for an unknown artifact path', () => {
    const stateDir = seedTempReportsDir();
    try {
      const provider = new BoardProviderReal(
        schedulerStub({ unassigned: [] }),
        engineStub(),
        stateDir
      );
      assert.equal(provider.readArtifact(REF, 'MISSING.md'), null);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('rejects a path-traversal attempt (../../etc/passwd) — same guard as ArtifactRouter', () => {
    const stateDir = seedTempReportsDir();
    try {
      const provider = new BoardProviderReal(
        schedulerStub({ unassigned: [] }),
        engineStub(),
        stateDir
      );
      assert.equal(provider.readArtifact(REF, '../../etc/passwd'), null);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe('BoardProviderReal.getReport — revision from review.json (TSK-133, D-99)', () => {
  /**
   * @purpose One `done` instance snapshot with empty in-memory findings — forces `getReport` to
   *   fall through to the on-disk `review.json` read path (`_readDiskReview`), matching the
   *   "standard serve over a real state dir" scenario the ticket targets.
   */
  function idleSnap(): RoleInstanceSnapshot {
    return {
      key: `reviewer:${MR.webUrl}`,
      role: 'reviewer',
      mr: MR.webUrl,
      state: 'done',
      currentNode: 'gate_review_synthesis',
      findings: [],
      verdict: '',
      awaitingOperator: false,
    };
  }

  it('getReport returns MrDetail.revision === 3 from a real on-disk review.json', () => {
    const stateDir = makeTestTmpDir('board-provider-real-revision-');
    try {
      const ref = `${MR.project}!${MR.iid}`;
      const dir = mrReportsDir(stateDir, ref);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'review.json'),
        JSON.stringify({ verdict: 'approved', findings: [], revision: 3 }, null, 2)
      );

      const provider = new BoardProviderReal(
        schedulerStub({ unassigned: [MR], instances: [idleSnap()] }),
        engineStub(),
        stateDir
      );

      const report = provider.getReport(ref);
      assert.ok(report, 'expected a report to be resolved');
      assert.strictEqual(report!.revision, 3);
    } finally {
      cleanupTestTmp(stateDir);
    }
  });

  it('getReport degrades revision to 0 when no review.json is persisted yet', () => {
    const stateDir = makeTestTmpDir('board-provider-real-revision-');
    try {
      const ref = `${MR.project}!${MR.iid}`;
      // No reports/<mr>/ dir at all — pure in-memory instance, nothing materialized to disk yet.

      const provider = new BoardProviderReal(
        schedulerStub({ unassigned: [MR], instances: [idleSnap()] }),
        engineStub(),
        stateDir
      );

      const report = provider.getReport(ref);
      assert.ok(report, 'expected a report to be resolved');
      assert.strictEqual(report!.revision, 0);
    } finally {
      cleanupTestTmp(stateDir);
    }
  });
});
