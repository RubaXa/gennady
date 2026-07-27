// @file: Unit tests for inbox-roles ReviewerRole — three branches from node_prepare:
//   review_needed (fan-out + security lens + code-review → synthesize), reply_needed
//   (thread-triage, no full battery), update-review (delta-only).
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReviewerRole } from '../reviewer.role.ts';
import { RoleEngine } from '../role-engine.ts';
import { RoleInstance } from '../role-instance.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import type { CreateSessionOpts, SessionHandle } from '../../inbox-opencode/opencode.port.ts';
import type { NodeContext, ParallelNode, ParallelSessionSpec } from '../role-node.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

/**
 * @purpose Spy on OpenCodeMock#createSession — records the `tools` gate each call received, so
 *   Round 2 (D-118..D-123) tests can assert the actual `ToolGate`/boolean reaching
 *   `OpenCodePort.createSession` per lens/synthesize node, without reaching into private state.
 */
class OpenCodeCreateSessionSpy extends OpenCodeMock {
  public createSessionCalls: CreateSessionOpts[] = [];

  override async createSession(opts: CreateSessionOpts): Promise<SessionHandle> {
    this.createSessionCalls.push(opts);
    return super.createSession(opts);
  }
}

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
  it('reviewer.role.ts имеет 15 узлов (prepare + enrich(2) + review_needed fanout(1)+gate + reply_needed(2) + update-review(4) + shared synthesize/gate/ask/effect)', () => {
    assert.strictEqual(ReviewerRole.graph.nodes.length, 15);
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
    assert.strictEqual(def.graph.nodes.length, 15);
    assert.ok(def.graph.edges.length > 0);
  });
});

