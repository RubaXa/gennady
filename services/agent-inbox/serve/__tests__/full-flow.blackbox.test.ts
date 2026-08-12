// @file: Highest-tier black-box proof for TSK-150 — the PRODUCTION runMrsOnce path drives BOTH
//   real adapters (VcsInboxReal over GitLab REST+GraphQL, OpenCodeReal over @opencode-ai/sdk) with
//   only the undici transport faked. Complements vcs-inbox.real.blackbox.test.ts and
//   opencode.real.blackbox.test.ts (each adapter alone, D-212) by proving the SAME network seam
//   holds when both are wired together through the real reviewer graph, not a hand-built one.
// @consumers: node:test runner
// @tasks: TSK-150, TSK-167, TSK-170, TSK-174

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupMockAgent, type InterceptedRequest, type MockReply } from '#utils/test/mock-http.ts';
import { runMrsOnce, type RunModeDeps } from '../run-mode.ts';
import { RoleEngine } from '../../modules/inbox-roles/role-engine.ts';
import { StateStore } from '../../modules/inbox-core/state-store.ts';
import { VcsInboxReal } from '../../modules/inbox-core/vcs-inbox.real.ts';
import { OpenCodeReal } from '../../modules/inbox-opencode/opencode.real.ts';
import { mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

const HOST = 'gitlab.test';
const OPENCODE_BASE = 'http://opencode.test';
const PROJECT = 'group/project';
const IID = '164';
const MR_URL = `https://${HOST}/${PROJECT}/-/merge_requests/${IID}`;

/**
 * @purpose Fresh StateStore rooted at a temp dir + a `repos.json` seeded to point PROJECT at the
 *   stateDir itself (non-git). Reused verbatim from run-mode.test.ts's `makeStateStore` (D-212
 *   pattern): `context-builder.ts#_prepareWorktreeAndChangeset` calls the REAL `ensureClone` +
 *   `prepareMrWorktree` regardless of network faking (git/worktree is a local, non-network seam
 *   this ticket does not own — TSK-149 territory per the ticket's adaptive clause). Seeding
 *   `repos.json` makes `ensureClone` short-circuit on the reposMap hit (no real clone attempt);
 *   the subsequent `git worktree` op on a non-repo dir then fails fast, locally, and
 *   `_prepareWorktreeAndChangeset`'s own try/catch degrades to an empty changeset — never touches
 *   the network, keeping `disableNetConnect` honest.
 */
function makeStateStore(): StateStore {
  const stateDir = mkdtempSync(join(tmpdir(), 'gennady-full-flow-'));
  mkdirSync(join(stateDir, 'agent-inbox'), { recursive: true });
  writeFileSync(join(stateDir, 'repos.json'), JSON.stringify({ [PROJECT]: stateDir }), 'utf8');
  return new StateStore(stateDir);
}

/** One MergeRequest node in the exact shape the GraphQL actionable query selects. */
function mrNode(): Record<string, unknown> {
  return {
    iid: IID,
    title: 'Full-flow MR',
    webUrl: MR_URL,
    updatedAt: '2026-07-20T10:00:00Z',
    draft: false,
    state: 'opened',
    description: '',
    author: { username: 'someone-else' },
    reviewers: { nodes: [{ username: 'me' }] },
    approvedBy: { nodes: [] },
    project: { fullPath: PROJECT },
  };
}

/** The GitLab REST merge-request shape `MergeRequests.getByIid` returns. */
function restMr(): Record<string, unknown> {
  return {
    web_url: MR_URL,
    title: 'Full-flow MR',
    source_branch: 'feature',
    target_branch: 'main',
    created_at: '2026-07-20T09:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    author: { username: 'someone-else' },
    reviewers: [{ username: 'me' }],
    approved_by: [],
    description: '',
  };
}

/**
 * @purpose Stand in for what the real enrich session does with its write tool (bash/read/write,
 *   no JSON reply): lays down the same on-disk result — PLAN.md plus every scaffolded task file
 *   carrying `status: enriched` and a filled `## Контекст` — so `gate_enrich` (real, unstubbed)
 *   validates actual files, matching `run-mode.test.ts`'s identical fixture.
 */
function seedEnrichedTaskFiles(store: StateStore, ref: string, headSha = 'head1111'): void {
  const dir = mrReportsDir(store.getStateDir(), ref);
  const tasksDir = join(dir, 'tasks');
  mkdirSync(tasksDir, { recursive: true });

  const planPath = join(dir, 'PLAN.md');
  const planSha = existsSync(planPath)
    ? (/^headSha:\s*(\S+)/m.exec(readFileSync(planPath, 'utf8'))?.[1] ?? headSha)
    : headSha;
  if (!existsSync(planPath)) {
    writeFileSync(planPath, `---\nref: ${ref}\nheadSha: ${planSha}\n---\n\n# План ревью\n`, 'utf8');
  }

  const body = (track: string): string =>
    `---\ntrack: ${track}\nstatus: enriched\nheadSha: ${planSha}\n---\n\n` +
    `## Область\n\n- services/agent-inbox/foo.ts\n\n` +
    `## Контекст\n\nЦель MR — добавить проверку граничного случая. Смотреть точку входа и её вызовы.\n\n` +
    `## Находки\n\n<!-- FILL -->\n\n## Кандидаты\n\n<!-- FILL -->\n\n## Вердикт\n\n<!-- FILL -->\n`;

  const existing = readdirSync(tasksDir).filter((f) => f.endsWith('.task.md'));
  const targets = existing.length > 0 ? existing : ['logic.task.md'];
  for (const name of targets) {
    writeFileSync(join(tasksDir, name), body(name.replace(/\.task\.md$/, '')), 'utf8');
  }
}

/** The assistant-message envelope OpenCode's session.prompt returns (info + JSON-fenced parts). */
function assistantJson(payload: unknown): MockReply {
  return {
    status: 200,
    body: {
      info: { id: `msg_${Math.random()}`, role: 'assistant' },
      parts: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`` }],
    },
  };
}

