// @file: Unit tests for vcs-draft-note command — CLI draft-note lifecycle via run().
// @consumers: N/A
// @tasks: TSK-87

import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VcsResolveError } from '../../_shared/vcs-context-resolver.ts';
import type { VcsCliContext } from '../../_shared/vcs-context-resolver.ts';

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../..');

// ── Module-level mock for resolveVcsContext ──────────────────────────────

const resolveVcsContextTracker = mock.fn(
  async (_args: any): Promise<VcsCliContext> => ({
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

// ── Mock fetch responses (controlled per-test) ───────────────────────────

let fetchResponse: Response;
const origFetch = globalThis.fetch;

function mockFetchResponse(responseInit: { status?: number; body?: unknown }): void {
  const body = responseInit.body;
  fetchResponse = {
    ok: responseInit.status === undefined ? true : responseInit.status < 400,
    status: responseInit.status ?? 200,
    statusText: '',
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: () => fetchResponse,
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
  } as Response;
  globalThis.fetch = (async () => fetchResponse) as typeof fetch;
}

function restoreFetch(): void {
  globalThis.fetch = origFetch;
}

// ── Import SUT ───────────────────────────────────────────────────────────

const cmdModule = await import('../vcs-draft-note.cmd.ts');
const { run } = cmdModule;

// ── Output capture helpers ───────────────────────────────────────────────

let stderrLines: string[];
let stdoutLines: string[];
let exitCodes: number[];
let _origStderrWrite: typeof process.stderr.write;
let _origStdoutWrite: typeof process.stdout.write;
const origExit = process.exit;

function captureOutput(): void {
  stderrLines = [];
  stdoutLines = [];
  exitCodes = [];
  _origStderrWrite = process.stderr.write.bind(process.stderr);
  _origStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stderr.write = ((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  process.stdout.write = ((chunk: unknown) => {
    stdoutLines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
}

function restoreOutput(): void {
  process.stderr.write = _origStderrWrite;
  process.stdout.write = _origStdoutWrite;
}

beforeEach(() => {
  process.env.GENNADY_LOG_LEVEL = 'silent';
  captureOutput();
  process.exit = ((code?: number) => {
    exitCodes.push(code ?? 0);
    return undefined as never;
  }) as typeof process.exit;
  mockFetchResponse({ status: 500, body: 'Internal Server Error' });
});

afterEach(() => {
  restoreOutput();
  restoreFetch();
  process.exit = origExit;
  process.env.GENNADY_LOG_LEVEL = '';
});

// ── Helpers ──────────────────────────────────────────────────────────────

type VcsDraftDeps = Parameters<typeof run>[1];

async function runDraft(args: string[], depsOverrides?: Partial<VcsDraftDeps>) {
  await run(args, {
    resolveVcsContext: depsOverrides?.resolveVcsContext ?? resolveVcsContextTracker,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
  });
}

// ── BDD: vcs-draft-note --list → listDraftNotes ───────────────────────────────

describe('vcs-draft-note --list', () => {
  it('should call listDraftNotes and print drafts', async () => {
    mockFetchResponse({
      body: [
        { id: 10, body: 'draft one' },
        { id: 20, body: 'draft two body text' },
      ],
    });

    await runDraft(['node', 'gennady', 'vcs-draft-note', '--project=g/p', '--iid=42', '--list']);

    // #region START_LIST_DRAFTS_ASSERT
    assert.strictEqual(exitCodes[0], 0);

    const joined = stdoutLines.join('');
    assert.match(joined, /Черновики \(2\)/);
    assert.match(joined, /#10: draft one/);
    assert.match(joined, /#20: draft two body text/);
    // #endregion END_LIST_DRAFTS_ASSERT
  });

  it('should print "Нет черновиков" when list is empty', async () => {
    mockFetchResponse({ body: [] });

    await runDraft(['node', 'gennady', 'vcs-draft-note', '--project=g/p', '--iid=42', '--list']);

    const joined = stdoutLines.join('');
    assert.match(joined, /Нет черновиков для этого MR/);
  });
});

// ── BDD: vcs-draft-note --create ──────────────────────────────────────────────

describe('vcs-draft-note --create', () => {
  it('should call createDraftNote with project/iid/body', async () => {
    mockFetchResponse({ body: { id: 77 } });

    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--create',
      'hello draft',
    ]);

    // #region START_CREATE_DRAFT_ASSERT
    assert.strictEqual(exitCodes[0], 0);

    const joined = stdoutLines.join('');
    assert.match(joined, /Черновик #77 создан/);
    // #endregion END_CREATE_DRAFT_ASSERT
  });
});

// ── BDD: vcs-draft-note --update ──────────────────────────────────────────────

describe('vcs-draft-note --update', () => {
  it('should call updateDraftNote with project/iid/draftNoteId/body', async () => {
    mockFetchResponse({ body: { id: 55 } });

    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--update',
      '55',
      '--body',
      'updated body',
    ]);

    // #region START_UPDATE_DRAFT_ASSERT
    assert.strictEqual(exitCodes[0], 0);

    const joined = stdoutLines.join('');
    assert.match(joined, /Черновик #55 обновлён/);
    // #endregion END_UPDATE_DRAFT_ASSERT
  });

  it('should reject --update without --body', async () => {
    await runDraft(['node', 'gennady', 'vcs-draft-note', '--project=g/p', '--iid=42', '--update', '55']);

    assert.strictEqual(exitCodes[0], 1);
    const joined = stderrLines.join('');
    assert.match(joined, /--update требует --body/);
  });
});

// ── BDD: vcs-draft-note --delete ──────────────────────────────────────────────

describe('vcs-draft-note --delete', () => {
  it('should call deleteDraftNote with project/iid/draftNoteId', async () => {
    mockFetchResponse({ status: 200 });

    await runDraft(['node', 'gennady', 'vcs-draft-note', '--project=g/p', '--iid=42', '--delete', '99']);

    assert.strictEqual(exitCodes[0], 0);
    const joined = stdoutLines.join('');
    assert.match(joined, /Черновик #99 удалён/);
  });
});

// ── BDD: vcs-draft-note --publish ─────────────────────────────────────────────

describe('vcs-draft-note --publish', () => {
  it('should call publishDraftNote with project/iid/draftNoteId', async () => {
    mockFetchResponse({ status: 200 });

    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--publish',
      '42',
    ]);

    assert.strictEqual(exitCodes[0], 0);
    const joined = stdoutLines.join('');
    assert.match(joined, /Черновик #42 опубликован/);
  });
});

// ── BDD: dry-run ─────────────────────────────────────────────────────────

describe('vcs-draft-note dry-run', () => {
  it('should print dry-run intent and skip API call for --list', async () => {
    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--list',
      '--dry-run',
    ]);

    const joined = stdoutLines.join('');
    assert.match(joined, /\[DRY-RUN\]/);
    assert.match(joined, /list/);
  });

  it('should print dry-run intent for --create', async () => {
    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--create',
      'text',
      '--dry-run',
    ]);

    const joined = stdoutLines.join('');
    assert.match(joined, /\[DRY-RUN\].*create/);
  });

  it('should print dry-run intent for --update', async () => {
    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--update',
      '55',
      '--body',
      'text',
      '--dry-run',
    ]);

    const joined = stdoutLines.join('');
    assert.match(joined, /\[DRY-RUN\].*update #55/);
  });
});

// ── Validation: no action / multiple actions ─────────────────────────────

describe('vcs-draft-note validation', () => {
  it('should reject when no action flag is given', async () => {
    await runDraft(['node', 'gennady', 'vcs-draft-note', '--project=g/p', '--iid=42']);

    assert.strictEqual(exitCodes[0], 1);
    const joined = stderrLines.join('');
    assert.match(joined, /укажите одно действие/);
  });

  it('should reject when multiple action flags are given', async () => {
    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--list',
      '--create',
      'x',
    ]);

    assert.strictEqual(exitCodes[0], 1);
    const joined = stderrLines.join('');
    assert.match(joined, /можно указать только одно действие/);
  });

  it('should reject when iid cannot be resolved', async () => {
    const resolveNoIid = mock.fn(
      async (): Promise<VcsCliContext> => ({
        provider: 'gitlab',
        host: 'gitlab.example.com',
        project: 'g/p',
        token: 'glpat-mock',
      })
    );

    await runDraft(['node', 'gennady', 'vcs-draft-note', '--project=g/p', '--list'], {
      resolveVcsContext: resolveNoIid,
    });

    assert.strictEqual(exitCodes[0], 1);
    const joined = stderrLines.join('');
    assert.match(joined, /не удалось определить MR iid/);
  });
});

// ── API error propagation ────────────────────────────────────────────────

describe('vcs-draft-note API errors', () => {
  it('should propagate createDraftNote error to stderr and exit 1', async () => {
    mockFetchResponse({ status: 403, body: 'Forbidden' });

    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--create',
      'bad',
    ]);

    assert.strictEqual(exitCodes[0], 1);
    const joined = stderrLines.join('');
    assert.match(joined, /403/);
  });

  it('should propagate deleteDraftNote error to stderr and exit 1', async () => {
    mockFetchResponse({ status: 404, body: 'Not Found' });

    await runDraft([
      'node',
      'gennady',
      'vcs-draft-note',
      '--project=g/p',
      '--iid=42',
      '--delete',
      '999',
    ]);

    assert.strictEqual(exitCodes[0], 1);
    const joined = stderrLines.join('');
    assert.match(joined, /404/);
  });
});
