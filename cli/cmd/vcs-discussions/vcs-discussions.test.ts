// @file: vcs-discussions tests — --my filter, --with-drafts, error cases, AI-22 contract.
// @consumers: CI
// @tasks: TSK-96

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Mock state (module-level; assigned per test) ───────────────────────────────

let mockGetAllImpl: (...args: any[]) => Promise<unknown[]>;
let mockListDraftNotesImpl: (...args: any[]) => Promise<unknown[]>;
let mockGetCurrentUserImpl: () => Promise<{ login: string; name: string }>;

// ── Register module mock BEFORE importing SUT ─────────────────────────────────

mock.module('../../../services/vcs-client/gitlab/vcs-gitlab-client.ts', {
  namedExports: {
    VcsGitlabClient: class MockVcsGitlabClient {
      MergeDiscussions = {
        getAll: async (...args: any[]) => mockGetAllImpl(...args),
        listDraftNotes: async (...args: any[]) => mockListDraftNotesImpl(...args),
      };
      getCurrentUser = () => mockGetCurrentUserImpl();
    },
  },
});

// ── Dynamic imports after mocks ───────────────────────────────────────────────

const { run } = await import('./vcs-discussions.cmd.ts');

// ── Exit sentinel ─────────────────────────────────────────────────────────────

class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`exit(${code})`);
    this.name = 'ExitError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type CaptureResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function captureRun(rawArgs: string[], resolveImpl: () => unknown): Promise<CaptureResult> {
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
      if (firstExitCode === null) firstExitCode = code;
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

const BASE_ARGS = ['node', 'gennady', 'vcs-discussions'];

const DEFAULT_CONTEXT = {
  provider: 'gitlab' as const,
  host: 'gitlab.company.com',
  project: 'group/repo',
  branch: undefined,
  token: 'glpat-xxx',
  iid: 42,
};

const DISCUSSIONS_FIXTURE = [
  {
    id: 101,
    notes: [
      {
        id: 1,
        author: { username: 'me', name: 'Me' },
        body: 'my note',
        created_at: '2025-01-01T00:00:00Z',
        position: undefined,
      },
    ],
    resolved: false,
  },
  {
    id: 102,
    notes: [
      {
        id: 2,
        author: { username: 'other', name: 'Other' },
        body: 'other note',
        created_at: '2025-01-02T00:00:00Z',
        position: undefined,
      },
    ],
    resolved: false,
  },
  {
    id: 103,
    notes: [
      {
        id: 3,
        author: { username: 'other', name: 'Other' },
        body: 'note 1',
        created_at: '2025-01-03T00:00:00Z',
        position: undefined,
      },
      {
        id: 4,
        author: { username: 'me', name: 'Me' },
        body: 'my reply',
        created_at: '2025-01-04T00:00:00Z',
        position: undefined,
      },
    ],
    resolved: false,
  },
];

const ME = { login: 'me', name: 'Me' };
const DRAFTS_FIXTURE = [{ id: 1, note: 'draft body', author: { username: 'me', name: 'Me' } }];

// ── Test suite ────────────────────────────────────────────────────────────────

