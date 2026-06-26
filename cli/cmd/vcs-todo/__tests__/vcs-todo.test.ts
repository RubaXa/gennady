// @file: Unit tests for vcs-todo — mark todos done by MR ref, by id, dry-run, empty todos.
// @consumers: CI
// @tasks: TSK-76

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Prevent top-level process.exit from killing the test runner ────────────────

const origExit = process.exit;
process.exit = ((code?: number) => {
  // no-op during tests — prevented by mock.module on resolveVcsContext + VcsGitlabClient
}) as unknown as typeof process.exit;

// ── Mock state ─────────────────────────────────────────────────────────────────

let mockGetActionableImpl: () => Promise<unknown[]>;
let mockMarkTodoDoneImpl: (query: { todoId: string }) => Promise<void>;

// ── Register module mocks BEFORE importing SUT ─────────────────────────────────

mock.module('../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts', {
  namedExports: {
    VcsGitlabClient: class MockVcsGitlabClient {
      Inbox = {
        getActionable: async () => mockGetActionableImpl(),
        markTodoDone: async (query: { todoId: string }) => {
          await mockMarkTodoDoneImpl(query);
        },
      };
    },
  },
});

mock.module('../../_shared/vcs-context-resolver.ts', {
  namedExports: {
    resolveVcsContext: async () => ({
      provider: 'gitlab' as const,
      host: 'gitlab.example.com',
      project: 'group/repo',
      token: 'glpat-test',
    }),
    VcsResolveError: class VcsResolveError extends Error {
      constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = 'VcsResolveError';
      }
    },
  },
});

// ── Dynamic import — top-level run() calls process.exit (no-op) ────────────────

const { main: mainFn } = await import('../vcs-todo.cmd.ts');

// ── Console capture helpers ────────────────────────────────────────────────────

let origInfo: typeof console.info;
let origError: typeof console.error;
let infoLines: string[];
let errorLines: string[];

function captureStart(): void {
  origInfo = console.info;
  origError = console.error;
  infoLines = [];
  errorLines = [];
  console.info = ((...args: unknown[]) => {
    infoLines.push(args.map(String).join(' '));
  }) as typeof console.info;
  console.error = ((...args: unknown[]) => {
    errorLines.push(args.map(String).join(' '));
  }) as typeof console.error;
}

function captureStop(): void {
  console.info = origInfo;
  console.error = origError;
}

// ── Default fixtures ───────────────────────────────────────────────────────────

const DEFAULT_CONTEXT = {
  provider: 'gitlab' as const,
  host: 'gitlab.example.com',
  project: 'group/repo',
  token: 'glpat-test',
};

