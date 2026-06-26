// @file: Unit tests for vcs-job CLI command — job status, play, cancel, retry, dry-run, error cases.
// @consumers: CI
// @tasks: TSK-85

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock state (module-level; assigned per test) ───────────────────────────────

let mockGetPipelineImpl: (...args: any[]) => Promise<any>;
let mockGetJobImpl: (...args: any[]) => Promise<any>;
let mockPlayJobImpl: (...args: any[]) => Promise<any>;
let mockCancelJobImpl: (...args: any[]) => Promise<any>;

// ── Register module mock BEFORE importing SUT ─────────────────────────────────

mock.module('../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts', {
  namedExports: {
    VcsGitlabClient: class MockVcsGitlabClient {
      MergeRequests = {
        getPipeline: async (...args: any[]) => mockGetPipelineImpl(...args),
      };
      Pipeline = {
        getJob: async (...args: any[]) => mockGetJobImpl(...args),
        playJob: async (...args: any[]) => mockPlayJobImpl(...args),
        cancelJob: async (...args: any[]) => mockCancelJobImpl(...args),
      };
    },
  },
});

// ── Dynamic imports after mocks ───────────────────────────────────────────────

const { run } = await import('../vcs-job.cmd.ts');
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
  exitCode: number;
  stdout: string;
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

const BASE_ARGS = ['node', 'gennady', 'vcs-job'];

const DEFAULT_CONTEXT = {
  provider: 'gitlab' as const,
  host: 'gitlab.company.com',
  project: 'group/repo',
  token: 'glpat-xxx',
};

const PIPELINE_WITH_JOBS = {
  status: 'running',
  jobs: [
    { id: '12345', name: 'lint', status: 'running' },
    { id: '67890', name: 'test', status: 'pending' },
  ],
};

const JOB_LINT: any = {
  id: '12345',
  name: 'lint',
  status: 'success',
  stage: 'test',
  ref: 'feature/x',
  webUrl: 'https://gitlab.company.com/group/repo/-/jobs/12345',
};

