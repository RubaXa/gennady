// @file: Unit tests for inbox-roles EffectExecutor — reconcile-dedup against live VCS state and
//   effect_applied idempotency (restart must not double-post). Exercises EffectExecutor.execute()
//   directly (the unit that is real, per TSK-113 P3 Handoff) — does not exercise the effect-node→
//   EffectExecutor wiring itself, which is a documented open gap (NodeContext lacks vcs/store; see
//   reviewer.role.ts / author.role.ts node_effect comments and P3 Handoff "open").
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProposedAction } from '../effect-executor.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import type { Discussion, DiscussionNote, MrContext } from '../../inbox-core/vcs-inbox.port.ts';
import { VcsResolveError } from '../../../../../cli/cmd/_shared/vcs-context-resolver.ts';
import type { VcsCliContext } from '../../../../../cli/cmd/_shared/vcs-context-resolver.ts';

// ─── Import guard ───────────────────────────────────────────────────────────────
// purpose: effect-executor.ts statically imports vcs-reply.cmd.ts's `main` for the reply/resolve
// path. That file ends with an unconditional top-level `try { ... process.exit(run.code) } catch
// { ... process.exit(1) }` (no entrypoint guard) — a pre-existing bug exercised here only because
// this is the first test to import effect-executor.ts at all. Mocking resolveVcsContext (so the
// top-level code's own call succeeds) plus patching process.exit/argv/stdin during the dynamic
// import sidesteps it without touching that impl file — same pattern already used in
// cli/cmd/vcs-reply/__tests__/vcs-reply.resolve.test.ts for the identical bug.
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../..');

const resolveVcsContextTracker = mock.fn(
  async (): Promise<VcsCliContext> => ({
    provider: 'gitlab',
    host: 'gitlab.example.com',
    project: 'g/p',
    iid: 42,
    token: 'glpat-mock',
  })
);

mock.module(resolve(PROJECT_ROOT, 'cli/cmd/_shared/vcs-context-resolver.ts'), {
  namedExports: { resolveVcsContext: resolveVcsContextTracker, VcsResolveError },
});

Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

const _origExit = process.exit;
const _origArgv = process.argv;
process.exit = ((_code?: number) => undefined as never) as typeof process.exit;
process.argv = ['node', 'gennady'];

const { EffectExecutor } = await import('../effect-executor.ts');

process.exit = _origExit;
process.argv = _origArgv;

class FakeStateStore {
  public audits: AuditEntry[] = [];

