// @file: Unit tests for BoardProviderReal — unassigned flow (F7) and card enrichment.
// @consumers: node:test runner
// @tasks: TSK-117

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BoardProviderReal } from '../board-provider.real.ts';
import type { RoleScheduler, RoleInstanceSnapshot } from '../../inbox-roles/role-scheduler.ts';
import type { RoleEngine } from '../../inbox-roles/role-engine.ts';
import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';

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
    const provider = new BoardProviderReal(schedulerStub({ unassigned: [MR] }), engineStub());
    const board = provider.getBoard();
    assert.equal(board.unassigned.length, 1);
    assert.equal(board.unassigned[0]!.project, 'group/proj');
    assert.equal(board.unassigned[0]!.iid, 14623);
    assert.equal(board.unassigned[0]!.title, 'feat: real MR');
  });

  it('returns empty unassigned when scheduler has none', () => {
    const provider = new BoardProviderReal(schedulerStub({ unassigned: [] }), engineStub());
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
      engineStub()
    );
    const board = provider.getBoard();
    const reviewer = board.roles.find((r) => r.name === 'reviewer')!;
    assert.equal(reviewer.lanes.inProgress.length, 1);
    assert.equal(reviewer.lanes.inProgress[0]!.title, 'feat: real MR');
    assert.equal(reviewer.lanes.inProgress[0]!.project, 'group/proj');
  });
});
