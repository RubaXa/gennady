// @file: Unit tests for vcs-approve CLI command — happy path, dry-run, error cases.
// @consumers: CI
// @tasks: TSK-69

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock state (module-level; assigned per test) ───────────────────────────────

let mockGetOneImpl: (...args: any[]) => Promise<any>;
let mockApproveImpl: (...args: any[]) => Promise<void>;

// ── Register module mock BEFORE importing SUT ─────────────────────────────────

mock.module('../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts', {
  namedExports: {
    VcsGitlabClient: class MockVcsGitlabClient {
      MergeRequests = {
        getOne: async (...args: any[]) => mockGetOneImpl(...args),
        approve: async (...args: any[]) => {
          await mockApproveImpl(...args);
        },
      };
    },
  },
});

// ── Dynamic imports after mocks ───────────────────────────────────────────────

const { run } = await import('../vcs-approve.cmd.ts');
const { VcsApproveError } =
  await import('../../../../services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts');
const { VcsResolveError } = await import('../../_shared/vcs-context-resolver.ts');

// ── Exit sentinel ─────────────────────────────────────────────────────────────

class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`exit(${code})`);
    this.name = 'ExitError';
  }
}

// ── Unified context factory ───────────────────────────────────────────────────

type CaptureResult = {
  /** captured exit code */
  exitCode: number;
  /** accumulated stdout writes */
  stdout: string;
  /** accumulated stderr writes */
  stderr: string;
};

/**
 * Run the command with a mocked resolver and capture all output + exit code.
 * @param rawArgs CLI arguments (including argv[0], argv[1]).
 * @param resolveImpl What resolveVcsContext returns (or throws).
 */
async function captureRun(rawArgs: string[], resolveImpl: () => any): Promise<CaptureResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let firstExitCode: number | null = null;

  const deps = {
    resolveVcsContext: mock.fn(resolveImpl),
    stdout: {
      write: (s: string) => {
        stdoutChunks.push(s);
        return true;
      },
    } as NodeJS.WriteStream,
    stderr: {
      write: (s: string) => {
        stderrChunks.push(s);
        return true;
      },
    } as NodeJS.WriteStream,
    exit: (code: number): never => {
      if (firstExitCode === null) {
        firstExitCode = code;
      }
      throw new ExitError(code);
    },
  };

  try {
    await run(rawArgs, deps);
  } catch (e) {
    if (!(e instanceof ExitError)) throw e;
  }

  return {
    exitCode: firstExitCode ?? -1,
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
  };
}

// ── Default fixtures ──────────────────────────────────────────────────────────

const BASE_ARGS = ['node', 'gennady', 'vcs-approve'];

const DEFAULT_CONTEXT = {
  provider: 'gitlab' as const,
  host: 'gitlab.company.com',
  project: 'group/repo',
  branch: 'feat/x',
  token: 'glpat-xxx',
};

