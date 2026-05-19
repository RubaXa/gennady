// @file: Unit tests for VcsGitlabRepositoryFiles.getFileContent.
// @consumers: node:test runner
// @tasks: TSK-29

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('VcsGitlabRepositoryFiles — getFileContent', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns file content for text file', async () => {
    globalThis.fetch = mock.fn(
      async () =>
        new Response('import foo from "./bar";\n', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
    ) as unknown as typeof fetch;

    // Dynamic import to get fresh module with mocked fetch
    const { VcsGitlabRepositoryFiles } =
      await import('../../gitlab/vcs-gitlab-repository-files.ts');
    const repo = new VcsGitlabRepositoryFiles('https://gitlab.com/api/v4', 'token');
    const result = await repo.getFileContent({
      repository: 'group/proj',
      path: 'src/foo.ts',
      ref: 'main',
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.path, 'src/foo.ts');
    assert.strictEqual(result!.content, 'import foo from "./bar";\n');
    assert.strictEqual(result!.encoding, 'utf-8');
  });

  it('returns null for 404', async () => {
    globalThis.fetch = mock.fn(
      async () => new Response('', { status: 404 })
    ) as unknown as typeof fetch;

    const { VcsGitlabRepositoryFiles } = await import(
      '../../gitlab/vcs-gitlab-repository-files.ts?nocache=' + Math.random()
    );
    const repo = new VcsGitlabRepositoryFiles('https://gitlab.com/api/v4', 'token');
    const result = await repo.getFileContent({
      repository: 'g/p',
      path: 'nonexistent.ts',
      ref: 'main',
    });

    assert.strictEqual(result, null);
  });

  it('handles binary file (base64 encoding)', async () => {
    globalThis.fetch = mock.fn(
      async () =>
        new Response('\x89PNG\r\n\x1a\n', {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
    ) as unknown as typeof fetch;

    const { VcsGitlabRepositoryFiles } = await import(
      '../../gitlab/vcs-gitlab-repository-files.ts?nocache=' + Math.random()
    );
    const repo = new VcsGitlabRepositoryFiles('https://gitlab.com/api/v4', 'token');
    const result = await repo.getFileContent({
      repository: 'g/p',
      path: 'icon.png',
      ref: 'main',
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.encoding, 'base64');
  });

  it('throws on 401', async () => {
    globalThis.fetch = mock.fn(
      async () => new Response('Unauthorized', { status: 401 })
    ) as unknown as typeof fetch;

    const { VcsGitlabRepositoryFiles } = await import(
      '../../gitlab/vcs-gitlab-repository-files.ts?nocache=' + Math.random()
    );
    const repo = new VcsGitlabRepositoryFiles('https://gitlab.com/api/v4', 'token');

    await assert.rejects(
      () => repo.getFileContent({ repository: 'g/p', path: 'f.ts', ref: 'main' }),
      /GitLab request failed/
    );
  });

  it('throws on network error', async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error('network error');
    }) as unknown as typeof fetch;

    const { VcsGitlabRepositoryFiles } = await import(
      '../../gitlab/vcs-gitlab-repository-files.ts?nocache=' + Math.random()
    );
    const repo = new VcsGitlabRepositoryFiles('https://gitlab.com/api/v4', 'token');

    await assert.rejects(
      () => repo.getFileContent({ repository: 'g/p', path: 'f.ts', ref: 'main' }),
      /network error/
    );
  });
});