/** session.create reply — echoes the requested title back as a deterministic session id. */
function sessionCreateReply(req: InterceptedRequest): MockReply {
  const body = JSON.parse(req.body ?? '{}') as { title?: string };
  const title = body.title ?? 'unknown';
  return { status: 200, body: { id: `ses_${title}`, title, directory: '/wt' } };
}

describe('full-flow (real VcsInboxReal + real OpenCodeReal, network faked at undici) [integration]', () => {
  let mockEnv: ReturnType<typeof setupMockAgent>;
  let originalToken: string | undefined;
  let originalOpencodePort: string | undefined;

  beforeEach(() => {
    mockEnv = setupMockAgent(); // disableNetConnect by default — strict black-box
    originalToken = process.env.GITLAB_PERSONAL_TOKEN;
    originalOpencodePort = process.env.OPENCODE_PORT;
    process.env.GITLAB_PERSONAL_TOKEN = 'fake-token';
    // Signals an operator-supplied opencode already running — skips any real spawn path even
    // though this suite constructs OpenCodeReal directly and never touches bootstrap's spawn wiring.
    process.env.OPENCODE_PORT = '0';
  });

  afterEach(() => {
    mockEnv.cleanup();
    if (originalToken === undefined) delete process.env.GITLAB_PERSONAL_TOKEN;
    else process.env.GITLAB_PERSONAL_TOKEN = originalToken;
    if (originalOpencodePort === undefined) delete process.env.OPENCODE_PORT;
    else process.env.OPENCODE_PORT = originalOpencodePort;
  });

  it('drives a real reviewer MR to a terminal state with both backends faked at the network layer', async () => {
    // #region SETUP_GITLAB_INTERCEPTS — discovery (GraphQL) + per-MR REST (getByIid, /user)
    const graphqlReply = (req: { body: string | null }) => {
      const body = req.body ?? '';
      const sources =
        body.match(
          /reviewRequestedMergeRequests\(|assignedMergeRequests\(|authoredMergeRequests\(/g
        ) ?? [];
      assert.strictEqual(sources.length, 1);
      const source = sources[0]!.slice(0, -1);
      assert.match(body, new RegExp(`${source}\\(first: 100`));
      assert.doesNotMatch(body, /todos\(/); // discovery does not read pending todos
      return {
        status: 200,
        body: {
          data: {
            currentUser: {
              reviewRequestedMergeRequests: {
                nodes: source === 'reviewRequestedMergeRequests' ? [mrNode()] : [],
              },
              assignedMergeRequests: { nodes: [] },
              authoredMergeRequests: { nodes: [] },
            },
          },
        },
      };
    };
    const graphqlTracker = mockEnv.interceptMultiple('POST', `https://${HOST}/api/graphql`, [
      graphqlReply,
      graphqlReply,
      graphqlReply,
    ]);

    // `getMrContext` is re-fetched by `RoleInstance#_buildContext` on EVERY `step()` (plus once
    // upfront by `_runOneMr`'s own role check, plus once more by `buildNodeContext`'s initial
    // checkpoint seed) — not just once per MR. A fixed reply pool sized to the exact step count
    // would be brittle to a graph-shape change; oversize the pool and assert attempts > 0 instead,
    // matching the ticket's own attempt-counter contract (`> 0`, not an exact count).
    const mrContextTracker = mockEnv.interceptMultiple(
      'GET',
      `https://${HOST}/api/v4/projects/${encodeURIComponent(PROJECT)}/merge_requests/${IID}`,
      Array.from({ length: 12 }, () => ({ status: 200, body: restMr() }))
    );

    const userTracker = mockEnv.interceptMultiple(
      'GET',
      `https://${HOST}/api/v4/user`,
      Array.from({ length: 12 }, () => ({ status: 200, body: { username: 'me', name: 'Me' } }))
    );
    // #endregion SETUP_GITLAB_INTERCEPTS

    // Created here (not after discovery) so the enrich reply closure below can seed its files —
    // context-builder's ensureClone short-circuits on this same dir via repos.json regardless.
    const store = makeStateStore();
    const ref = `${PROJECT}!${IID}`;

    // #region SETUP_OPENCODE_INTERCEPTS — enrich + 4 fanned-out lens sessions + 1 synthesis session
    const sessionCreateTracker = mockEnv.interceptMultiple('POST', `${OPENCODE_BASE}/session`, [
      sessionCreateReply,
      sessionCreateReply,
      sessionCreateReply,
      sessionCreateReply,
      sessionCreateReply,
      sessionCreateReply,
    ]);

    const enrichMessageTracker = mockEnv.interceptOnce(
      'POST',
      `${OPENCODE_BASE}/session/ses_node_enrich/message`,
      () => {
        seedEnrichedTaskFiles(store, ref);
        return {
          status: 200,
          body: {
            info: { id: 'msg_enrich', role: 'assistant' },
            parts: [{ type: 'text', text: 'Enriched all task files.' }],
          },
        };
      }
    );

    const trackMessageTracker = mockEnv.interceptOnce(
      'POST',
      `${OPENCODE_BASE}/session/ses_node_track_review/message`,
      assistantJson({
        findings: [{ file: 'a.ts', line: 10, severity: 'warn', message: 'needs a null check' }],
      })
    );
    const securityMessageTracker = mockEnv.interceptOnce(
      'POST',
      `${OPENCODE_BASE}/session/ses_node_security_lens/message`,
      assistantJson({ findings: [] })
    );
    const codeReviewMessageTracker = mockEnv.interceptOnce(
      'POST',
      `${OPENCODE_BASE}/session/ses_node_code_review/message`,
      assistantJson({ findings: [] })
    );
    const contractMessageTracker = mockEnv.interceptOnce(
      'POST',
      `${OPENCODE_BASE}/session/ses_node_contract_review/message`,
      assistantJson({ findings: [] })
    );
    // CRITICAL (TSK-149 lesson, per ticket): gate_review_synthesis requires reviewReport with ALL
    // of summary/verdict/behavior/scenarios non-empty — seed a complete reviewReport here.
    const synthesizeMessageTracker = mockEnv.interceptOnce(
      'POST',
      `${OPENCODE_BASE}/session/ses_node_synthesize/message`,
      assistantJson({
        reviewReport: {
          summary: 'Adds a null-check guard on the client cache lookup path.',
          verdict: 'changes_requested',
          behavior: 'The client now returns an explicit error instead of silently ignoring a miss.',
          scenarios:
            'A request races a cache eviction; a cold-start lookup before warmup completes.',
        },
        proposedActions: [
          {
            type: 'reply',
            body: 'Consider guarding this earlier',
            position: { file: 'a.ts', newLine: 10 },
          },
        ],
      })
    );
    // #endregion SETUP_OPENCODE_INTERCEPTS

    const vcs = new VcsInboxReal({ host: HOST, token: 'fake-token' });

    // #region TRIGGER_DISCOVERY — GraphQL discovery, real adapter, over the intercepted network
    const actionable = await vcs.getActionable();
    assert.strictEqual(actionable.length, 1);
    assert.strictEqual(actionable[0]!.webUrl, MR_URL);
    // #endregion TRIGGER_DISCOVERY

    const engine = new RoleEngine();
    await engine.loadAll();
    const opencode = new OpenCodeReal({ baseUrl: OPENCODE_BASE });

    const deps: RunModeDeps = {
      engine,
      store,
      vcs,
      opencode,
      // Diff_refs are irrelevant to this flow's terminal-state proof (fetchDiffRefsLive would add a
      // 3rd REST call this ticket does not need to prove); stubbed per the same pattern as
      // run-mode.test.ts.
      fetchDiffRefs: async () => undefined,
    };

    const result = await runMrsOnce({ mrs: [actionable[0]!.webUrl], dryRun: true, deps });

    // #region ASSERT_TERMINAL_STATE — real reviewer graph, real adapters, faked network only
    assert.strictEqual(result.results.length, 1);
    const mrResult = result.results[0]!;
    assert.strictEqual(mrResult.error, undefined);
    assert.strictEqual(mrResult.state, 'awaiting_operator');
    assert.strictEqual(mrResult.role, 'reviewer');
    assert.ok(mrResult.board, 'board snapshot should be present');
    assert.strictEqual((mrResult.board as Record<string, unknown>).currentNode, 'node_ask');
    // #endregion ASSERT_TERMINAL_STATE

    // #region ASSERT_BOTH_BACKENDS_ACTUALLY_INTERCEPTED — disableNetConnect never threw, per-endpoint proof
    assert.strictEqual(graphqlTracker.getAttemptCount(), 3);
    assert.ok(
      mrContextTracker.getAttemptCount() > 0,
      'MR-context REST endpoint must have been hit'
    );
    assert.ok(userTracker.getAttemptCount() > 0, '/user REST endpoint must have been hit');
    assert.strictEqual(sessionCreateTracker.getAttemptCount(), 6);
    assert.strictEqual(enrichMessageTracker.getAttemptCount(), 1);
    assert.strictEqual(trackMessageTracker.getAttemptCount(), 1);
    assert.strictEqual(securityMessageTracker.getAttemptCount(), 1);
    assert.strictEqual(codeReviewMessageTracker.getAttemptCount(), 1);
    assert.strictEqual(contractMessageTracker.getAttemptCount(), 1);
    assert.strictEqual(synthesizeMessageTracker.getAttemptCount(), 1);
    // #endregion ASSERT_BOTH_BACKENDS_ACTUALLY_INTERCEPTED
  });
});