const TODO_1 = 'gid://gitlab/Todo/1';
const TODO_2 = 'gid://gitlab/Todo/2';

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('vcs-todo main', () => {
  beforeEach(() => {
    captureStart();
    mockGetActionableImpl = async () => [];
    mockMarkTodoDoneImpl = async () => {};
  });

  afterEach(() => {
    captureStop();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --done <ref>
  // ────────────────────────────────────────────────────────────────────────────

  it('should mark all todos for an MR via --done <ref>', async () => {
    // contract: getActionable → find matching MR → markTodoDone per todoId
    // failure mode: do not skip todos or aggregate ids into one call

    const doneTodoIds: string[] = [];
    mockGetActionableImpl = async () => [
      {
        project: 'group/repo',
        iid: '42',
        todoIds: [TODO_1, TODO_2],
      },
    ];
    mockMarkTodoDoneImpl = async (query: { todoId: string }) => {
      doneTodoIds.push(query.todoId);
    };

    const result = await mainFn({
      doneRef: 'group/repo!42',
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(doneTodoIds, [TODO_1, TODO_2]);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --id <todoId>
  // ────────────────────────────────────────────────────────────────────────────

  it('should mark a specific todo via --id <todoId>', async () => {
    // contract: markTodoDone called directly with the given todoId
    // invariant: getActionable is never invoked

    let markCalled = false;
    let markTodoId = '';
    let getActionableCalled = false;
    mockGetActionableImpl = async () => {
      getActionableCalled = true;
      return [];
    };
    mockMarkTodoDoneImpl = async (query: { todoId: string }) => {
      markCalled = true;
      markTodoId = query.todoId;
    };

    const result = await mainFn({
      todoId: TODO_1,
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(markCalled, true);
    assert.strictEqual(markTodoId, TODO_1);
    assert.strictEqual(getActionableCalled, false);
    assert.match(infoLines.join('\n'), /Todo marked done/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // No pending todos
  // ────────────────────────────────────────────────────────────────────────────

  it('should print "No pending todos" when MR has no todoIds', async () => {
    // contract: getActionable returns matching MR with empty todoIds → info message → ok=true
    // invariant: markTodoDone is never called

    let markCalled = false;
    mockGetActionableImpl = async () => [
      {
        project: 'group/repo',
        iid: '42',
        todoIds: [],
      },
    ];
    mockMarkTodoDoneImpl = async () => {
      markCalled = true;
    };

    const result = await mainFn({
      doneRef: 'group/repo!42',
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(markCalled, false);
    assert.match(infoLines.join('\n'), /No pending todos/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --dry-run with --id
  // ────────────────────────────────────────────────────────────────────────────

  it('--id <todoId> --dry-run — prints would-mark without API call', async () => {
    // contract: dry-run prints intent, does not call markTodoDone, exits 0
    // invariant: markTodoDone is never invoked

    let markCalled = false;
    mockMarkTodoDoneImpl = async () => {
      markCalled = true;
    };

    const result = await mainFn({
      todoId: TODO_1,
      dryRun: true,
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(markCalled, false);
    assert.match(infoLines.join('\n'), /Would mark todo done: gid:\/\/gitlab\/Todo\/1/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --dry-run with --done (multiple todos)
  // ────────────────────────────────────────────────────────────────────────────

  it('--done <ref> --dry-run — prints would-mark for each todo, no API calls', async () => {
    // contract: dry-run scans todos, prints intent per todo, never calls markTodoDone
    // invariant: markTodoDone is never invoked

    let markCalled = false;
    mockGetActionableImpl = async () => [
      {
        project: 'group/repo',
        iid: '42',
        todoIds: [TODO_1, TODO_2],
      },
    ];
    mockMarkTodoDoneImpl = async () => {
      markCalled = true;
    };

    const result = await mainFn({
      doneRef: 'group/repo!42',
      dryRun: true,
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(markCalled, false);
    assert.match(infoLines.join('\n'), /Would mark todo done: gid:\/\/gitlab\/Todo\/1/);
    assert.match(infoLines.join('\n'), /Would mark todo done: gid:\/\/gitlab\/Todo\/2/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: no args
  // ────────────────────────────────────────────────────────────────────────────

  it('should return error when no --done or --id is given', async () => {
    // contract: missing required args → ok=false, code=1

    const result = await mainFn({
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 1);
    assert.match(errorLines.join('\n'), /Укажите --done <ref> или --id <todoId>/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: markTodoDone throws
  // ────────────────────────────────────────────────────────────────────────────

  it('should return error when markTodoDone fails via --id', async () => {
    // contract: markTodoDone throws → caught → ok=false, code=1
    // failure mode: do not swallow the error silently

    mockMarkTodoDoneImpl = async () => {
      throw new Error('GraphQL timeout');
    };

    const result = await mainFn({
      todoId: TODO_1,
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: getActionable throws
  // ────────────────────────────────────────────────────────────────────────────

  it('should return error when getActionable fails via --done', async () => {
    // contract: getActionable throws → caught → ok=false, code=1
    // failure mode: do not swallow the API error

    mockGetActionableImpl = async () => {
      throw new Error('Network error');
    };

    const result = await mainFn({
      doneRef: 'group/repo!42',
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: bad ref format
  // ────────────────────────────────────────────────────────────────────────────

  it('should return error for bad --done ref format (missing !)', async () => {
    // contract: ref without ! → error message → ok=false, code=1

    const result = await mainFn({
      doneRef: 'group/repo',
      vcsContext: DEFAULT_CONTEXT,
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 1);
    assert.match(errorLines.join('\n'), /Ожидался ref вида group\/project!iid/);
  });
});