describe('ReviewerRole — branch: review_needed (fan-out + security lens + code-review)', () => {
  it('GIVEN stage не задан (default) WHEN prep THEN enrich → review fanout → synthesize → ask', async () => {
    engine.register(ReviewerRole);

    // D-118..D-123 (TSK-113 Round 2, P5 fix F-01): lens/synthesize nodes return their result as a
    // structured response (`resultSchema`) — no write tool granted, no disk artifact contract —
    // seed the plain response object directly (same pattern as run-mode.test.ts's fix).
    opencode.seed('node_track_review', {
      findings: [{ file: 'a.ts', line: 1, message: 'Issue A' }],
    });
    opencode.seed('node_security_lens', { findings: [] });
    opencode.seed('node_code_review', {
      findings: [{ file: 'b.ts', line: 2, message: 'Issue B' }],
    });
    opencode.seed('node_enrich', {});
    opencode.seed('node_synthesize', {
      reviewReport: {
        verdict: 'changes_requested',
        summary: 'test summary',
        behavior: 'test behavior',
        scenarios: 'test scenarios',
        total: 3,
      },
      proposedActions: [],
    });

    // D-130: pre-create .task.md files with status: enriched so gate_enrich passes
    const tasksDir = join(mrReportsDir(store.getStateDir(), 'project!1'), 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(tasksDir, 'logic.task.md'),
      '---\nstatus: enriched\n---\n\n## Область\n\n## Контекст\nEntities: FrameModel, isFrameElement.\nBoundary: packages/blocks — framework layer.\n\n## Находки\n\n## Кандидаты\n\n## Вердикт\n'
    );
    writeFileSync(
      join(tasksDir, 'security.task.md'),
      '---\nstatus: enriched\n---\n\n## Область\n\n## Контекст\nLook at WHOLE diff. Check addElement call sites.\n\n## Находки\n\n## Кандидаты\n\n## Вердикт\n'
    );

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
    assert.strictEqual(instance.currentNode, 'node_enrich');

    await instance.step(); // node_enrich → ok
    assert.strictEqual(instance.currentNode, 'gate_enrich');

    await instance.step(); // gate_enrich → pass (task files have status:enriched)
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
      // TSK-143 (SV-23/SV-24): no discussion is seeded on `vcs` for thread 't1' — `getDiscussions`
      // returns [], so this pass genuinely has zero real thread signals and zero findings. dryRun
      // keeps the resulting auto-approve from reaching a real vcs-approve call.
      dryRun: true,
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

    // TSK-143 (SV-23/D-134): closed trigger list empty (no findings, no real thread signals) →
    // autonomous approve, NOT awaiting_operator — the previous unconditional escalation this
    // ticket replaces.
    await instance.step(); // node_ask → auto-approve (dry-run) → done
    assert.strictEqual(instance.state, 'done');
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
        content: JSON.stringify({
          reviewReport: {
            verdict: 'approved',
            summary: 'test summary',
            behavior: 'test behavior',
            scenarios: 'test scenarios',
            total: 1,
          },
        }),
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

describe('ReviewerRole — Round 2: node_synthesize zero-tools, reads engine-persisted lens results (D-118..D-123)', () => {
  it('GIVEN все трек-болванки заполнены (fanout done) WHEN node_synthesize запускается THEN createSession получает fully-closed ToolGate и оркестратор уже записал каждый lens-результат на диск (tasks/<lensId>.result.json)', async () => {
    engine.register(ReviewerRole);
    const spy = new OpenCodeCreateSessionSpy();

    spy.seed('node_track_review', { findings: [{ file: 'a.ts', line: 1, message: 'Issue A' }] });
    spy.seed('node_security_lens', { findings: [] });
    spy.seed('node_code_review', { findings: [{ file: 'b.ts', line: 2, message: 'Issue B' }] });
    spy.seed('node_enrich', {});
    spy.seed('node_synthesize', {
      reviewReport: {
        verdict: 'changes_requested',
        summary: 'test summary',
        behavior: 'test behavior',
        scenarios: 'test scenarios',
        total: 2,
      },
      proposedActions: [],
    });

    const instance = new RoleInstance({
      id: 'reviewer:test:synthesize-zero-tools',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: ReviewerRole.graph,
      opencode: spy,
      vcs,
      store: store as unknown as StateStore,
    });

    // D-130: pre-create .task.md files so gate_enrich passes
    const tasksDir = join(mrReportsDir(store.getStateDir(), 'project!1'), 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(tasksDir, 'logic.task.md'),
      '---\nstatus: enriched\n---\n\n## Контекст\ntest\n'
    );
    writeFileSync(
      join(tasksDir, 'security.task.md'),
      '---\nstatus: enriched\n---\n\n## Контекст\ntest\n'
    );

    await instance.step(); // node_prepare → review_needed
    await instance.step(); // node_enrich → ok
    await instance.step(); // gate_enrich → pass
    await instance.step(); // node_review_fanout → all 3 lenses run, engine persists each result
    assert.strictEqual(
      instance.currentNode,
      'gate_review_filled',
      'after fanout, should be at gate_review_filled'
    );

    // #region ASSERT_LENS_RESULTS_PERSISTED_BY_ENGINE — not by the lens sessions themselves
    for (const lensId of ['node_track_review', 'node_security_lens', 'node_code_review']) {
      const path = join(tasksDir, `${lensId}.result.json`);
      assert.ok(
        existsSync(path),
        `${lensId}.result.json must be written by the engine, not the lens session`
      );
    }
    assert.deepStrictEqual(
      JSON.parse(readFileSync(join(tasksDir, 'node_track_review.result.json'), 'utf-8')),
      { findings: [{ file: 'a.ts', line: 1, message: 'Issue A' }] }
    );
    // #endregion ASSERT_LENS_RESULTS_PERSISTED_BY_ENGINE

    await instance.step(); // gate_review_filled → pass
    await instance.step(); // node_synthesize → ok

    // #region ASSERT_SYNTHESIZE_ZERO_TOOLS — the session itself never gets read/bash/grep
    const synthesizeCall = spy.createSessionCalls.find((c) => c.title === 'node_synthesize');
    assert.ok(synthesizeCall, 'node_synthesize must call createSession');
    assert.deepStrictEqual(synthesizeCall!.tools, { bash: false, read: false, grep: false });
    // #endregion ASSERT_SYNTHESIZE_ZERO_TOOLS
  });
});

describe('ReviewerRole — Round 2: ToolPolicy per lens — bash deny, read/grep allow (D-118..D-123, AI-41)', () => {
  it('GIVEN node_track_review/node_security_lens/node_code_review WHEN движок конструирует createSession THEN tools несёт {bash:false,read:true,grep:true}', async () => {
    engine.register(ReviewerRole);
    const spy = new OpenCodeCreateSessionSpy();

    spy.seed('node_track_review', { findings: [] });
    spy.seed('node_security_lens', { findings: [] });
    spy.seed('node_code_review', { findings: [] });
    spy.seed('node_enrich', {});
    spy.seed('node_synthesize', {
      reviewReport: {
        verdict: 'approved',
        summary: 'test summary',
        behavior: 'test behavior',
        scenarios: 'test scenarios',
      },
      proposedActions: [],
    });

    const instance = new RoleInstance({
      id: 'reviewer:test:toolpolicy-lens',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: ReviewerRole.graph,
      opencode: spy,
      vcs,
      store: store as unknown as StateStore,
    });

    // D-130: pre-create .task.md files so gate_enrich passes
    const tpTasksDir = join(mrReportsDir(store.getStateDir(), 'project!1'), 'tasks');
    mkdirSync(tpTasksDir, { recursive: true });
    writeFileSync(
      join(tpTasksDir, 'logic.task.md'),
      '---\nstatus: enriched\n---\n\n## Контекст\ntest\n'
    );
    writeFileSync(
      join(tpTasksDir, 'security.task.md'),
      '---\nstatus: enriched\n---\n\n## Контекст\ntest\n'
    );

    await instance.step(); // node_prepare → review_needed
    await instance.step(); // node_enrich → ok
    await instance.step(); // gate_enrich → pass
    await instance.step(); // node_review_fanout → all 3 lenses

    for (const lensId of ['node_track_review', 'node_security_lens', 'node_code_review']) {
      const call = spy.createSessionCalls.find((c) => c.title === lensId);
      assert.ok(call, `${lensId} must call createSession`);
      assert.deepStrictEqual(
        call!.tools,
        { bash: false, read: true, grep: true },
        `${lensId} must get a per-tool ToolGate — bash denied, read+grep granted`
      );
    }
  });
});

describe('ReviewerRole — Round 2: materializeReviewJson writer under D-99 revision-CAS', () => {
  it('GIVEN заполненные болванки после synthesize WHEN gate_review_synthesis THEN review.json пишется с revision=_readCurrentRevision()+1 ДО node_ask', async () => {
    engine.register(ReviewerRole);

    opencode.seed('node_track_review', {
      findings: [{ file: 'a.ts', line: 1, message: 'Issue A' }],
    });
    opencode.seed('node_security_lens', { findings: [] });
    opencode.seed('node_code_review', { findings: [] });
    opencode.seed('node_enrich', {});
    opencode.seed('node_synthesize', {
      reviewReport: {
        verdict: 'changes_requested',
        summary: 'test summary',
        behavior: 'test behavior',
        scenarios: 'test scenarios',
      },
      proposedActions: [],
    });

    const instance = new RoleInstance({
      id: 'reviewer:test:revision-cas',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    // D-130: pre-create .task.md files so gate_enrich passes
    const revTasksDir = join(mrReportsDir(store.getStateDir(), 'project!1'), 'tasks');
    mkdirSync(revTasksDir, { recursive: true });
    writeFileSync(
      join(revTasksDir, 'logic.task.md'),
      '---\nstatus: enriched\n---\n\n## Контекст\ntest\n'
    );
    writeFileSync(
      join(revTasksDir, 'security.task.md'),
      '---\nstatus: enriched\n---\n\n## Контекст\ntest\n'
    );

    await instance.step(); // node_prepare → review_needed
    await instance.step(); // node_enrich → ok
    await instance.step(); // gate_enrich → pass
    await instance.step(); // node_review_fanout
    await instance.step(); // gate_review_filled → pass
    await instance.step(); // node_synthesize → ok

    const reviewJsonPath = join(mrReportsDir(store.getStateDir(), 'project!1'), 'review.json');
    assert.strictEqual(instance.currentNode, 'gate_review_synthesis');
    assert.ok(
      !existsSync(reviewJsonPath),
      'review.json must not exist before gate_review_synthesis runs'
    );

    await instance.step(); // gate_review_synthesis → pass — materializeReviewJson fires HERE, before node_ask
    assert.strictEqual(
      instance.currentNode,
      'node_ask',
      'materializeReviewJson must run before node_ask'
    );

    const firstWrite = JSON.parse(readFileSync(reviewJsonPath, 'utf-8')) as { revision: number };
    assert.strictEqual(
      firstWrite.revision,
      1,
      'first materialization starts at revision 1 (_readCurrentRevision()=0 + 1)'
    );

    // A second full pass over the SAME MR/store re-materializes review.json — CAS revision bumps
    // monotonically instead of resetting, so a concurrent chat-side MutationApplier write (D-99)
    // still gets rejected by an up-to-date revision, never a stale 1.
    opencode.seed('node_track_review', {
      findings: [{ file: 'a.ts', line: 1, message: 'Issue A' }],
    });
    opencode.seed('node_security_lens', { findings: [] });
    opencode.seed('node_code_review', { findings: [] });
    opencode.seed('node_synthesize', {
      reviewReport: {
        verdict: 'changes_requested',
        summary: 'test summary',
        behavior: 'test behavior',
        scenarios: 'test scenarios',
      },
      proposedActions: [],
    });

    const secondPass = new RoleInstance({
      id: 'reviewer:test:revision-cas-2',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    // D-130: .task.md files already exist from first pass (status: enriched) — gate_enrich will pass

    await secondPass.step(); // node_prepare
    await secondPass.step(); // node_enrich
    await secondPass.step(); // gate_enrich → pass
    await secondPass.step(); // node_review_fanout
    await secondPass.step(); // gate_review_filled
    await secondPass.step(); // node_synthesize
    await secondPass.step(); // gate_review_synthesis → re-materializes review.json

    const secondWrite = JSON.parse(readFileSync(reviewJsonPath, 'utf-8')) as { revision: number };
    assert.strictEqual(
      secondWrite.revision,
      2,
      'a re-review bumps revision monotonically, never resets'
    );
  });
});

describe('ReviewerRole — Round 4: lens finding survives field-name drift (live bug: `summary` silently dropped)', () => {
  it('GIVEN a lens returns its finding text under `summary` (not `message`/`detail`) WHEN gate_review_synthesis materializes review.json THEN the finding is NOT silently dropped', async () => {
    engine.register(ReviewerRole);

    // Live-found bug (TSK-113 Round 4): node_track_review returned `summary` on a real MR
    // (vk-workspace/superapp!523) — _normalizeLensFindings only recognized `message`/`detail`,
    // so the finding text became '' and the `.filter((f) => f.file && f.message)` guard dropped it
    // entirely — review.json ended up with `findings: []` despite a real, concrete finding on disk.
    opencode.seed('node_track_review', {
      findings: [{ file: 'a.ts', line: 1, summary: 'Finding reported via summary field' }],
    });
    opencode.seed('node_security_lens', { findings: [] });
    opencode.seed('node_code_review', { findings: [] });
    opencode.seed('node_enrich', {});
    opencode.seed('node_synthesize', {
      reviewReport: {
        verdict: 'changes_requested',
        summary: 'test summary',
        behavior: 'test behavior',
        scenarios: 'test scenarios',
      },
      proposedActions: [],
    });

    const instance = new RoleInstance({
      id: 'reviewer:test:summary-field-drift',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/1',
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    // D-130: pre-create .task.md files so gate_enrich passes
    const driftTasksDir = join(mrReportsDir(store.getStateDir(), 'project!1'), 'tasks');
    mkdirSync(driftTasksDir, { recursive: true });
    writeFileSync(
      join(driftTasksDir, 'logic.task.md'),
      '---\nstatus: enriched\n---\n\n## Контекст\ntest\n'
    );
    writeFileSync(
      join(driftTasksDir, 'security.task.md'),
      '---\nstatus: enriched\n---\n\n## Контекст\ntest\n'
    );

    await instance.step(); // node_prepare → review_needed
    await instance.step(); // node_enrich → ok
    await instance.step(); // gate_enrich → pass
    await instance.step(); // node_review_fanout
    await instance.step(); // gate_review_filled → pass
    await instance.step(); // node_synthesize → ok
    await instance.step(); // gate_review_synthesis → pass, materializeReviewJson fires

    const reviewJsonPath = join(mrReportsDir(store.getStateDir(), 'project!1'), 'review.json');
    const review = JSON.parse(readFileSync(reviewJsonPath, 'utf-8')) as {
      findings: Array<{ file: string; line: number; message: string }>;
    };
    assert.strictEqual(
      review.findings.length,
      1,
      'the summary-only finding must survive collection'
    );
    assert.strictEqual(review.findings[0]!.message, 'Finding reported via summary field');
  });
});

describe('ReviewerRole — Round 3: buildTaskText carries the injected Context section (D-125 fix)', () => {
  it('GIVEN a materialized track task-blank on disk WHEN buildTaskText runs for the 3 lens nodes THEN the task text names the concrete file path and tells the agent not to recompute git diff/log itself', async () => {
    engine.register(ReviewerRole);
    const def = engine.retrieve('reviewer');
    assert.ok(def);

    const mrUrl = 'https://gitlab.example.com/project/-/merge_requests/1';
    const mr = await vcs.getMrContext(mrUrl);

    // #region SETUP_MATERIALIZE_TASK_BLANK — same tasksDir layout node_prepare's scaffold pass writes
    const tasksDir = join(mrReportsDir(store.getStateDir(), 'project!1'), 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    const trackTaskPath = join(tasksDir, 'logic.task.md');
    writeFileSync(trackTaskPath, '## Контекст\ninjected diff hunks + entities go here\n');
    // #endregion SETUP_MATERIALIZE_TASK_BLANK

    const ctx: NodeContext = {
      mr,
      workspace: '/tmp/reviewer-role-test-workspace',
      artifacts: {},
      store: store as unknown as StateStore,
    };

    // #region SETUP_LOCATE_FANOUT_LENSES — the 3 lens ids live inside node_review_fanout's ParallelNode.sessions
    const fanout = def!.graph.nodes.find((n) => n.id === 'node_review_fanout') as ParallelNode;
    assert.ok(fanout, 'node_review_fanout must exist in the graph');
    // #endregion SETUP_LOCATE_FANOUT_LENSES

    for (const nodeId of ['node_track_review', 'node_security_lens', 'node_code_review']) {
      const node = fanout.sessions.find((s) => s.id === nodeId) as ParallelSessionSpec;
      assert.ok(node, `${nodeId} must exist in node_review_fanout.sessions`);

      const taskText = node.buildTaskText(ctx);

      // contract: generic string carrying zero words from the injected Context section fails this
      assert.match(
        taskText,
        new RegExp(trackTaskPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${nodeId}'s task text must name the concrete task-blank path`
      );
      assert.match(
        taskText,
        /## Контекст/,
        `${nodeId}'s task text must point at the '## Контекст' section`
      );
      assert.match(
        taskText,
        /instead of running git diff\/log yourself/,
        `${nodeId}'s task text must tell the agent not to recompute git diff/log itself`
      );
    }
  });
});