  getStateDir() {
    return '/home/test/.gennady';
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

/** @purpose VcsInboxMock subclass that reports a fixed identity — needed to exercise the
 *   approve-reconcile branch (`getMyLogin()` defaults to '' on the base mock). */
class VcsInboxMockWithLogin extends VcsInboxMock {
  async getMyLogin(): Promise<string> {
    return 'me';
  }
}

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/1';

let vcs: VcsInboxMockWithLogin;
let store: FakeStateStore;

beforeEach(() => {
  vcs = new VcsInboxMockWithLogin();
  store = new FakeStateStore();
});

describe('EffectExecutor — idempotency (restart must not double-post)', () => {
  it('GIVEN effect_applied уже записан для этого узла+действия WHEN execute() снова THEN skipped_idempotent, без нового audit-события', async () => {
    const executor = new EffectExecutor({ vcs, store: store as unknown as StateStore });
    const action: ProposedAction = { type: 'react', commentId: 'c1', emoji: '👍' };

    // Simulate a prior successful post (as if the process crashed right after appendAudit, before
    // the graph advanced) — the fingerprint must match EffectExecutor's own derivation exactly.
    await store.appendAudit({
      ts: new Date().toISOString(),
      mr: MR,
      role: 'reviewer',
      event: 'effect_applied',
      detail: 'node:node_effect|react:c1:👍:false',
    });

    const before = store.audits.length;
    const result = await executor.execute({ mr: MR, role: 'reviewer', nodeId: 'node_effect' }, [
      action,
    ]);

    assert.strictEqual(result.outcomes.length, 1);
    assert.strictEqual(result.outcomes[0].status, 'skipped_idempotent');
    // No new effect_applied (or any) audit entry appended — restart does not double-post.
    assert.strictEqual(store.audits.length, before);
  });

  it('GIVEN effect_applied записан для node_a WHEN execute() того же действия на node_b THEN идемпотентность не пересекается между узлами', async () => {
    const discussion: Discussion = {
      id: 'd-scope',
      shortId: 'd-scope',
      author: 'someone',
      body: 'Please fix',
      resolved: true, // already resolved in live VCS — reconcile-dedup catches it network-free
      notes: [],
    };
    vcs.seed([], undefined, { [MR]: [discussion] });

    const executor = new EffectExecutor({ vcs, store: store as unknown as StateStore });
    const action: ProposedAction = { type: 'resolve', discussionId: 'd-scope', resolve: true };

    // effect_applied recorded for a DIFFERENT node (node_a) — must not leak into node_b's guard.
    await store.appendAudit({
      ts: new Date().toISOString(),
      mr: MR,
      role: 'reviewer',
      event: 'effect_applied',
      detail: `node:node_a|resolve:${action.discussionId}:${action.resolve}`,
    });

    const result = await executor.execute({ mr: MR, role: 'reviewer', nodeId: 'node_b' }, [action]);

    // Not idempotent-skipped (node_a's marker does not apply to node_b) — instead caught by
    // reconcile-dedup against live VCS state, which is network-free and deterministic.
    assert.strictEqual(result.outcomes[0].status, 'skipped_duplicate');
  });
});

describe('EffectExecutor — reconcile-dedup (resolve)', () => {
  it('GIVEN тред уже resolved=true в VCS WHEN execute() resolve THEN skipped_duplicate (без вызова vcs-*)', async () => {
    const discussion: Discussion = {
      id: 'd1',
      shortId: 'd1',
      author: 'someone',
      body: 'Please fix',
      resolved: true,
      notes: [],
    };
    vcs.seed([], undefined, { [MR]: [discussion] });

    const executor = new EffectExecutor({ vcs, store: store as unknown as StateStore });
    const result = await executor.execute({ mr: MR, role: 'reviewer', nodeId: 'node_effect' }, [
      { type: 'resolve', discussionId: 'd1', resolve: true },
    ]);

    assert.strictEqual(result.outcomes[0].status, 'skipped_duplicate');
    assert.strictEqual(store.audits.length, 0);
  });

  it('GIVEN тред resolved=false, действие resolve=true WHEN execute() THEN не дедупится (proceeds to apply)', async () => {
    const discussion: Discussion = {
      id: 'd2',
      shortId: 'd2',
      author: 'someone',
      body: 'Please fix',
      resolved: false,
      notes: [],
    };
    vcs.seed([], undefined, { [MR]: [discussion] });

    const executor = new EffectExecutor({ vcs, store: store as unknown as StateStore });
    const result = await executor.execute({ mr: MR, role: 'reviewer', nodeId: 'node_effect' }, [
      { type: 'resolve', discussionId: 'd2', resolve: true },
    ]);

    // Not deduped — proceeds toward real _apply() (no VCS credentials in test env → fails there,
    // not via reconcile-dedup). Confirms the dedup check is state-sensitive, not a blanket skip.
    assert.notStrictEqual(result.outcomes[0].status, 'skipped_duplicate');
  });
});

describe('EffectExecutor — reconcile-dedup (reply)', () => {
  it('GIVEN идентичный ответ уже опубликован в треде WHEN execute() reply THEN skipped_duplicate', async () => {
    const note: DiscussionNote = { id: 'n1', author: 'me', body: 'Will fix', createdAt: '' };
    const discussion: Discussion = {
      id: 'd3',
      shortId: 'd3',
      author: 'me',
      body: 'Original',
      resolved: false,
      notes: [note],
    };
    vcs.seed([], undefined, { [MR]: [discussion] });

    const executor = new EffectExecutor({ vcs, store: store as unknown as StateStore });
    const result = await executor.execute({ mr: MR, role: 'author', nodeId: 'node_effect' }, [
      { type: 'reply', discussionId: 'd3', body: 'Will fix' },
    ]);

    assert.strictEqual(result.outcomes[0].status, 'skipped_duplicate');
  });
});

describe('EffectExecutor — reconcile-dedup (approve)', () => {
  it('GIVEN MR уже approved мной WHEN execute() approve THEN skipped_duplicate', async () => {
    const mrContext: MrContext = {
      project: 'group/project',
      iid: '1',
      webUrl: MR,
      title: 'Test MR',
      sourceBranch: 'feature',
      targetBranch: 'main',
      createdAt: '',
      updatedAt: '',
      author: 'other',
      reviewers: [],
      approvedBy: ['me'],
      description: '',
      myRole: 'reviewer',
    };
    vcs.seed([], { [MR]: mrContext });

    const executor = new EffectExecutor({ vcs, store: store as unknown as StateStore });
    const result = await executor.execute({ mr: MR, role: 'reviewer', nodeId: 'node_effect' }, [
      { type: 'approve' },
    ]);

    assert.strictEqual(result.outcomes[0].status, 'skipped_duplicate');
  });

  it('GIVEN revoke запрошен, но MR НЕ approved мной WHEN execute() THEN skipped_duplicate ("нечего отзывать")', async () => {
    const mrContext: MrContext = {
      project: 'group/project',
      iid: '1',
      webUrl: MR,
      title: 'Test MR',
      sourceBranch: 'feature',
      targetBranch: 'main',
      createdAt: '',
      updatedAt: '',
      author: 'other',
      reviewers: [],
      approvedBy: [],
      description: '',
      myRole: 'reviewer',
    };
    vcs.seed([], { [MR]: mrContext });

    const executor = new EffectExecutor({ vcs, store: store as unknown as StateStore });
    const result = await executor.execute({ mr: MR, role: 'reviewer', nodeId: 'node_effect' }, [
      { type: 'approve', revoke: true },
    ]);

    assert.strictEqual(result.outcomes[0].status, 'skipped_duplicate');
  });
});
