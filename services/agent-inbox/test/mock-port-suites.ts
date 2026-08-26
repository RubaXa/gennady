// @file: mock-port-suites — shared port contract suite definitions executed against every mock adapter.
// @consumers: inbox-mocks __tests__/mock-port.contract.test.ts
// @tasks: TSK-180

import assert from 'node:assert/strict';
import type { JournalPort } from '../modules/inbox-core/event-journal.ts';
import type { ArtifactStorePort } from '../modules/inbox-core/ports/artifact-store.port.ts';
import type { ClockPort } from '../modules/inbox-core/ports/clock.port.ts';
import type { TaskExecutorPort } from '../modules/inbox-queue/ports/task-executor.port.ts';
import type { ProjectionPort } from '../modules/inbox-api/projections/projection.port.ts';
import { InMemoryJournalAdapter } from '../modules/inbox-mocks/adapters/in-memory-journal.adapter.ts';
import { InMemoryArtifactAdapter } from '../modules/inbox-mocks/adapters/in-memory-artifact.adapter.ts';
import { ControlledClockAdapter } from '../modules/inbox-mocks/adapters/controlled-clock.adapter.ts';
import { DeterministicTaskExecutor } from '../modules/inbox-mocks/adapters/deterministic-task-executor.adapter.ts';
import { InMemoryProjectionAdapter } from '../modules/inbox-mocks/adapters/in-memory-projection.adapter.ts';
import { MockAgentAdapter } from '../modules/inbox-mocks/adapters/mock-agent.adapter.ts';
import {
  MockVcsAdapter,
  type MockVcsEntry,
} from '../modules/inbox-mocks/adapters/mock-vcs.adapter.ts';
import type { VcsActionableMr } from '../../vcs-client/entities/vcs-actionable-mr.type.ts';

// #region START_VCS_SEED_FIXTURE — minimal seeded entry for VCS read-contract tests
const MOCK_MR: VcsActionableMr = {
  iid: '42',
  project: 'group/project',
  webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
  title: 'feat: contract test MR',
  description: '',
  author: 'j.doe',
  reviewers: ['k.lebedev'],
  approvedBy: [],
  updatedAt: '2026-01-01T00:00:00Z',
  draft: false,
  state: 'opened',
  role: 'reviewer',
  events: [],
  directlyAddressed: false,
  todoIds: [],
};

const MOCK_ENTRY: MockVcsEntry = {
  detail: {
    project: 'group/project',
    iid: '42',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
    title: 'feat: contract test MR',
    description: '',
    author: 'j.doe',
    reviewers: ['k.lebedev'],
    approvedBy: [],
    updatedAt: '2026-01-01T00:00:00Z',
    state: 'opened',
    headSha: 'abc123',
    pipelineStatus: null,
    userNotesCount: 0,
    draft: false,
  },
  discussionPages: [{ discussions: [], pageInfo: { hasNextPage: false, endCursor: null } }],
};
// #endregion END_VCS_SEED_FIXTURE

/**
 * @purpose Assert that a JournalPort adapter satisfies the shared port contract.
 * @param adapter Adapter under test.
 * @returns Resolved when all journal contract assertions pass.
 */
export async function assertJournalPortContract(adapter: JournalPort): Promise<void> {
  assert.equal(adapter.health().status, 'healthy', 'health() reports healthy');
  assert.ok(
    typeof adapter.identity === 'string' && adapter.identity.length > 0,
    'identity is non-empty'
  );

  const seq1 = await adapter.append({
    ts: '2026-01-01T00:00:00Z',
    mr: 'group/proj!1',
    kind: 'system',
  });
  const seq2 = await adapter.append({
    ts: '2026-01-01T00:01:00Z',
    mr: 'group/proj!1',
    kind: 'task_created',
  });
  assert.ok(seq2 > seq1, 'seq is monotonically increasing');

  const entries = adapter.read();
  assert.equal(entries.length, 2, 'read() returns all appended entries');
  assert.equal(entries[0].seq, seq1, 'first entry has correct seq');

  const since = adapter.since(seq1);
  assert.equal(since.entries.length, 1, 'since() returns entries after cursor');
  assert.equal(since.entries[0].seq, seq2, 'since() returns correct entry');
  assert.equal(since.nextCursor, seq2, 'since() returns updated cursor');
}

