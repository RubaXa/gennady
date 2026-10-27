// @file: Real Git evidence for CLI edits and worker commits omitted by SDK snapshots.
// @spec: AI-SKILLS
// @consumers: SddEvalOpenCodeEvidenceSource.readDiff

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const FILE = 'specs/demo/core/core.spec.md';
const INITIAL =
  '<!--SECTION:MODULE_VISION-->\nCore.\n<!--/SECTION:MODULE_VISION-->\n<!--SECTION:MODULE_DECISION_LOG-->\nCOR-DL-1 retry policy [verdict: pending-operator]\n<!--/SECTION:MODULE_DECISION_LOG-->\n';
function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sdd-evidence-git-'));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Evidence Test');
  git(root, 'config', 'user.email', 'evidence@example.test');
  mkdirSync(dirname(join(root, FILE)), { recursive: true });
  writeFileSync(join(root, FILE), INITIAL);
  git(root, 'add', '--all');
  git(root, 'commit', '--quiet', '-m', 'chore: initialize eval fixture');
  return root;
}
function evidence(root: string) {
  return new SddEvalOpenCodeEvidenceSource({
    directory: root,
    client: { session: { diff: async () => ({ data: [] }) } } as never,
  });
}

it('shows actual sdd-log CLI mutations even with empty SDK diff and after worker commits', async () => {
  const root = fixture();
  try {
    const source = evidence(root);
    assert.equal(await source.readDiff('worker'), '', 'unchanged fixture is genuinely empty');
    execFileSync(
      process.execPath,
      [
        '--import',
        join(ROOT, 'node_modules/tsx/dist/loader.mjs'),
        join(ROOT, 'cli/gennady.ts'),
        'sdd-log',
        FILE,
        'deviation-verdict',
        'COR-DL-1',
        'accepted',
      ],
      { cwd: root, env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' } }
    );
    const dirty = await source.readDiff('worker');
    assert.match(dirty, /COR-DL-1.*pending-operator/);
    assert.match(dirty, /COR-DL-1.*accepted/);
    assert.match(dirty, /core\.spec\.md/);
    assert.equal(
      readFileSync(join(root, FILE), 'utf8'),
      INITIAL.replace('pending-operator', 'accepted')
    );
    git(root, 'add', '--all');
    git(root, 'commit', '--quiet', '-m', 'worker commits actual change');
    assert.equal(
      await source.readDiff('worker'),
      dirty,
      'baseline is provisioning, never current HEAD'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('never executes external diff, textconv, clean/process filters or fsmonitor commands', async () => {
  const root = fixture();
  try {
    const marker = join(root, 'UNSAFE_RAN');
    const script = join(root, 'unsafe.sh');
    writeFileSync(script, '#!/bin/sh\nprintf unsafe > "' + marker + '"\nexit 0\n');
    chmodSync(script, 0o755);
    writeFileSync(join(root, '.gitattributes'), '*.md diff=unsafe filter=unsafe\n');
    for (const key of [
      'diff.external',
      'diff.unsafe.command',
      'diff.unsafe.textconv',
      'filter.unsafe.clean',
      'filter.unsafe.process',
      'core.fsmonitor',
    ])
      git(root, 'config', key, script);
    git(root, 'config', 'filter.unsafe.required', 'true');
    writeFileSync(join(root, FILE), INITIAL.replace('pending-operator', 'accepted'));
    const diff = await evidence(root).readDiff('worker');
    assert.match(diff, /COR-DL-1.*accepted/);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('retains untracked Write artifacts and marks bounded diff truncation explicitly', async () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'authored.spec.md'), '# Actual Write artifact\n');
    assert.match(await evidence(root).readDiff('worker'), /Actual Write artifact/);
    writeFileSync(join(root, FILE), 'changed\n'.repeat(8000));
    const diff = await evidence(root).readDiff('worker');
    assert.ok(diff.length < 25000);
    assert.match(diff, /truncated/);
    writeFileSync(join(root, FILE), 'changed\n'.repeat(100000));
    await assert.rejects(evidence(root).readDiff('worker'), /bounded|Git diff evidence/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('rejects identified fixture history corruption without returning a misleading empty diff', async () => {
  const root = fixture();
  try {
    writeFileSync(join(root, '.git/info/grafts'), git(root, 'rev-parse', 'HEAD') + '\n');
    await assert.rejects(evidence(root).readDiff('worker'), /ancestry|graft|Git diff evidence/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('preserves SDK evidence for existing non-fixture directory contracts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-evidence-custom-'));
  try {
    const source = new SddEvalOpenCodeEvidenceSource({
      directory: root,
      client: {
        session: {
          diff: async () => ({
            data: [
              { file: 'custom.md', before: 'before', after: 'after', additions: 1, deletions: 1 },
            ],
          }),
        },
      } as never,
    });
    assert.match(await source.readDiff('custom'), /FILE custom\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('does not fall back to false-empty SDK evidence after a proven fixture repository disappears', async () => {
  const root = fixture();
  try {
    const source = evidence(root);
    assert.equal(await source.readDiff('worker'), '');
    renameSync(join(root, '.git'), join(root, 'lost-git'));
    await assert.rejects(source.readDiff('worker'), /lost its bound fixture repository/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('does not follow untracked symlinks or inherited Git repository redirection', async () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'sdd-evidence-outside-'));
  const previous = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
  try {
    const secret = join(outside, 'secret.txt');
    writeFileSync(secret, 'outside-content-must-not-be-read');
    symlinkSync(secret, join(root, 'alias.md'));
    writeFileSync(join(root, FILE), INITIAL.replace('pending-operator', 'accepted'));
    process.env.GIT_DIR = join(outside, '.git');
    process.env.GIT_WORK_TREE = outside;
    const diff = await evidence(root).readDiff('worker');
    assert.match(diff, /COR-DL-1.*accepted/);
    assert.match(diff, /untracked symlink/);
    assert.doesNotMatch(diff, /outside-content-must-not-be-read/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
