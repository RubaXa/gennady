// @file: Unit tests for vcs-pipeline CLI command — pipeline status, no-pipeline, dry-run, error cases.
// @consumers: CI
// @tasks: TSK-83

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock state (module-level; assigned per test) ───────────────────────────────

let mockGetOneImpl: (...args: any[]) => Promise<any>;
let mockGetPipelineImpl: (...args: any[]) => Promise<any>;

// ── Register module mock BEFORE importing SUT ─────────────────────────────────

mock.module('../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts', {
  namedExports: {
    VcsGitlabClient: class MockVcsGitlabClient {
      MergeRequests = {
        getOne: async (...args: any[]) => mockGetOneImpl(...args),
        getPipeline: async (...args: any[]) => mockGetPipelineImpl(...args),
      };
    },
  },
});

// ── Dynamic imports after mocks ───────────────────────────────────────────────

const { run } = await import('../vcs-pipeline.cmd.ts');
const { VcsResolveError } = await import('../../_shared/vcs-context-resolver.ts');

// ── Exit sentinel ─────────────────────────────────────────────────────────────

class ExitError extends Error {
  public readonly code: number;
  constructor(code: number) {
    super(`exit(${code})`);
    this.code = code;
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

const BASE_ARGS = ['node', 'gennady', 'vcs-pipeline'];

const DEFAULT_CONTEXT = {
  provider: 'gitlab' as const,
  host: 'gitlab.company.com',
  project: 'group/repo',
  token: 'glpat-xxx',
};

const PIPELINE_SUCCESS = {
  status: 'success',
  jobs: [
    { name: 'build', status: 'success' },
    { name: 'test', status: 'success' },
    { name: 'deploy', status: 'success' },
  ],
};

const PIPELINE_FAILED = {
  status: 'failed',
  jobs: [
    { name: 'build', status: 'success' },
    { name: 'test', status: 'failed' },
    { name: 'lint', status: 'failed' },
    { name: 'deploy', status: 'canceled' },
  ],
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('vcs-pipeline run', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // BDD: --ref <ref> → pipeline status + failed jobs list
  // ────────────────────────────────────────────────────────────────────────────

  it('--ref group/repo!42 — prints pipeline status and failed jobs', async () => {
    // contract: explicit ref → resolveContext with iid → fetchPipeline → pipeline status + failed jobs list
    // failure mode: do not assert on full token or host in output

    // #region START_REF_PIPELINE_FAILED_SETUP_MOCKS
    mockGetPipelineImpl = async () => PIPELINE_FAILED;

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_REF_PIPELINE_FAILED_SETUP_MOCKS

    assert.match(result.stdout, /Pipeline status: failed/);
    assert.match(result.stdout, /✖ test \(failed\)/);
    assert.match(result.stdout, /✖ lint \(failed\)/);
    assert.match(result.stdout, /✖ deploy \(canceled\)/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: --ref <ref> with all jobs passing
  // ────────────────────────────────────────────────────────────────────────────

  it('--ref group/repo!42 — all jobs passed', async () => {
    // contract: pipeline with all jobs success → No matching jobs (default failed filter) → exit 0
    // failure mode: do not assert on job count in output

    // #region START_REF_PIPELINE_ALL_PASSED_SETUP_MOCKS
    mockGetPipelineImpl = async () => PIPELINE_SUCCESS;

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_REF_PIPELINE_ALL_PASSED_SETUP_MOCKS

    assert.match(result.stdout, /Pipeline status: success/);
    assert.match(result.stdout, /No matching jobs\./);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: no pipeline → No pipeline found, exit 0
  // ────────────────────────────────────────────────────────────────────────────

  it('no pipeline — prints No pipeline found, exit 0', async () => {
    // contract: pipeline with empty status → No pipeline found → exit 0

    // #region START_NO_PIPELINE_SETUP_MOCKS
    mockGetPipelineImpl = async () => ({ status: '', jobs: [] });

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_NO_PIPELINE_SETUP_MOCKS

    assert.match(result.stdout, /No pipeline found for this MR/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: --dry-run → Would fetch pipeline for: <ref>
  // ────────────────────────────────────────────────────────────────────────────

  it('--dry-run — prints Would fetch pipeline, does not call API', async () => {
    // contract: dry-run prints intent, does not call getPipeline, exits 0
    // invariant: getPipeline is never invoked

    let pipelineCalled = false;
    mockGetPipelineImpl = async () => {
      pipelineCalled = true;
      return { status: '', jobs: [] };
    };

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42', '--dry-run'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));

    assert.match(result.stdout, /Would fetch pipeline for: group\/repo!42/);
    assert.match(result.stdout, /\[DRY-RUN\] no request sent/);
    assert.strictEqual(pipelineCalled, false);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-detect: branch lookup → MR → pipeline
  // ────────────────────────────────────────────────────────────────────────────

  it('auto-detect — locates MR by branch, prints pipeline', async () => {
    // contract: no explicit iid → locateMrByBranch → fetchPipeline → pipeline output
    // failure mode: do not assert on branch name in output text

    // #region START_AUTO_DETECT_SETUP_MOCKS
    mockGetOneImpl = async (query: any) => {
      assert.strictEqual(query.sourceBranch, 'feat/x');
      assert.strictEqual(query.state, 'opened');
      return { iid: 42 };
    };
    mockGetPipelineImpl = async () => PIPELINE_FAILED;

    const result = await captureRun(BASE_ARGS, () => ({
      ...DEFAULT_CONTEXT,
      branch: 'feat/x',
    }));
    // #endregion END_AUTO_DETECT_SETUP_MOCKS

    assert.match(result.stdout, /Pipeline status: failed/);
    assert.match(result.stdout, /test \(failed\)/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // MR not found (getOne returns null)
  // ────────────────────────────────────────────────────────────────────────────

  it('getOne returns null — info message, exit 0', async () => {
    // contract: auto-detect branch lookup returns null → info message → exit 0

    mockGetOneImpl = async () => null;

    const result = await captureRun(BASE_ARGS, () => ({
      ...DEFAULT_CONTEXT,
      branch: 'feat/x',
    }));

    assert.match(result.stdout, /ℹ Merge Request не найден для ветки: feat\/x/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // VcsResolveError
  // ────────────────────────────────────────────────────────────────────────────

  it('VcsResolveError — error message on stderr, exit 1', async () => {
    // contract: resolver failure → error message on stderr → exit 1

    // #region START_RESOLVE_ERROR_SETUP_MOCKS
    const result = await captureRun(BASE_ARGS, () => {
      throw new VcsResolveError('no GITLAB_PERSONAL_TOKEN');
    });
    // #endregion END_RESOLVE_ERROR_SETUP_MOCKS

    assert.match(result.stderr, /✖ Ошибка: no GITLAB_PERSONAL_TOKEN/);
    assert.strictEqual(result.exitCode, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // API error during getPipeline
  // ────────────────────────────────────────────────────────────────────────────

  it('getPipeline throws API error — error on stderr, exit 1', async () => {
    // contract: API error during pipeline fetch → error message on stderr → exit 1

    // #region START_API_ERROR_SETUP_MOCKS
    mockGetPipelineImpl = async () => {
      throw new Error('GitLab request failed: 500 Internal Server Error');
    };

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_API_ERROR_SETUP_MOCKS

    assert.match(
      result.stderr,
      /✖ GitLab API error: GitLab request failed: 500 Internal Server Error/
    );
    assert.strictEqual(result.exitCode, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // API error during locateMrByBranch
  // ────────────────────────────────────────────────────────────────────────────

  it('locateMrByBranch throws API error — error on stderr, exit 1', async () => {
    // contract: API error during MR lookup → error message on stderr → exit 1

    // #region START_LOOKUP_ERROR_SETUP_MOCKS
    mockGetOneImpl = async () => {
      throw new Error('GitLab request failed: 403 Forbidden');
    };

    const result = await captureRun(BASE_ARGS, () => ({
      ...DEFAULT_CONTEXT,
      branch: 'feat/x',
    }));
    // #endregion END_LOOKUP_ERROR_SETUP_MOCKS

    assert.match(result.stderr, /✖ GitLab API error: GitLab request failed: 403 Forbidden/);
    assert.strictEqual(result.exitCode, 1);
  });
});
