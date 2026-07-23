// @file: Unit tests for mr-stats mr-resolver — parseMrUrl, retrieveMrMetadata, listChangedFiles, diffNumstat, removeWorktree.
// @consumers: node:test runner
// @tasks: TSK-139

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseMrUrl, retrieveMrMetadata, listChangedFiles, diffNumstat } from '../mr-resolver.ts';

describe('mr-resolver — parseMrUrl', () => {
  it('parseVcsUrl rejects non-GitLab URL — GitHub PR returns null', () => {
    // contract: BDD scenario "Некорректный URL" — GitHub URL not GitLab
    const result = parseMrUrl('https://github.com/foo/bar/pull/1');
    assert.strictEqual(result, null);
  });

  it('parseVcsUrl rejects non-GitLab URL — empty string returns null', () => {
    const result = parseMrUrl('');
    assert.strictEqual(result, null);
  });

  it('parseVcsUrl rejects non-GitLab URL — non-VCS URL returns null', () => {
    const result = parseMrUrl('https://example.com/page');
    assert.strictEqual(result, null);
  });

  it('parses valid GitLab MR URL', () => {
    // contract: GitLab MR URL parses to VcsUrl with provider=gitlab
    const result = parseMrUrl('https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/14');
    assert.ok(result !== null);
    assert.strictEqual(result.provider, 'gitlab');
    assert.strictEqual(result.repository, 'mail/messenger');
    assert.strictEqual(result.iid, 14);
  });

  it('parses self-hosted GitLab MR URL', () => {
    const result = parseMrUrl('https://gitlab.example.com/team/repo/-/merge_requests/7');
    assert.ok(result !== null);
    assert.strictEqual(result.provider, 'gitlab');
    assert.strictEqual(result.host, 'gitlab.example.com');
    assert.strictEqual(result.repository, 'team/repo');
    assert.strictEqual(result.iid, 7);
  });
});

describe('mr-resolver — retrieveMrMetadata', () => {
  it('metadata contains all fields', async () => {
    // contract: BDD scenario "MrMetadata — все поля заполнены"
    const mockClient = {
      MergeRequests: {
        getByIid: async () => ({
          iid: 14,
          title: 'Test MR Title',
          source_branch: 'feature/test',
          target_branch: 'master',
          merged_at: '2026-01-01T00:00:00Z',
          author: { username: 'testuser' },
        }),
      },
    } as Parameters<typeof retrieveMrMetadata>[0];

    const metadata = await retrieveMrMetadata(mockClient, 'mail/messenger', 14);

    assert.ok(metadata !== null);
    assert.strictEqual(metadata.iid, '!14');
    assert.strictEqual(metadata.title, 'Test MR Title');
    assert.strictEqual(metadata.project, 'mail/messenger');
    assert.strictEqual(metadata.sourceBranch, 'feature/test');
    assert.strictEqual(metadata.targetBranch, 'master');
    assert.strictEqual(metadata.mergedAt, '2026-01-01T00:00:00Z');
    assert.strictEqual(metadata.author, 'testuser');
  });

  it('getByIid throws for deleted branch — returns null', async () => {
    // contract: BDD scenario "MR не найден — ветка удалена"
    // failure mode: null should propagate to exit code 5 in pipeline
    const mockClient = {
      MergeRequests: {
        getByIid: async () => null,
      },
    } as Parameters<typeof retrieveMrMetadata>[0];

    const metadata = await retrieveMrMetadata(mockClient, 'mail/messenger', 99999);

    assert.strictEqual(metadata, null);
  });

  it('handles minimal API response with default values', async () => {
    // contract: missing optional fields → empty string defaults
    const mockClient = {
      MergeRequests: {
        getByIid: async () => ({
          iid: 1,
        }),
      },
    } as Parameters<typeof retrieveMrMetadata>[0];

    const metadata = await retrieveMrMetadata(mockClient, 'test/proj', 1);

    assert.ok(metadata !== null);
    assert.strictEqual(metadata.iid, '!1');
    assert.strictEqual(metadata.title, '');
    assert.strictEqual(metadata.project, 'test/proj');
    assert.strictEqual(metadata.sourceBranch, '');
    assert.strictEqual(metadata.targetBranch, '');
    assert.strictEqual(metadata.mergedAt, '');
    assert.strictEqual(metadata.author, '');
  });
});

