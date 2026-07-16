// @file: Unit tests for inbox-roles ReviewerRole — three branches from node_prepare:
//   review_needed (fan-out + security lens + code-review → synthesize), reply_needed
//   (thread-triage, no full battery), update-review (delta-only).
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReviewerRole } from '../reviewer.role.ts';
import { RoleEngine } from '../role-engine.ts';
import { RoleInstance } from '../role-instance.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';

class FakeStateStore {
  public audits: AuditEntry[] = [];
  // TSK-127: real writable tmp dir — disk-artifact lens/synthesize nodes now write+read actual
  // files under this dir, so a fictional path (the pre-TSK-127 '/home/test/.gennady') no longer
  // works for these tests.
  protected _stateDir = mkdtempSync(join(tmpdir(), 'reviewer-role-test-'));

  getStateDir() {
    return this._stateDir;
  }

  loadRegistry() {
    return { version: 1, entries: {} };
  }

  async appendAudit(entry: AuditEntry) {
    this.audits.push(entry);
  }

  async queryAudit(_mr: string): Promise<AuditEntry[]> {
    return [...this.audits];
  }
}

interface StateStore {
  getStateDir(): string;
  loadRegistry(): { version: 1; entries: {} };
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}

let engine: RoleEngine;
let opencode: OpenCodeMock;
let vcs: VcsInboxMock;
let store: FakeStateStore;

before(() => {
  engine = new RoleEngine();
  opencode = new OpenCodeMock();
  vcs = new VcsInboxMock();
});

beforeEach(() => {
  engine = new RoleEngine();
  opencode = new OpenCodeMock();
  vcs = new VcsInboxMock();
  store = new FakeStateStore();
});

describe('ReviewerRole — graph structure', () => {
  it('reviewer.role.ts имеет 13 узлов (prepare + review_needed fanout(1)+gate + reply_needed(2) + update-review(4) + shared synthesize/gate/ask/effect)', () => {
    assert.strictEqual(ReviewerRole.graph.nodes.length, 13);
  });

  it('reviewer.role.ts имеет правильное имя и описание', () => {
    assert.strictEqual(ReviewerRole.name, 'reviewer');
    assert.ok(ReviewerRole.description.includes('review_needed'));
  });

  it('reviewer.role.ts загружается через RoleEngine', () => {
    engine.register(ReviewerRole);
    const list = engine.list();
    const reviewer = list.find((r) => r.name === 'reviewer');
    assert.ok(reviewer);
    assert.strictEqual(reviewer.description, ReviewerRole.description);
  });

  it('GIVEN reviewer.role.ts загружен WHEN retrieve THEN полный граф доступен', () => {
    engine.register(ReviewerRole);
    const def = engine.retrieve('reviewer');
    assert.ok(def);
    assert.strictEqual(def.graph.nodes.length, 13);
    assert.ok(def.graph.edges.length > 0);
  });
});

