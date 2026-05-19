// @file: Unit tests for VcsGithubRepositoryFiles.getFileContent.
// @consumers: node:test runner
// @tasks: TSK-30

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('VcsGithubRepositoryFiles — getFileContent', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('decodes base64 to utf-8', async () => {
    globalThis.fetch = mock.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: 'aW1wb3J0IGZyb20gIi4vYmFyIjsK',
            encoding: 'base64',
            path: 'src/foo.ts',
            type: 'file',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    ) as unknown as typeof fetch;

    const { VcsGithubRepositoryFiles } =
      await import('../../github/vcs-github-repository-files.ts');
    const repo = new VcsGithubRepositoryFiles('https://api.github.com', 'token');
    const result = await repo.getFileContent({
      repository: 'owner/repo',
      path: 'src/foo.ts',
      ref: 'main',
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.path, 'src/foo.ts');
    assert.strictEqual(result!.content, 'import from "./bar";\n');
    assert.strictEqual(result!.encoding, 'utf-8');
  });

  it('returns null for 404', async () => {
    globalThis.fetch = mock.fn(
      async () => new Response('', { status: 404 })
    ) as unknown as typeof fetch;

    const { VcsGithubRepositoryFiles } =
      await import('../../github/vcs-github-repository-files.ts?nocache=1');
    const repo = new VcsGithubRepositoryFiles('https://api.github.com', 'token');
    const result = await repo.getFileContent({
      repository: 'o/r',
      path: 'nonexistent.ts',
      ref: 'main',
    });

    assert.strictEqual(result, null);
  });

  it('handles binary file (base64 with null bytes)', async () => {
    globalThis.fetch = mock.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: Buffer.from('\x89PNG\r\n\x1a\n\x00\x00\x00').toString('base64'),
            encoding: 'base64',
            type: 'file',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    ) as unknown as typeof fetch;

    const { VcsGithubRepositoryFiles } =
      await import('../../github/vcs-github-repository-files.ts?nocache=2');
    const repo = new VcsGithubRepositoryFiles('https://api.github.com', 'token');
    const result = await repo.getFileContent({
      repository: 'o/r',
      path: 'img.png',
      ref: 'main',
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.encoding, 'base64');
  });

  it('handles symlink type', async () => {
    globalThis.fetch = mock.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'symlink',
            target: '../common/utils.ts',
            encoding: 'none',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    ) as unknown as typeof fetch;

    const { VcsGithubRepositoryFiles } =
      await import('../../github/vcs-github-repository-files.ts?nocache=3');
    const repo = new VcsGithubRepositoryFiles('https://api.github.com', 'token');
    const result = await repo.getFileContent({
      repository: 'o/r',
      path: 'src/symlink.ts',
      ref: 'main',
    });

    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.content, '../common/utils.ts');
  });

  it('throws on 401', async () => {
    globalThis.fetch = mock.fn(
      async () => new Response('Unauthorized', { status: 401 })
    ) as unknown as typeof fetch;

    const { VcsGithubRepositoryFiles } =
      await import('../../github/vcs-github-repository-files.ts?nocache=4');
    const repo = new VcsGithubRepositoryFiles('https://api.github.com', 'token');

    await assert.rejects(
      () => repo.getFileContent({ repository: 'o/r', path: 'f.ts', ref: 'main' }),
      /GitHub request failed/
    );
  });

  it('throws on network error', async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error('network error');
    }) as unknown as typeof fetch;

    const { VcsGithubRepositoryFiles } =
      await import('../../github/vcs-github-repository-files.ts?nocache=5');
    const repo = new VcsGithubRepositoryFiles('https://api.github.com', 'token');

    await assert.rejects(
      () => repo.getFileContent({ repository: 'o/r', path: 'f.ts', ref: 'main' }),
      /network error/
    );
  });
});
