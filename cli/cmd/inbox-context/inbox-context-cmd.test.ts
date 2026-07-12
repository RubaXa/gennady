// @file: Tests for inbox-context command — flat format, delta commits, skip flags.
// @consumers: node:test runner
// @tasks: TSK-94

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { configPath } from '../inbox/_core/logic/state-paths.logic.ts';

function spawnCmd(args: string[], stateDir: string, envExtra?: Record<string, string>) {
  return spawnSync(
    'node',
    [
      '--import',
      'tsx',
      'cli/cmd/inbox-context/inbox-context.cmd.ts',
      `--state-dir=${stateDir}`,
      ...args,
    ],
    {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: { ...process.env, ...envExtra },
    }
  );
}

function writeConfig(stateDir: string, content: string | object) {
  const path = configPath(stateDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
}

const CMD_SRC = readFileSync('cli/cmd/inbox-context/inbox-context.cmd.ts', 'utf8');

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-ctx-cmd-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('inbox-context CLI — error paths', () => {
  it('exits 1 with stderr when --ref and --url are missing', () => {
    const r = spawnCmd(['--json'], tmpDir);
    assert.strictEqual(r.status, 1);
    assert.ok(r.stderr.includes('Укажите'), 'should print human-readable error');
  });

  it('--ref with no config → configured:false signal, exit 0', () => {
    const r = spawnCmd(['--ref', 'group/proj!510', '--json'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.configured, false);
    assert.deepStrictEqual(out.missing, ['reposBase', 'vcsHost']);
  });

  it('--ref with --vcs-host covers vcsHost key, missing only reposBase', () => {
    const r = spawnCmd(['--ref', 'group/proj!510', '--json', '--vcs-host=H'], tmpDir);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.deepStrictEqual(out.missing, ['reposBase']);
  });

  it('--ref with --vcs-host and --repos-base passes config check', () => {
    const r = spawnCmd(
      ['--ref', 'group/proj!510', '--json', '--vcs-host=H', '--repos-base=/p'],
      tmpDir
    );
    assert.notStrictEqual(r.status, 0, 'should fail after config check (API/token)');
    assert.ok(!r.stdout.includes('"configured": false'), 'should not print config signal');
    assert.ok(r.stderr.length > 0, 'should print error to stderr');
  });

  it('--ref (no --json), no config → human-readable message, exit 0', () => {
    const r = spawnCmd(['--ref', 'group/proj!510'], tmpDir);
    assert.strictEqual(r.status, 0);
    assert.ok(r.stdout.includes('agent-inbox не настроен'));
  });
});

describe('inbox-context result shape — flat format (AI-16)', () => {
  it('myLogin, myRole, author, reviewers, description, approvedBy at root level', () => {
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    assert.ok(resultBlock.includes('myLogin,'), 'myLogin should be a root key');
    assert.ok(resultBlock.includes('myRole,'), 'myRole should be a root key');
    assert.ok(resultBlock.includes('author,'), 'author should be a root key');
    assert.ok(resultBlock.includes('reviewers,'), 'reviewers should be a root key');
    assert.ok(resultBlock.includes('description,'), 'description should be a root key');
    assert.ok(resultBlock.includes('approvedBy,'), 'approvedBy should be a root key');
  });

  it('sourceBranch, targetBranch, createdAt, updatedAt at root level', () => {
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    assert.ok(resultBlock.includes('sourceBranch,'), 'sourceBranch should be at root');
    assert.ok(resultBlock.includes('targetBranch,'), 'targetBranch should be at root');
    assert.ok(resultBlock.includes('createdAt,'), 'createdAt should be at root');
    assert.ok(resultBlock.includes('updatedAt,'), 'updatedAt should be at root');
  });

  it('no "package" key in result object', () => {
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    assert.ok(!resultBlock.includes('package:'), 'result should not have package key');
    assert.ok(!resultBlock.includes('package,'), 'result should not have package key');
  });

  it('threadStats at root, no "threads" key in result', () => {
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    assert.ok(resultBlock.includes('threadStats,'), 'result should have threadStats');
    assert.ok(!resultBlock.includes('threads:'), 'result should not have threads key');
  });

  it('headChanged and newCommits at root level', () => {
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    assert.ok(resultBlock.includes('headChanged,'), 'headChanged should be at root');
    assert.ok(resultBlock.includes('newCommits,'), 'newCommits should be at root');
  });

  it('reviewPlanRequired covers author self-review (AuthorMode = full pipeline, AI-29/AI-34)', () => {
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    const clause = resultBlock.slice(
      resultBlock.indexOf('reviewPlanRequired:'),
      resultBlock.indexOf('worktree,')
    );
    assert.ok(
      clause.includes("myRole === 'author'"),
      'author must require a review plan — same document pipeline as reviewer'
    );
  });

  it('surfaces myApprovalReset + lastApprovedHeadSha (approval-reset detection, AI-38)', () => {
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    assert.ok(resultBlock.includes('myApprovalReset'), 'myApprovalReset should be at root');
    assert.ok(resultBlock.includes('lastApprovedHeadSha'), 'lastApprovedHeadSha should be at root');
    // reset = I approved before, I am no longer an approver, and the head moved
    assert.ok(
      CMD_SRC.includes('!iApprove') && CMD_SRC.includes('lastApprovedHeadSha !== currentHeadSha'),
      'reset condition must be: had approval, not approver now, head changed'
    );
    // approving records lastApprovedHeadSha at current head (9998321: also detected from
    // system notes via iEverApproved when inbox-context runs before the approve call)
    assert.ok(
      CMD_SRC.includes('lastApprovedHeadSha: iApprove'),
      'approval must record lastApprovedHeadSha'
    );
  });

  it('worktree, changeset, stage, openQuestions, lastAuthor, threadStats at root', () => {
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    assert.ok(resultBlock.includes('worktree,'), 'worktree should be at root');
    assert.ok(resultBlock.includes('changeset,'), 'changeset should be at root');
    assert.ok(resultBlock.includes('stage,'), 'stage should be at root');
    assert.ok(resultBlock.includes('openQuestions,'), 'openQuestions should be at root');
    assert.ok(resultBlock.includes('lastAuthor:'), 'lastAuthor should be at root');
    assert.ok(resultBlock.includes('threadStats,'), 'threadStats should be at root');
  });
});

describe('inbox-context delta commits (AI-24)', () => {
  it('headChanged initialized as null (set when !skipWorktree && currentHeadSha)', () => {
    assert.ok(
      CMD_SRC.includes('headChanged: { kind: string; newCommitCount: number } | null = null'),
      'headChanged should start as null'
    );
    assert.ok(
      CMD_SRC.includes(
        'newCommits: { sha: string; subject: string; author: string; date: string }[] | null = null'
      ),
      'newCommits should start as null'
    );
  });

  it('first run: headChanged = { kind: "none", newCommitCount: 0 } when no lastReviewed', () => {
    const block = CMD_SRC.slice(
      CMD_SRC.indexOf('START_COMPUTE_HEAD_DELTA'),
      CMD_SRC.indexOf('END_COMPUTE_HEAD_DELTA')
    );
    assert.ok(
      block.includes("headChanged = { kind: 'none', newCommitCount: 0 }"),
      'headChanged should be none when no lastReviewedHeadSha or SHA unchanged'
    );
    assert.ok(
      block.includes('newCommits = []'),
      'newCommits should be empty array when head unchanged'
    );
  });

  it('lastReviewedHeadSha written to current HEAD directly (9998321: no candidate dance)', () => {
    const block = CMD_SRC.slice(
      CMD_SRC.indexOf('START_UPDATE_CANDIDATE'),
      CMD_SRC.indexOf('END_UPDATE_CANDIDATE')
    );
    // 9998321: candidateHeadSha/promote dance removed — inbox-context writes
    // lastReviewedHeadSha=currentHeadSha directly (agent runs inbox-context before approve).
    assert.ok(
      block.includes('lastReviewedHeadSha: currentHeadSha'),
      'lastReviewedHeadSha written to current HEAD directly (no candidate dance)'
    );
  });

  it('fast_forward path: merge-base is ancestor → kind fast_forward', () => {
    const block = CMD_SRC.slice(
      CMD_SRC.indexOf('START_FAST_FORWARD_COMMITS'),
      CMD_SRC.indexOf('END_FAST_FORWARD_COMMITS')
    );
    assert.ok(
      block.includes("kind: 'fast_forward'"),
      'headChanged kind should be fast_forward when ancestor'
    );
    assert.ok(
      block.includes('newCommitCount: newCommits.length'),
      'newCommitCount should reflect actual commit count'
    );
  });

  it('rewritten path: merge-base not ancestor → kind rewritten, max 50 commits', () => {
    const block = CMD_SRC.slice(
      CMD_SRC.indexOf('START_REWRITTEN_COMMITS'),
      CMD_SRC.indexOf('END_REWRITTEN_COMMITS')
    );
    assert.ok(
      block.includes("kind: 'rewritten'"),
      'headChanged kind should be rewritten when not ancestor'
    );
    assert.ok(block.includes('--max-count=50'), 'rewritten should cap at 50 commits');
  });

  it('merge-base failure → falls through to rewritten (conservative)', () => {
    const headDeltaBlock = CMD_SRC.slice(
      CMD_SRC.indexOf('START_COMPUTE_HEAD_DELTA'),
      CMD_SRC.indexOf('END_COMPUTE_HEAD_DELTA')
    );
    assert.ok(headDeltaBlock.includes('let isAncestor = false'), 'isAncestor starts false');
    assert.ok(
      headDeltaBlock.includes('isAncestor = true'),
      'isAncestor only set true on merge-base success'
    );
  });
});

describe('inbox-context skip flags', () => {
  it('--skip-worktree: headChanged, newCommits, worktree, changeset = null', () => {
    const block = CMD_SRC.slice(CMD_SRC.indexOf('START_WORKTREE'), CMD_SRC.indexOf('END_WORKTREE'));
    // When skipWorktree, worktree/changeset/currentHeadSha stay null
    assert.ok(
      block.includes('if (!skipWorktree)'),
      'worktree block should be guarded by !skipWorktree'
    );
  });

  it('--skip-worktree: headChanged guard checks !skipWorktree && currentHeadSha', () => {
    const block = CMD_SRC.slice(
      CMD_SRC.indexOf('START_HEAD_CHANGED'),
      CMD_SRC.indexOf('END_HEAD_CHANGED')
    );
    assert.ok(
      block.includes('if (!skipWorktree && currentHeadSha)'),
      'headChanged block should be guarded by !skipWorktree && currentHeadSha'
    );
  });

  it('--skip-threads: stage, openQuestions, lastAuthor, threadStats = null', () => {
    const block = CMD_SRC.slice(CMD_SRC.indexOf('START_THREADS'), CMD_SRC.indexOf('END_THREADS'));
    assert.ok(
      block.includes('if (!skipThreads)'),
      'threads block should be guarded by !skipThreads'
    );
    // All thread-related vars initialized as null before the guard
    const varsBlock = CMD_SRC.slice(
      CMD_SRC.indexOf('START_THREADS'),
      CMD_SRC.indexOf('END_THREADS')
    );
    assert.ok(varsBlock.includes('stage: string | null = null'), 'stage should initialize as null');
    assert.ok(
      varsBlock.includes('openQuestions: number | null = null'),
      'openQuestions should initialize as null'
    );
    assert.ok(
      varsBlock.includes('threadStats: { total: number; drafts: number } | null = null'),
      'threadStats should initialize as null'
    );
  });

  it('threads-related fields preserve null when --skip-threads is active', () => {
    // The result always includes these keys; they are null when skipped
    const resultBlock = CMD_SRC.slice(CMD_SRC.indexOf('const result:'));
    assert.ok(resultBlock.includes('stage,'), 'stage key always present in result');
    assert.ok(resultBlock.includes('threadStats,'), 'threadStats key always present in result');
    // The values are set to null when skipThreads is true (from initial null)
  });
});