describe('ReviewerRole — branch: review_needed (fan-out + security lens + code-review)', () => {
  it('GIVEN stage не задан (default) WHEN prep THEN полная батарея → synthesize → ask', async () => {
    engine.register(ReviewerRole);

    // TSK-127: lens/synthesize nodes now write their result to a disk artifact instead of
    // returning it as a structured response — seed `writeArtifact` to simulate the agent's file
    // write; the executor reads it back via `resolveDiskArtifact`.
    opencode.seed('node_track_review', {
      writeArtifact: {
        file: '.gennady-artifacts/node_track_review.json',
        content: JSON.stringify({ findings: [{ file: 'a.ts', line: 1, message: 'Issue A' }] }),
      },
    });
    opencode.seed('node_security_lens', {
      writeArtifact: {
        file: '.gennady-artifacts/node_security_lens.json',
        content: JSON.stringify({ findings: [] }),
      },
    });
    opencode.seed('node_code_review', {
      writeArtifact: {
        file: '.gennady-artifacts/node_code_review.json',
        content: JSON.stringify({ findings: [{ file: 'b.ts', line: 2, message: 'Issue B' }] }),
      },
    });
    opencode.seed('node_synthesize', {
      writeArtifact: {
        file: '.gennady-artifacts/node_synthesize.json',
        content: JSON.stringify({
          reviewReport: { verdict: 'changes_requested', total: 3 },
          proposedActions: [],
        }),
      },
    });

    const instance = new RoleInstance({
      id: 'reviewer:test:review_needed',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    assert.strictEqual(instance.currentNode, 'node_prepare');

    await instance.step(); // node_prepare → review_needed (default branch)
    assert.strictEqual(instance.currentNode, 'node_review_fanout');

    await instance.step(); // node_review_fanout → all 3 lenses run concurrently → ok
    assert.strictEqual(instance.currentNode, 'gate_review_filled');

    await instance.step(); // gate_review_filled → pass (all 3 filled)
    assert.strictEqual(instance.currentNode, 'node_synthesize');

    await instance.step(); // node_synthesize → ok
    assert.strictEqual(instance.currentNode, 'gate_review_synthesis');

    await instance.step(); // gate_review_synthesis → pass
    assert.strictEqual(instance.currentNode, 'node_ask');

    await instance.step(); // node_ask → awaiting_operator
    assert.strictEqual(instance.state, 'awaiting_operator');
  });
});

describe('ReviewerRole — branch: reply_needed (thread-triage, без полной батареи)', () => {
  it('GIVEN ctx.artifacts.stage=reply_needed WHEN prep THEN thread-triage → ask (track/security/code-review НЕ запускаются)', async () => {
    engine.register(ReviewerRole);

    opencode.seed('node_thread_triage', {
      threads: [{ id: 't1', owner: 'me' }],
      proposedActions: [{ type: 'reply' }],
    });
    // Intentionally NOT seeded: node_track_review, node_security_lens, node_code_review,
    // node_synthesize — if the reply_needed branch mistakenly triggered the full battery,
    // the unseeded nodes would return NO_RESULT and the instance would never reach node_ask.

    const instance = new RoleInstance({
      id: 'reviewer:test:reply_needed',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/2',
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
      checkpoint: {
        currentNode: 'node_prepare',
        continueCount: 0,
        restartCount: 0,
        artifacts: { stage: 'reply_needed' },
      },
    });

    await instance.step(); // node_prepare → reply_needed
    assert.strictEqual(instance.currentNode, 'node_thread_triage');

    await instance.step(); // node_thread_triage → ok
    assert.strictEqual(instance.currentNode, 'gate_triage');

    await instance.step(); // gate_triage → pass
    assert.strictEqual(instance.currentNode, 'node_ask');

    await instance.step(); // node_ask → awaiting_operator
    assert.strictEqual(instance.state, 'awaiting_operator');
  });
});

describe('ReviewerRole — branch: update-review (delta-only)', () => {
  it('GIVEN headChanged=fast_forward + lastReviewedHeadSha WHEN prep THEN delta-review → synthesize_delta → ask', async () => {
    engine.register(ReviewerRole);

    opencode.seed('node_delta_review', {
      findings: [{ id: 1 }],
      closedComments: ['c1'],
    });
    // TSK-127: node_synthesize_delta writes its result to a disk artifact instead of returning
    // it as a structured response.
    opencode.seed('node_synthesize_delta', {
      writeArtifact: {
        file: '.gennady-artifacts/node_synthesize_delta.json',
        content: JSON.stringify({ reviewReport: { verdict: 'approved', total: 1 } }),
      },
    });
    // Intentionally NOT seeded: node_track_review/node_security_lens/node_code_review/
    // node_thread_triage — update-review is delta-only, not a full re-review.

    const instance = new RoleInstance({
      id: 'reviewer:test:update-review',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/3',
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
      checkpoint: {
        currentNode: 'node_prepare',
        continueCount: 0,
        restartCount: 0,
        artifacts: { headChanged: 'fast_forward', lastReviewedHeadSha: 'abc123' },
      },
    });

    await instance.step(); // node_prepare → update-review
    assert.strictEqual(instance.currentNode, 'node_delta_review');

    await instance.step(); // node_delta_review → ok
    assert.strictEqual(instance.currentNode, 'gate_delta');

    await instance.step(); // gate_delta → pass
    assert.strictEqual(instance.currentNode, 'node_synthesize_delta');

    await instance.step(); // node_synthesize_delta → ok
    assert.strictEqual(instance.currentNode, 'gate_delta_synthesis');

    await instance.step(); // gate_delta_synthesis → pass
    assert.strictEqual(instance.currentNode, 'node_ask');

    await instance.step(); // node_ask → awaiting_operator
    assert.strictEqual(instance.state, 'awaiting_operator');
  });
});