/**
 * @purpose Assert that an ArtifactStorePort adapter satisfies the shared port contract.
 * @param adapter Adapter under test.
 * @returns Resolved when all artifact store contract assertions pass.
 */
export async function assertArtifactStorePortContract(adapter: ArtifactStorePort): Promise<void> {
  assert.equal(adapter.health().status, 'healthy', 'health() reports healthy');
  assert.ok(
    typeof adapter.identity === 'string' && adapter.identity.length > 0,
    'identity is non-empty'
  );

  const address = { mr: 'group/proj!1', id: 'review.json' };
  const content = new TextEncoder().encode('{"test":true}');

  await adapter.put(address, content);
  const retrieved = await adapter.read(address);
  assert.deepEqual(retrieved, content, 'read() returns exact stored bytes');

  const listed = await adapter.list(address.mr);
  assert.deepEqual(listed, [address.id], 'list() returns artifact id');

  await assert.rejects(
    () => adapter.read({ mr: 'group/proj!1', id: 'nonexistent' }),
    /nonexistent/,
    'read() rejects absent artifact'
  );
}

/**
 * @purpose Assert that a ClockPort adapter satisfies the shared port contract.
 * @param adapter Adapter under test — must be a ControlledClockAdapter.
 */
export function assertClockPortContract(
  adapter: ClockPort & { advanceTo(at: string): void }
): void {
  assert.equal(adapter.health().status, 'healthy', 'health() reports healthy');
  assert.ok(
    typeof adapter.identity === 'string' && adapter.identity.length > 0,
    'identity is non-empty'
  );

  const initial = adapter.now();
  assert.ok(typeof initial === 'string' && initial.includes('T'), 'now() returns ISO string');

  let fired = false;
  const target = '2026-01-01T01:00:00.000Z';
  adapter.schedule(target, () => {
    fired = true;
  });
  assert.equal(fired, false, 'callback not fired before advance');

  adapter.advanceTo(target);
  assert.equal(fired, true, 'callback fired after advance to target instant');

  let cancelled = false;
  const handle = adapter.schedule('2026-01-01T02:00:00.000Z', () => {
    cancelled = true;
  });
  handle.cancel();
  adapter.advanceTo('2026-01-01T02:00:00.000Z');
  assert.equal(cancelled, false, 'cancelled callback never fires');
}

/**
 * @purpose Assert that a TaskExecutorPort adapter satisfies the shared port contract.
 * @param createAdapter Factory producing a fresh adapter for each assertion group.
 * @returns Resolved when all task executor contract assertions pass.
 */
export async function assertTaskExecutorPortContract(
  createAdapter: () => TaskExecutorPort
): Promise<void> {
  const adapter = createAdapter();

  const task = {
    taskId: 'task-1',
    kind: 'review',
    mr: 'group/proj!1',
    status: 'queued' as const,
    priority: 50,
    dependsOn: [] as readonly string[],
    dedupKey: 'review:group/proj!1',
    params: {},
    provenance: { createdBy: 'test', createdAt: '2026-01-01T00:00:00Z' },
  };

  const { taskId } = await adapter.enqueue(task);
  assert.equal(taskId, task.taskId, 'enqueue returns assigned taskId');

  const progress = adapter.progress(task.mr);
  assert.equal(progress.queued, 1, 'progress reports one queued task after enqueue');

  const claim = await adapter.claim(task.mr);
  assert.equal(claim.claimed, true, 'claim succeeds for queued task');

  await adapter.complete(task.mr, taskId, 'done');
  const progAfter = adapter.progress(task.mr);
  assert.equal(progAfter.done, 1, 'progress reports done after complete');
}

/**
 * @purpose Assert that a ProjectionPort adapter satisfies the shared port contract.
 * @param adapter Adapter under test.
 */