describe('mr-resolver — listChangedFiles', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'mr-resolver-test-'));
    execFileSync('git', ['init', '-b', 'main', repoDir], { stdio: 'ignore' });
    execFileSync('git', ['-C', repoDir, 'config', 'user.email', 'test@test.com'], {
      stdio: 'ignore',
    });
    execFileSync('git', ['-C', repoDir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
  });

  afterEach(() => {
    if (existsSync(repoDir)) rmSync(repoDir, { recursive: true });
  });

  it('lists changed files between two commits', () => {
    writeFileSync(join(repoDir, 'a.ts'), '// base', 'utf8');
    execFileSync('git', ['-C', repoDir, 'add', 'a.ts'], { stdio: 'ignore' });
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'first'], { stdio: 'ignore' });
    const baseSha = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    writeFileSync(join(repoDir, 'b.ts'), '// new', 'utf8');
    writeFileSync(join(repoDir, 'a.ts'), '// modified', 'utf8');
    execFileSync('git', ['-C', repoDir, 'add', 'a.ts', 'b.ts'], { stdio: 'ignore' });
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'second'], { stdio: 'ignore' });
    const headSha = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    const files = listChangedFiles(repoDir, baseSha, headSha);

    assert.strictEqual(files.length, 2);
    assert.ok(files.includes('a.ts'));
    assert.ok(files.includes('b.ts'));
  });

  it('returns empty array when no changes between commits', () => {
    writeFileSync(join(repoDir, 'a.ts'), '// same', 'utf8');
    execFileSync('git', ['-C', repoDir, 'add', 'a.ts'], { stdio: 'ignore' });
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'first'], { stdio: 'ignore' });
    const sha = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    const files = listChangedFiles(repoDir, sha, sha);

    assert.strictEqual(files.length, 0);
  });
});

describe('mr-resolver — diffNumstat', () => {
  let repoDir: string;
  let baseSha: string;
  let headSha: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'numstat-test-'));
    execFileSync('git', ['init', '-b', 'main', repoDir], { stdio: 'ignore' });
    execFileSync('git', ['-C', repoDir, 'config', 'user.email', 'test@test.com'], {
      stdio: 'ignore',
    });
    execFileSync('git', ['-C', repoDir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });

    writeFileSync(join(repoDir, 'a.ts'), 'line1\nline2\n', 'utf8');
    execFileSync('git', ['-C', repoDir, 'add', 'a.ts'], { stdio: 'ignore' });
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'first'], { stdio: 'ignore' });
    baseSha = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    writeFileSync(join(repoDir, 'a.ts'), 'line1\nline2\nline3\nline4\n', 'utf8');
    writeFileSync(join(repoDir, 'b.ts'), '// new file\n', 'utf8');
    execFileSync('git', ['-C', repoDir, 'add', 'a.ts', 'b.ts'], { stdio: 'ignore' });
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'second'], { stdio: 'ignore' });
    headSha = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  });

  afterEach(() => {
    if (existsSync(repoDir)) rmSync(repoDir, { recursive: true });
  });

  it('returns per-file added/removed counts from numstat', () => {
    const result = diffNumstat(repoDir, baseSha, headSha, ['a.ts', 'b.ts']);

    assert.strictEqual(result.length, 2);

    const aFile = result.find((e) => e.file === 'a.ts');
    const bFile = result.find((e) => e.file === 'b.ts');

    assert.ok(aFile, 'a.ts should be in output');
    assert.ok(bFile, 'b.ts should be in output');
    assert.strictEqual(bFile.added, 1);
  });

  it('returns empty array for empty file list', () => {
    const result = diffNumstat(repoDir, baseSha, headSha, []);

    assert.strictEqual(result.length, 0);
  });

  it('filters to specified files only', () => {
    const result = diffNumstat(repoDir, baseSha, headSha, ['a.ts']);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].file, 'a.ts');
  });
});