const JOB_TEST: any = {
  id: '67890',
  name: 'test',
  status: 'failed',
  stage: 'test',
  ref: 'feature/x',
  webUrl: 'https://gitlab.company.com/group/repo/-/jobs/67890',
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('vcs-job run', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // BDD: vcs-job --job <name> → getPipeline→resolve id→getJob→status
  // ────────────────────────────────────────────────────────────────────────────

  it('should resolve job by name via pipeline and print status', async () => {
    // contract: job name → pipeline fetch → resolve name to id → getJob → output status
    // failure mode: do not assert on full URL or token in output

    // #region START_RESOLVE_BY_NAME_SETUP_MOCKS
    mockGetPipelineImpl = async (query: any) => {
      assert.strictEqual(query.project, 'group/repo');
      assert.strictEqual(query.iid, 42);
      return PIPELINE_WITH_JOBS;
    };
    mockGetJobImpl = async (query: any) => {
      assert.strictEqual(query.project, 'group/repo');
      assert.strictEqual(query.jobId, '12345');
      return JOB_LINT;
    };

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42', '--job=lint'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_RESOLVE_BY_NAME_SETUP_MOCKS

    assert.match(result.stdout, /Job: lint/);
    assert.match(result.stdout, /Status: success/);
    assert.match(result.stdout, /Stage:  test/);
    assert.match(result.stdout, /Ref:    feature\/x/);
    assert.match(result.stdout, /URL:    https:\/\/gitlab/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: vcs-job --job <id> → getJob→status (id match without name lookup)
  // ────────────────────────────────────────────────────────────────────────────

  it('should resolve job by id directly and print status', async () => {
    // contract: numeric job id → matches by id first → getJob → output status

    // #region START_RESOLVE_BY_ID_SETUP_MOCKS
    mockGetPipelineImpl = async () => PIPELINE_WITH_JOBS;
    mockGetJobImpl = async (query: any) => {
      assert.strictEqual(query.jobId, '12345');
      return JOB_LINT;
    };

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42', '--job=12345'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_RESOLVE_BY_ID_SETUP_MOCKS

    assert.match(result.stdout, /Job: lint/);
    assert.match(result.stdout, /Status: success/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: vcs-job --job <id> --action play → playJob→status
  // ────────────────────────────────────────────────────────────────────────────

  it('should play job by id and print status after play', async () => {
    // contract: --action play → playJob API call → output resulting job status

    // #region START_PLAY_JOB_SETUP_MOCKS
    mockGetPipelineImpl = async () => PIPELINE_WITH_JOBS;
    mockPlayJobImpl = async (query: any) => {
      assert.strictEqual(query.project, 'group/repo');
      assert.strictEqual(query.jobId, '12345');
      return { ...JOB_LINT, status: 'running' };
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--job=12345', '--action=play'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );
    // #endregion END_PLAY_JOB_SETUP_MOCKS

    assert.match(result.stdout, /Job: lint/);
    assert.match(result.stdout, /Status: running/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: vcs-job --job <id> --action cancel → cancelJob→status
  // ────────────────────────────────────────────────────────────────────────────

  it('should cancel job by id and print status after cancel', async () => {
    // contract: --action cancel → cancelJob API call → output resulting job status

    // #region START_CANCEL_JOB_SETUP_MOCKS
    mockGetPipelineImpl = async () => PIPELINE_WITH_JOBS;
    mockCancelJobImpl = async (query: any) => {
      assert.strictEqual(query.project, 'group/repo');
      assert.strictEqual(query.jobId, '12345');
      return { ...JOB_LINT, status: 'canceled' };
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--job=12345', '--action=cancel'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );
    // #endregion END_CANCEL_JOB_SETUP_MOCKS

    assert.match(result.stdout, /Job: lint/);
    assert.match(result.stdout, /Status: canceled/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: vcs-job --job <name> retry → playJob (alias)
  // ────────────────────────────────────────────────────────────────────────────

  it('should treat retry action as play alias', async () => {
    // contract: --action retry → normalized to play → playJob API call → output status

    // #region START_RETRY_ALIAS_SETUP_MOCKS
    mockGetPipelineImpl = async () => PIPELINE_WITH_JOBS;
    mockPlayJobImpl = async (query: any) => {
      assert.strictEqual(query.jobId, '12345');
      return { ...JOB_LINT, status: 'running' };
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--job=lint', '--action=retry'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );
    // #endregion END_RETRY_ALIAS_SETUP_MOCKS

    assert.match(result.stdout, /Job: lint/);
    assert.match(result.stdout, /Status: running/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: --dry-run — prints intent without calling API
  // ────────────────────────────────────────────────────────────────────────────

  it('should print intent and not call API on dry-run', async () => {
    // contract: --dry-run prints intent, does not call getPipeline/playJob/cancelJob, exits 0
    // invariant: no GitLab API is invoked

    let pipelineCalled = false;
    mockGetPipelineImpl = async () => {
      pipelineCalled = true;
      return PIPELINE_WITH_JOBS;
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--job=lint', '--action=play', '--dry-run'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );

    assert.match(result.stdout, /Would play job "lint" for: group\/repo!42/);
    assert.match(result.stdout, /\[DRY-RUN\] no request sent/);
    assert.strictEqual(pipelineCalled, false);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: missing --job
  // ────────────────────────────────────────────────────────────────────────────

  it('should report error when --job is missing', async () => {
    // contract: no --job flag → error message on stderr → exit 1

    const result = await captureRun(BASE_ARGS, () => DEFAULT_CONTEXT);

    assert.match(result.stderr, /✖ Ошибка: --job <name\|id> обязателен/);
    assert.strictEqual(result.exitCode, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: job not found in pipeline
  // ────────────────────────────────────────────────────────────────────────────

  it('should report error when job is not found in pipeline', async () => {
    // contract: job name/id not in pipeline.jobs → API error message on stderr → exit 1

    // #region START_JOB_NOT_FOUND_SETUP_MOCKS
    mockGetPipelineImpl = async () => PIPELINE_WITH_JOBS;

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--job=nonexistent'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );
    // #endregion END_JOB_NOT_FOUND_SETUP_MOCKS

    assert.match(result.stderr, /✖ GitLab API error: \[resolveJobId\] Job not found: nonexistent/);
    assert.strictEqual(result.exitCode, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: VcsResolveError
  // ────────────────────────────────────────────────────────────────────────────

  it('should report error on VcsResolveError', async () => {
    // contract: resolver failure → error message on stderr → exit 1

    // #region START_RESOLVE_ERROR_SETUP_MOCKS
    const result = await captureRun([...BASE_ARGS, '--job=lint'], () => {
      throw new VcsResolveError('no GITLAB_PERSONAL_TOKEN');
    });
    // #endregion END_RESOLVE_ERROR_SETUP_MOCKS

    assert.match(result.stderr, /✖ Ошибка: no GITLAB_PERSONAL_TOKEN/);
    assert.strictEqual(result.exitCode, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: API failure during pipeline fetch
  // ────────────────────────────────────────────────────────────────────────────

  it('should report error on API failure during pipeline fetch', async () => {
    // contract: getPipeline throws → API error message on stderr → exit 1

    // #region START_PIPELINE_API_ERROR_SETUP_MOCKS
    mockGetPipelineImpl = async () => {
      throw new Error('GitLab request failed: 500 Internal Server Error');
    };

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42', '--job=lint'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_PIPELINE_API_ERROR_SETUP_MOCKS

    assert.match(
      result.stderr,
      /✖ GitLab API error: GitLab request failed: 500 Internal Server Error/
    );
    assert.strictEqual(result.exitCode, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Error: requires explicit MR ref with iid
  // ────────────────────────────────────────────────────────────────────────────

  it('should require explicit MR ref with iid when context has no iid', async () => {
    // contract: context without iid → stderr message → exit 1

    const result = await captureRun([...BASE_ARGS, '--job=lint'], () => ({ ...DEFAULT_CONTEXT }));

    assert.match(result.stderr, /✖ Ошибка: vcs-job требует явный MR ref/);
    assert.strictEqual(result.exitCode, 1);
  });
});