export function assertProjectionPortContract(adapter: ProjectionPort): void {
  const board = adapter.board();
  assert.ok(Array.isArray(board.mine), 'board() returns mine array');
  assert.ok(Array.isArray(board.assigned), 'board() returns assigned array');

  const feed = adapter.feed('group/proj!1', 0);
  assert.ok(Array.isArray(feed.widgets), 'feed() returns widgets array');
  assert.ok(typeof feed.nextCursor === 'number', 'feed() returns nextCursor number');

  const mr = adapter.mr('group/proj!unknown');
  assert.equal(mr, null, 'mr() returns null for unknown MR');

  const packages = adapter.packages('group/proj!1');
  assert.ok(Array.isArray(packages.current), 'packages() returns current array');
  assert.ok(Array.isArray(packages.stale), 'packages() returns stale array');

  const testRun = adapter.testRun('group/proj!1');
  assert.equal(testRun.status, 'unknown', 'testRun() returns unknown status for unseeded MR');

  assert.ok(typeof adapter.cursor() === 'number', 'cursor() returns number');
}

/**
 * @purpose Assert that a MockAgentAdapter satisfies the AgentRuntimePort contract.
 * @param adapter Adapter under test.
 * @returns Resolved when all agent runtime contract assertions pass.
 */
export async function assertAgentRuntimePortContract(adapter: MockAgentAdapter): Promise<void> {
  const handle = await adapter.createScriptedSession(
    { title: 'contract-test-session', directory: '/tmp/test' },
    [{ ok: true, output: { verdict: 'approved' } }]
  );

  assert.ok(handle.sid.length > 0, 'createSession returns non-empty sid');
  assert.equal(handle.status, 'idle', 'new session starts idle');

  const result = await adapter.prompt(handle.sid, { text: 'Analyze MR' });
  assert.equal(result.ok, true, 'prompt returns scripted ok result');

  const messages = await adapter.messages(handle.sid);
  assert.equal(messages.length, 2, 'messages() returns user and assistant message');

  const status = await adapter.status(handle.sid);
  assert.equal(status, 'completed', 'status is completed after successful prompt');

  await assert.rejects(
    () => adapter.prompt(handle.sid, { text: 'Extra call' }),
    /Unspecified call/,
    'exhausted response queue fails loudly'
  );
}

/**
 * @purpose Assert that a MockVcsAdapter satisfies the VcsPort contract.
 * @param adapter Adapter under test (pre-seeded).
 * @returns Resolved when all VCS port contract assertions pass.
 */
export async function assertVcsPortContract(adapter: MockVcsAdapter): Promise<void> {
  adapter.seed([MOCK_MR], { 'group/project!42': MOCK_ENTRY });

  const inbox = await adapter.getInbox();
  assert.equal(inbox.length, 1, 'getInbox returns seeded MR');

  const login = await adapter.getCurrentUserLogin();
  assert.ok(typeof login === 'string', 'getCurrentUserLogin returns string');

  const detail = await adapter.getMrDetail('group/project', '42');
  assert.equal(detail.project, 'group/project', 'getMrDetail returns seeded detail');

  const page = await adapter.getDiscussions('group/project', '42');
  assert.ok(Array.isArray(page.discussions), 'getDiscussions returns discussions array');

  await assert.rejects(
    () => adapter.getMrDetail('unknown/project', '99'),
    /Unseeded MR/,
    'unseeded getMrDetail fails loudly'
  );

  await adapter.approve('group/project', '42');
  const recorded = adapter.recordedEffects();
  assert.equal(recorded.length, 1, 'approve records one effect');
  assert.equal(recorded[0].kind, 'approve', 'recorded effect kind is approve');
}

/**
 * @purpose Compose fresh adapter instances for all named port contract suites.
 * @returns Named factories returning fresh adapters per invocation.
 */
export function composePortContractSuites(): {
  journal: () => InMemoryJournalAdapter;
  artifactStore: () => InMemoryArtifactAdapter;
  clock: () => ControlledClockAdapter;
  taskExecutor: () => DeterministicTaskExecutor;
  projection: () => InMemoryProjectionAdapter;
  agent: () => MockAgentAdapter;
  vcs: () => MockVcsAdapter;
} {
  return {
    journal: () => new InMemoryJournalAdapter(),
    artifactStore: () => new InMemoryArtifactAdapter(),
    clock: () => new ControlledClockAdapter('2026-01-01T00:00:00.000Z'),
    taskExecutor: () => new DeterministicTaskExecutor(new InMemoryJournalAdapter()),
    projection: () => new InMemoryProjectionAdapter(),
    agent: () => new MockAgentAdapter(),
    vcs: () => new MockVcsAdapter(),
  };
}
