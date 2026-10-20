// @file: Unit tests for vcs-pipeline CLI command — pipeline status, no-pipeline, dry-run, error cases.
// @consumers: CI
// @tasks: TSK-83

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock state (module-level; assigned per test) ───────────────────────────────

let mockGetOneImpl: (...args: any[]) => Promise<any>;
let mockGetPipelineImpl: (...args: any[]) => Promise<any>;
let mockGetPipelinesImpl: (...args: any[]) => Promise<any>;
let mockGetPipelineJobsImpl: (...args: any[]) => Promise<any>;
let mockGetJobLogImpl: (...args: any[]) => Promise<any>;

// ── Register module mock BEFORE importing SUT ─────────────────────────────────

mock.module('../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts', {
  namedExports: {
    VcsGitlabClient: class MockVcsGitlabClient {
      MergeRequests = {
        getOne: async (...args: any[]) => mockGetOneImpl(...args),
        getPipeline: async (...args: any[]) => mockGetPipelineImpl(...args),
      };
      Pipeline = {
        getPipelines: async (...args: any[]) => mockGetPipelinesImpl(...args),
        getPipelineJobs: async (...args: any[]) => mockGetPipelineJobsImpl(...args),
        getJobLog: async (...args: any[]) => mockGetJobLogImpl(...args),
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
 * @param overrides Optional dependency overrides (e.g. an instant `sleep` for watch tests).
 */
async function captureRun(
  rawArgs: string[],
  resolveImpl: () => any,
  overrides: Record<string, unknown> = {}
): Promise<CaptureResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let firstExitCode: number | null = null;

  const deps = {
    ...overrides,
    sleep: async () => {},
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
    { name: 'storybook', status: 'manual' },
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
    assert.match(result.stdout, /⊘ deploy \(canceled\)/);
    assert.match(result.stdout, /▶ storybook \(manual\)/);
    assert.doesNotMatch(result.stdout, /✖ storybook/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: --all → icons reflect real statuses (success must not render as ✖)
  // ────────────────────────────────────────────────────────────────────────────

  it('--all — renders success jobs with ✓ and keeps status casing in labels', async () => {
    // contract: --all disables the failed filter → all jobs listed with truthful icons
    // regression: uppercase API status (SUCCESS) must not render as ✖
    // failure mode: do not assert on job order

    // #region START_ALL_JOBS_ICONS_SETUP_MOCKS
    mockGetPipelineImpl = async () => ({
      status: 'FAILED',
      jobs: [
        { name: 'mc:validate', status: 'SUCCESS' },
        { name: 'mc:jest', status: 'FAILED' },
        { name: 'storybook:cdn:stop', status: 'MANUAL' },
      ],
    });

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42', '--all'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_ALL_JOBS_ICONS_SETUP_MOCKS

    assert.match(result.stdout, /✓ mc:validate \(SUCCESS\)/);
    assert.match(result.stdout, /✖ mc:jest \(FAILED\)/);
    assert.match(result.stdout, /▶ storybook:cdn:stop \(MANUAL\)/);
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

  // ────────────────────────────────────────────────────────────────────────────
  // Metadata: sha / iid / commit title / url / times
  // ────────────────────────────────────────────────────────────────────────────

  it('prints pipeline metadata (iid, sha, title, url, time) in text output', async () => {
    // contract: headPipeline metadata is rendered under the status header
    // failure mode: metadata must be omitted, not blank, when the API has none

    // #region START_METADATA_TEXT_SETUP_MOCKS
    mockGetPipelineImpl = async () => ({
      status: 'FAILED',
      iid: '3407',
      sha: 'd4788ee197d1091636fba25db8de330f1aca538b',
      ref: 'refs/merge-requests/299/merge',
      commitTitle: "Merge branch 'x' into 'y'",
      createdAt: '2026-09-16T05:37:51Z',
      updatedAt: '2026-09-16T06:15:27Z',
      jobs: [{ id: '1', name: 'mc:jest', status: 'FAILED' }],
    });

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_METADATA_TEXT_SETUP_MOCKS

    assert.match(result.stdout, /Pipeline status: FAILED/);
    assert.match(result.stdout, /iid\s+#3407/);
    assert.match(result.stdout, /sha\s+d4788ee197d1091636fba25db8de330f1aca538b/);
    assert.match(result.stdout, /title Merge branch 'x' into 'y'/);
    assert.match(
      result.stdout,
      /url {3}https:\/\/gitlab\.company\.com\/group\/repo\/-\/pipelines\/3407/
    );
    assert.match(result.stdout, /time\s+2026-09-16T05:37:51Z → 2026-09-16T06:15:27Z/);
    assert.strictEqual(result.exitCode, 0);
  });

  it('prints metadata in JSON output', async () => {
    // contract: --json carries status + metadata + jobs

    // #region START_METADATA_JSON_SETUP_MOCKS
    mockGetPipelineImpl = async () => ({
      status: 'SUCCESS',
      iid: '3407',
      sha: 'abc1234',
      createdAt: '2026-09-16T05:37:51Z',
      jobs: [],
    });

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42', '--json'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_METADATA_JSON_SETUP_MOCKS

    const payload = JSON.parse(result.stdout);
    assert.strictEqual(payload.status, 'SUCCESS');
    assert.strictEqual(payload.iid, '3407');
    assert.strictEqual(payload.sha, 'abc1234');
    assert.strictEqual(payload.url, 'https://gitlab.company.com/group/repo/-/pipelines/3407');
    assert.deepStrictEqual(payload.jobs, []);
    assert.strictEqual(result.exitCode, 0);
  });

  it('omits metadata lines when the API returns none', async () => {
    // contract: absence of metadata → no metadata lines at all

    mockGetPipelineImpl = async () => PIPELINE_FAILED;

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));

    assert.doesNotMatch(result.stdout, /iid\s+#/);
    assert.doesNotMatch(result.stdout, /sha\s+\w/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --list: recent pipelines by ref (no MR required)
  // ────────────────────────────────────────────────────────────────────────────

  it('--list --branch — lists recent pipelines with sha, time and URL', async () => {
    // contract: list mode calls Pipeline.getPipelines(ref) and prints newest-first rows

    // #region START_LIST_SETUP_MOCKS
    mockGetPipelinesImpl = async (query: any) => {
      assert.deepStrictEqual(query, { project: 'group/repo', ref: 'master', limit: 5 });
      return [
        {
          id: '49359152',
          iid: '3448',
          status: 'RUNNING',
          sha: '104475222d55a8e2e5785fcd7b9abc46aa9ef7d5',
          ref: 'master',
          createdAt: '2026-09-16T17:04:33Z',
          updatedAt: '2026-09-16T17:04:37Z',
          title: "Merge branch 'desktop-message-statuses' into 'master'",
        },
      ];
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--list', '--branch=master', '--limit=5'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42, branch: 'master' })
    );
    // #endregion END_LIST_SETUP_MOCKS

    assert.match(result.stdout, /Pipelines \(ref=master, limit=5, 1\):/);
    assert.match(result.stdout, /#3448 RUNNING @1044752 2026-09-16T17:04:33Z/);
    assert.match(result.stdout, /Merge branch 'desktop-message-statuses' into 'master'/);
    assert.match(result.stdout, /https:\/\/gitlab\.company\.com\/group\/repo\/-\/pipelines\/3448/);
    assert.strictEqual(result.exitCode, 0);
  });

  it('--list --json — machine-readable pipeline summaries', async () => {
    // contract: list JSON carries each summary plus a derived url

    mockGetPipelinesImpl = async () => [
      {
        id: '1',
        iid: '10',
        status: 'SUCCESS',
        sha: 'aaa',
        ref: 'master',
        createdAt: '2026-09-16T05:00:00Z',
        updatedAt: '2026-09-16T05:10:00Z',
        title: 't',
      },
    ];

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--list', '--json'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );

    const payload = JSON.parse(result.stdout);
    assert.strictEqual(payload.length, 1);
    assert.strictEqual(payload[0].iid, '10');
    assert.strictEqual(payload[0].url, 'https://gitlab.company.com/group/repo/-/pipelines/10');
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --branch without MR: latest pipeline of the ref
  // ────────────────────────────────────────────────────────────────────────────

  it('--branch — inspects the newest pipeline of that ref instead of an MR', async () => {
    // contract: ref mode takes getPipelines(limit=1) then getPipelineJobs for its iid

    // #region START_REF_MODE_SETUP_MOCKS
    mockGetPipelinesImpl = async (query: any) => {
      assert.deepStrictEqual(query, { project: 'group/repo', ref: 'master', limit: 1 });
      return [
        {
          id: '49359152',
          iid: '3448',
          status: 'FAILED',
          sha: '104475222d55a8e2e5785fcd7b9abc46aa9ef7d5',
          ref: 'master',
          createdAt: '2026-09-16T17:04:33Z',
          updatedAt: '2026-09-16T17:04:37Z',
          title: 'boom',
        },
      ];
    };
    mockGetPipelineJobsImpl = async (query: any) => {
      assert.deepStrictEqual(query, { project: 'group/repo', pipelineId: '3448' });
      return [
        { id: 'gid://gitlab/Ci::Build/1', name: 'mc:jest', status: 'FAILED' },
        { id: 'gid://gitlab/Ci::Build/2', name: 'mc:validate', status: 'SUCCESS' },
      ];
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--branch=master'],
      () => ({
        ...DEFAULT_CONTEXT,
        iid: 42,
        branch: 'master',
      })
    );
    // #endregion END_REF_MODE_SETUP_MOCKS

    assert.match(result.stdout, /Pipeline status: FAILED/);
    assert.match(result.stdout, /iid\s+#3448/);
    assert.match(result.stdout, /✖ mc:jest \(FAILED\)/);
    assert.doesNotMatch(result.stdout, /mc:validate/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --project / --ref as project carrier: ref mode must not fight the resolver
  // ────────────────────────────────────────────────────────────────────────────

  it('--branch with --ref — resolver receives project + branch, never ref', async () => {
    // contract: --ref only donates its project part in ref mode; ref+branch is not a conflict

    // #region START_REF_PROJECT_SETUP_MOCKS
    mockGetPipelinesImpl = async (query: any) => {
      assert.strictEqual(query.project, 'group/repo');
      assert.strictEqual(query.ref, 'master');
      return [];
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--branch=master'],
      (vcsArgs: any) => {
        assert.strictEqual(vcsArgs.ref, undefined);
        assert.strictEqual(vcsArgs.project, 'group/repo');
        assert.strictEqual(vcsArgs.branch, 'master');
        return { ...DEFAULT_CONTEXT, project: 'group/repo', branch: 'master' };
      }
    );
    // #endregion END_REF_PROJECT_SETUP_MOCKS

    assert.match(result.stdout, /No pipeline found for this ref/);
    assert.strictEqual(result.exitCode, 0);
  });

  it('--project --list — lists pipelines for an explicit project without MR', async () => {
    // contract: --project scopes ref/list mode so no git remote or MR is needed

    mockGetPipelinesImpl = async (query: any) => {
      assert.strictEqual(query.project, 'mail/messenger');
      assert.strictEqual(query.ref, 'master');
      return [];
    };

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--project=mail/messenger',
        '--host=gitlab.company.com',
        '--list',
        '--branch=master',
      ],
      (vcsArgs: any) => {
        assert.strictEqual(vcsArgs.project, 'mail/messenger');
        assert.strictEqual(vcsArgs.host, 'gitlab.company.com');
        return { ...DEFAULT_CONTEXT, project: 'mail/messenger', branch: 'master' };
      }
    );

    assert.match(result.stdout, /No pipelines found \(ref=master, limit=10\)/);
    assert.strictEqual(result.exitCode, 0);
  });

  it('--list without --branch — ignores a locally detected git branch', async () => {
    // regression: the resolver auto-detects the local git branch; list must not filter by it

    // #region START_LIST_NO_BRANCH_SETUP_MOCKS
    mockGetPipelinesImpl = async (query: any) => {
      assert.deepStrictEqual(query, { project: 'group/repo', limit: 10 });
      return [];
    };

    const result = await captureRun(
      [...BASE_ARGS, '--project=group/repo', '--host=gitlab.company.com', '--list'],
      () => ({ ...DEFAULT_CONTEXT, project: 'group/repo', branch: 'local-only-branch' })
    );
    // #endregion END_LIST_NO_BRANCH_SETUP_MOCKS

    assert.match(result.stdout, /No pipelines found \(limit=10\)/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --watch: poll to terminal status, exit code reflects the outcome
  // ────────────────────────────────────────────────────────────────────────────

  it('--watch — exits 1 when the pipeline ends FAILED', async () => {
    // contract: watch prints transitions, then the final report; exit 1 on failure

    // #region START_WATCH_FAILED_SETUP_MOCKS
    mockGetPipelineImpl = async () => ({
      status: 'FAILED',
      iid: '3407',
      jobs: [{ id: '1', name: 'mc:jest', status: 'FAILED' }],
    });

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--watch', '--interval=1', '--timeout=5'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );
    // #endregion END_WATCH_FAILED_SETUP_MOCKS

    assert.match(result.stdout, /\[watch\] \S+ FAILED/);
    assert.match(result.stdout, /Pipeline status: FAILED/);
    assert.strictEqual(result.exitCode, 1);
  });

  it('--until-done — exits 0 when the pipeline ends SUCCESS', async () => {
    // contract: terminal success ends the watch loop without failure exit code

    mockGetPipelineImpl = async () => ({ status: 'SUCCESS', iid: '1', jobs: [] });

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--until-done', '--interval=1', '--timeout=5'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );

    assert.match(result.stdout, /\[watch\] \S+ SUCCESS/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // --logs --test: narrow the inline logs to one failing test
  // ────────────────────────────────────────────────────────────────────────────

  it('--logs --test — keeps only the matching failure block', async () => {
    // contract: --test is threaded into log filtering, other blocks are dropped

    // #region START_LOGS_TEST_SETUP_MOCKS
    mockGetPipelineImpl = async () => ({
      status: 'FAILED',
      iid: '1',
      jobs: [{ id: '375461913', name: 'mc:e2e', status: 'FAILED' }],
    });
    mockGetJobLogImpl = async () =>
      [
        '  1) [chromium] › a.spec.ts:1:1 › rate-limit storm case',
        '    Error: Element is not attached',
        '    Call log:',
        '      - Expect "toBeAttached" with timeout 10000ms',
        '',
        '  2) [chromium] › b.spec.ts:2:2 › unrelated gallery case',
        '    Error: other boom',
      ].join('\n');

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--logs', '--test=rate-limit'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );
    // #endregion END_LOGS_TEST_SETUP_MOCKS

    assert.match(result.stdout, /rate-limit storm case/);
    assert.match(result.stdout, /Call log:/);
    assert.doesNotMatch(result.stdout, /unrelated gallery case/);
    assert.strictEqual(result.exitCode, 0);
  });
});