describe('vcs-discussions run', () => {
  beforeEach(() => {
    mockGetAllImpl = async () => {
      throw new Error('unexpected getAll call in this scenario');
    };
    mockListDraftNotesImpl = async () => {
      throw new Error('unexpected listDraftNotes call in this scenario');
    };
    mockGetCurrentUserImpl = () => {
      throw new Error('unexpected getCurrentUser call in this scenario');
    };
  });

  // ────────────────────────────────────────────────────────────────────────────
  // vcs-discussions --url <URL> --json → все дискуссии (без фильтра)
  // ────────────────────────────────────────────────────────────────────────────

  it('vcs-discussions --url <URL> --json → все дискуссии (без фильтра)', async () => {
    // #region START_NO_FILTER_SETUP_MOCKS
    mockGetAllImpl = async () => [...DISCUSSIONS_FIXTURE];

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--url',
        'https://gitlab.company.com/group/repo/-/merge_requests/42',
        '--json',
      ],
      () => DEFAULT_CONTEXT
    );
    // #endregion END_NO_FILTER_SETUP_MOCKS

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.length, 3);
    assert.strictEqual(parsed[0].id, 101);
    // note id must be surfaced — it is the reaction target for `vcs-react --comment <noteId>`
    assert.strictEqual(parsed[0].notes[0].id, 1, 'each note must carry its id for vcs-react');
    assert.strictEqual(parsed[2].notes[1].id, 4);
    assert.strictEqual(parsed[2].notes[1].username, 'me', 'note author username surfaced');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // vcs-discussions --url <URL> --json --my → только дискуссии с моими нотами
  // ────────────────────────────────────────────────────────────────────────────

  it('vcs-discussions --url <URL> --json --my → только дискуссии с моими нотами', async () => {
    // #region START_MY_FILTER_SETUP_MOCKS
    mockGetAllImpl = async () => [...DISCUSSIONS_FIXTURE];
    mockGetCurrentUserImpl = async () => ({ ...ME });

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--url',
        'https://gitlab.company.com/group/repo/-/merge_requests/42',
        '--json',
        '--my',
      ],
      () => DEFAULT_CONTEXT
    );
    // #endregion END_MY_FILTER_SETUP_MOCKS

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.length, 2, 'should have 2 discussions with my notes');
    assert.strictEqual(parsed[0].id, 101);
    assert.strictEqual(parsed[1].id, 103);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // vcs-discussions --url <URL> --json --my --with-drafts → мои дискуссии + drafts: [...]
  // ────────────────────────────────────────────────────────────────────────────

  it('vcs-discussions --url <URL> --json --my --with-drafts → мои дискуссии + drafts', async () => {
    // #region START_WITH_DRAFTS_SETUP_MOCKS
    mockGetAllImpl = async () => [...DISCUSSIONS_FIXTURE];
    mockGetCurrentUserImpl = async () => ({ ...ME });
    mockListDraftNotesImpl = async () => [...DRAFTS_FIXTURE];

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--url',
        'https://gitlab.company.com/group/repo/-/merge_requests/42',
        '--json',
        '--my',
        '--with-drafts',
      ],
      () => DEFAULT_CONTEXT
    );
    // #endregion END_WITH_DRAFTS_SETUP_MOCKS

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.discussions.length, 2, 'should have 2 discussions');
    assert.strictEqual(parsed.discussions[0].id, 101);
    assert.strictEqual(parsed.discussions[1].id, 103);
    assert.strictEqual(parsed.drafts.length, 1);
    assert.strictEqual(parsed.drafts[0].id, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // vcs-discussions --url <URL> --json --with-drafts (без --my) → INVALID_ARGS
  // ────────────────────────────────────────────────────────────────────────────

  it('vcs-discussions --url <URL> --json --with-drafts (без --my) → INVALID_ARGS', async () => {
    // contract: --with-drafts requires --my → AI-22 error response

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--url',
        'https://gitlab.company.com/group/repo/-/merge_requests/42',
        '--json',
        '--with-drafts',
      ],
      () => DEFAULT_CONTEXT
    );

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.ok, false);
    assert.strictEqual(parsed.error, 'INVALID_ARGS');
    assert.strictEqual(parsed.detail, '--with-drafts requires --my');
    assert.strictEqual(result.exitCode, 2);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Нет моих дискуссий → { discussions: [], drafts: [...] } (если --with-drafts)
  // ────────────────────────────────────────────────────────────────────────────

  it('Нет моих дискуссий → { discussions: [], drafts: [...] } (если --with-drafts)', async () => {
    // #region START_NO_MY_DISCUSSIONS_SETUP_MOCKS
    mockGetAllImpl = async () => [
      {
        id: 201,
        notes: [
          {
            id: 10,
            author: { username: 'other', name: 'Other' },
            body: 'x',
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
        resolved: false,
      },
    ];
    mockGetCurrentUserImpl = async () => ({ ...ME });
    mockListDraftNotesImpl = async () => [...DRAFTS_FIXTURE];

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--url',
        'https://gitlab.company.com/group/repo/-/merge_requests/42',
        '--json',
        '--my',
        '--with-drafts',
      ],
      () => DEFAULT_CONTEXT
    );
    // #endregion END_NO_MY_DISCUSSIONS_SETUP_MOCKS

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.discussions.length, 0);
    assert.strictEqual(parsed.drafts.length, 1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getCurrentUser() API упал → NETWORK error (AI-22)
  // ────────────────────────────────────────────────────────────────────────────

  it('getCurrentUser() API упал → NETWORK error (AI-22)', async () => {
    // #region START_NETWORK_ERROR_SETUP_MOCKS
    mockGetAllImpl = async () => [...DISCUSSIONS_FIXTURE];
    mockGetCurrentUserImpl = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--url',
        'https://gitlab.company.com/group/repo/-/merge_requests/42',
        '--json',
        '--my',
        '--with-drafts',
      ],
      () => DEFAULT_CONTEXT
    );
    // #endregion END_NETWORK_ERROR_SETUP_MOCKS

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.ok, false);
    assert.strictEqual(parsed.error, 'NETWORK');
    assert.match(parsed.detail, /ECONNREFUSED/);
    assert.strictEqual(result.exitCode, 2);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // listDraftNotes() упал → drafts: [], warning в stderr
  // ────────────────────────────────────────────────────────────────────────────

  it('listDraftNotes() упал → drafts: [], warning в stderr', async () => {
    // #region START_DRAFTS_FALLBACK_SETUP_MOCKS
    mockGetAllImpl = async () => [...DISCUSSIONS_FIXTURE];
    mockGetCurrentUserImpl = async () => ({ ...ME });
    mockListDraftNotesImpl = async () => {
      throw new Error('Internal Server Error');
    };

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--url',
        'https://gitlab.company.com/group/repo/-/merge_requests/42',
        '--json',
        '--my',
        '--with-drafts',
      ],
      () => DEFAULT_CONTEXT
    );
    // #endregion END_DRAFTS_FALLBACK_SETUP_MOCKS

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.discussions.length, 2);
    assert.strictEqual(parsed.drafts.length, 0);
    assert.match(result.stderr, /Не удалось загрузить черновики/);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // vcs-discussions --url <URL> --all --json-file → writes discussions.json + summary with mine markers
  // ────────────────────────────────────────────────────────────────────────────

  it('vcs-discussions --json-file → пишет discussions.json + компактную сводку с mine', async () => {
    // #region START_JSON_FILE_SETUP_MOCKS
    mockGetAllImpl = async () => [...DISCUSSIONS_FIXTURE];
    mockGetCurrentUserImpl = async () => ({ ...ME });

    const stateDir = mkdtempSync(join(tmpdir(), 'gennady-disc-test-'));

    const result = await captureRun(
      [
        ...BASE_ARGS,
        '--url',
        'https://gitlab.company.com/group/repo/-/merge_requests/42',
        '--all',
        '--json-file',
        '--state-dir',
        stateDir,
      ],
      () => DEFAULT_CONTEXT
    );
    // #endregion END_JSON_FILE_SETUP_MOCKS

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.total, 3);
    assert.ok(parsed.file.endsWith('report/discussions.json'), 'file path points to reportsDir');
    assert.strictEqual(parsed.summary.length, 3);
    assert.strictEqual(parsed.summary[0].mine, true, 'disc 101 authored by me');
    assert.strictEqual(parsed.summary[1].mine, false, 'disc 102 authored by peer');
    assert.strictEqual(parsed.summary[2].mine, true, 'disc 103 has my reply');

    const onDisk = JSON.parse(readFileSync(parsed.file, 'utf-8'));
    assert.strictEqual(onDisk.length, 3, 'full discussions written to disk');
    assert.strictEqual(onDisk[0].notes[0].id, 1, 'note ids preserved for vcs-react');

    rmSync(stateDir, { recursive: true, force: true });
  });
});