const DEFAULT_MR = {
  iid: 42,
  web_url: 'https://gitlab.company.com/group/repo/-/merge_requests/42',
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('vcs-approve run', () => {
  beforeEach(() => {
    mockGetOneImpl = async () => {
      throw new Error('unexpected getOne call in this scenario');
    };
    mockApproveImpl = async () => {};
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Happy path
  // ────────────────────────────────────────────────────────────────────────────

  it('auto-detect — approve success, exit 0', async () => {
    // contract: auto-detected MR via branch lookup → approve call → success output → exit 0
    // failure mode: do not assert on full URL or token in output

    // #region START_AUTO_DETECT_SETUP_MOCKS
    mockGetOneImpl = async (query: any) => {
      assert.strictEqual(query.sourceBranch, 'feat/x');
      assert.strictEqual(query.state, 'opened');
      return DEFAULT_MR;
    };
    mockApproveImpl = async (query: any) => {
      assert.strictEqual(query.repository, 'group/repo');
      assert.strictEqual(query.iid, 42);
    };

    const result = await captureRun(BASE_ARGS, () => DEFAULT_CONTEXT);
    // #endregion END_AUTO_DETECT_SETUP_MOCKS

    assert.match(
      result.stdout,
      /✓ MR !42 approved: https:\/\/gitlab.company.com\/group\/repo\/-\/merge_requests\/42/
    );
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Explicit ref
  // ────────────────────────────────────────────────────────────────────────────

  it('--ref group/repo!99 — passes ref to resolver', async () => {
    // contract: explicit ref parsed from CLI args, resolver returns project+iid, approve called with correct args

    // #region START_EXPLICIT_REF_SETUP_MOCKS
    mockApproveImpl = async (query: any) => {
      assert.strictEqual(query.repository, 'group/repo');
      assert.strictEqual(query.iid, 99);
    };

    const result = await captureRun([...BASE_ARGS, '--ref', 'group/repo!99'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 99,
    }));
    // #endregion END_EXPLICIT_REF_SETUP_MOCKS

    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Dry-run
  // ────────────────────────────────────────────────────────────────────────────

  it('--dry-run — prints Would approve, does not call API', async () => {
    // contract: dry-run prints intent, does not call approve API, exits 0
    // invariant: approve() is never invoked

    let approveCalled = false;
    mockApproveImpl = async () => {
      approveCalled = true;
    };

    const result = await captureRun([...BASE_ARGS, '--dry-run'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));

    assert.match(result.stdout, /Would approve: group\/repo!42 +host=gitlab\.company\.com/);
    assert.match(result.stdout, /\[DRY-RUN\] no request sent/);
    assert.strictEqual(approveCalled, false);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Already approved (idempotent)
  // ────────────────────────────────────────────────────────────────────────────

  it('ALREADY_APPROVED — info message, exit 0', async () => {
    // contract: already-approved MR returns info message with exit 0 — idempotent

    // #region START_ALREADY_APPROVED_SETUP_MOCKS
    mockApproveImpl = async () => {
      throw new VcsApproveError('ALREADY_APPROVED', 'already approved');
    };

    const result = await captureRun([...BASE_ARGS, '--ref', 'group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_ALREADY_APPROVED_SETUP_MOCKS

    assert.match(result.stdout, /ℹ MR !42 already approved/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Self-approve forbidden
  // ────────────────────────────────────────────────────────────────────────────

  it('SELF_APPROVE_FORBIDDEN — error message, exit 1', async () => {
    // contract: self-approve response from API → stderr message → exit 1

    // #region START_SELF_APPROVE_SETUP_MOCKS
    mockApproveImpl = async () => {
      throw new VcsApproveError('SELF_APPROVE_FORBIDDEN', 'forbidden');
    };

    const result = await captureRun([...BASE_ARGS, '--ref', 'group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_SELF_APPROVE_SETUP_MOCKS

    assert.match(result.stderr, /Self-approval is not permitted/);
    assert.strictEqual(result.exitCode, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Merge conflict / CANNOT_APPROVE
  // ────────────────────────────────────────────────────────────────────────────

  it('409 CANNOT_APPROVE — error message, exit 1', async () => {
    // contract: merge conflict → CANNOT_APPROVE error code → stderr with 409 status → exit 1

    // #region START_CANNOT_APPROVE_SETUP_MOCKS
    mockApproveImpl = async () => {
      throw new VcsApproveError(
        'CANNOT_APPROVE',
        'GitLab request failed: 409 Conflict {"message":"Merge conflict"}'
      );
    };

    const result = await captureRun([...BASE_ARGS, '--ref', 'group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_CANNOT_APPROVE_SETUP_MOCKS

    assert.match(result.stderr, /✖ GitLab API error \[409\]/);
    assert.strictEqual(result.exitCode, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // MR not found
  // ────────────────────────────────────────────────────────────────────────────

  it('getOne returns null — info, exit 0', async () => {
    // contract: auto-detect branch lookup returns null → info message → exit 0

    // #region START_MR_NOT_FOUND_SETUP_MOCKS
    mockGetOneImpl = async () => null;

    const result = await captureRun(BASE_ARGS, () => DEFAULT_CONTEXT);
    // #endregion END_MR_NOT_FOUND_SETUP_MOCKS

    assert.match(result.stdout, /ℹ Merge Request не найден для ветки: feat\/x/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Resolver error
  // ────────────────────────────────────────────────────────────────────────────

  it('VcsResolveError — error message, exit 1', async () => {
    // contract: resolver failure → error message on stderr → exit 1

    // #region START_RESOLVE_ERROR_SETUP_MOCKS
    const result = await captureRun(BASE_ARGS, () => {
      throw new VcsResolveError('no GITLAB_PERSONAL_TOKEN');
    });
    // #endregion END_RESOLVE_ERROR_SETUP_MOCKS

    assert.match(result.stderr, /✖ Ошибка: no GITLAB_PERSONAL_TOKEN/);
    assert.strictEqual(result.exitCode, 1);
  });
});
