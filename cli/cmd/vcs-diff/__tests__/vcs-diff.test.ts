// @file: Unit tests for vcs-diff CLI command — happy path, --path, --dry-run, error cases.
// @consumers: CI
// @tasks: TSK-81

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock state (module-level; assigned per test) ───────────────────────────────

let mockGetOneImpl: (...args: any[]) => Promise<any>;
let mockGetChangesImpl: (...args: any[]) => Promise<any>;
let mockGetFileContentImpl: (...args: any[]) => Promise<any>;

// ── Register module mock BEFORE importing SUT ─────────────────────────────────

mock.module('../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts', {
  namedExports: {
    VcsGitlabClient: class MockVcsGitlabClient {
      MergeRequests = {
        getOne: async (...args: any[]) => mockGetOneImpl(...args),
        getChanges: async (...args: any[]) => mockGetChangesImpl(...args),
      };
      RepositoryFiles = {
        getFileContent: async (...args: any[]) => mockGetFileContentImpl(...args),
      };
    },
  },
});

// ── Dynamic imports after mocks ───────────────────────────────────────────────

const { run } = await import('../vcs-diff.cmd.ts');
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

const BASE_ARGS = ['node', 'gennady', 'vcs-diff'];

const DEFAULT_CONTEXT = {
  provider: 'gitlab' as const,
  host: 'gitlab.company.com',
  project: 'group/repo',
  token: 'glpat-xxx',
};

const DEFAULT_CHANGES = [
  { path: 'src/a.ts', status: 'modified' as const, ref: 'feat/x', additions: 5, deletions: 2 },
  { path: 'src/b.ts', status: 'added' as const, ref: 'feat/x', additions: 30, deletions: 0 },
  { path: 'src/c.ts', status: 'deleted' as const, ref: 'feat/x', additions: 0, deletions: 42 },
];

// ── Test suite ────────────────────────────────────────────────────────────────

describe('vcs-diff run', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // BDD: --ref <ref> → список файлов (path, status, additions, deletions)
  // ────────────────────────────────────────────────────────────────────────────

  it('--ref group/repo!42 — prints formatted change lines from getChanges', async () => {
    // contract: explicit ref → resolveContext with iid → fetchChanges → formatChangeLine for each file
    // failure mode: do not assert on full token or host in output

    // #region START_REF_CHANGES_LIST_SETUP_MOCKS
    mockGetChangesImpl = async () => DEFAULT_CHANGES;

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));
    // #endregion END_REF_CHANGES_LIST_SETUP_MOCKS

    assert.match(result.stdout, /src\/a\.ts \(modified\) \+5\/-2/);
    assert.match(result.stdout, /src\/b\.ts \(added\) \+30\/-0/);
    assert.match(result.stdout, /src\/c\.ts \(deleted\) \+0\/-42/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: --path <file> → содержимое файла на head MR
  // ────────────────────────────────────────────────────────────────────────────

  it('--path src/a.ts — prints file content from MR head', async () => {
    // contract: --path filters changes, fetches file content, outputs raw content + trailing newline
    // failure mode: do not assert on ref value in output

    // #region START_PATH_FILE_CONTENT_SETUP_MOCKS
    mockGetChangesImpl = async () => DEFAULT_CHANGES;
    mockGetFileContentImpl = async (query: any) => {
      assert.strictEqual(query.path, 'src/a.ts');
      return { path: 'src/a.ts', content: 'export const a = 1;\n', encoding: 'utf-8' };
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--path=src/a.ts'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );
    // #endregion END_PATH_FILE_CONTENT_SETUP_MOCKS

    assert.strictEqual(result.stdout, 'export const a = 1;\n\n');
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BDD: --dry-run → Would fetch diff for: <ref>
  // ────────────────────────────────────────────────────────────────────────────

  it('--dry-run — prints Would fetch diff, does not call API', async () => {
    // contract: dry-run prints intent, does not call getChanges or getFileContent, exits 0

    let changesCalled = false;
    let fileContentCalled = false;
    mockGetChangesImpl = async () => {
      changesCalled = true;
      return [];
    };
    mockGetFileContentImpl = async () => {
      fileContentCalled = true;
      return null;
    };

    const result = await captureRun([...BASE_ARGS, '--ref=group/repo!42', '--dry-run'], () => ({
      ...DEFAULT_CONTEXT,
      iid: 42,
    }));

    assert.match(result.stdout, /Would fetch diff for: group\/repo!42/);
    assert.match(result.stdout, /\[DRY-RUN\] no request sent/);
    assert.strictEqual(changesCalled, false);
    assert.strictEqual(fileContentCalled, false);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-detect: branch lookup → MR → changes list
  // ────────────────────────────────────────────────────────────────────────────

  it('auto-detect — locates MR by branch, prints changes', async () => {
    // contract: no explicit iid → locateMrByBranch → fetchChanges → changes list
    // failure mode: do not assert on branch name in output text

    // #region START_AUTO_DETECT_SETUP_MOCKS
    mockGetOneImpl = async (query: any) => {
      assert.strictEqual(query.sourceBranch, 'feat/x');
      return { iid: 42 };
    };
    mockGetChangesImpl = async () => DEFAULT_CHANGES;

    const result = await captureRun(BASE_ARGS, () => ({
      ...DEFAULT_CONTEXT,
      branch: 'feat/x',
    }));
    // #endregion END_AUTO_DETECT_SETUP_MOCKS

    assert.match(result.stdout, /src\/a\.ts \(modified\) \+5\/-2/);
    assert.match(result.stdout, /src\/b\.ts \(added\) \+30\/-0/);
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
  // File not found in changes (--path with non-matching file)
  // ────────────────────────────────────────────────────────────────────────────

  it('--path missing — info that file not in MR changes, exit 0', async () => {
    // contract: --path file not present in changes list → info message → exit 0
    // invariant: getFileContent is never called

    let fileContentCalled = false;
    mockGetChangesImpl = async () => DEFAULT_CHANGES;
    mockGetFileContentImpl = async () => {
      fileContentCalled = true;
      return null;
    };

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--path=nonexistent.ts'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );

    assert.match(result.stdout, /ℹ Файл "nonexistent\.ts" не найден в изменениях MR !42/);
    assert.strictEqual(fileContentCalled, false);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // File has no content (getFileContent returns null)
  // ────────────────────────────────────────────────────────────────────────────

  it('getFileContent returns null — info, exit 0', async () => {
    // contract: file found in changes but content is null → info message → exit 0

    mockGetChangesImpl = async () => DEFAULT_CHANGES;
    mockGetFileContentImpl = async () => null;

    const result = await captureRun(
      [...BASE_ARGS, '--ref=group/repo!42', '--path=src/a.ts'],
      () => ({ ...DEFAULT_CONTEXT, iid: 42 })
    );

    assert.match(result.stdout, /ℹ Файл "src\/a\.ts" не содержит контента/);
    assert.strictEqual(result.exitCode, 0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // API error during fetchChanges
  // ────────────────────────────────────────────────────────────────────────────

  it('getChanges throws API error — error on stderr, exit 1', async () => {
    // contract: API error during changes fetch → error message on stderr → exit 1

    // #region START_API_ERROR_SETUP_MOCKS
    mockGetChangesImpl = async () => {
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
});
