// @file: Integration tests for YagniCommand#run — strict argv/root validation and fail-closed Git scope discovery.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type YagniModule = typeof import('../yagni.cmd.ts');

let mod: YagniModule;
let origExit: typeof process.exit;
let origArgv: string[];
let importExitCalls = 0;
let importLogCalls = 0;

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'yagni', ...rest];
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8' }).trim();
}

function initRepo(root: string, commit = false): void {
  git(root, 'init', '-q');
  if (!commit) return;
  writeFileSync(join(root, 'baseline.js'), 'export const baseline = 1;\n', 'utf-8');
  git(root, 'add', '.');
  git(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qm',
    'baseline'
  );
}

describe('YagniCommand — strict argv and Git scope', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    const origLog = console.log;
    process.exit = ((_code?: number) => {
      importExitCalls++;
      return undefined;
    }) as typeof process.exit;
    console.log = (..._args: unknown[]) => {
      importLogCalls++;
    };
    process.argv = ['node', 'gennady', 'yagni'];
    try {
      mod = await import('../yagni.cmd.ts');
    } finally {
      console.log = origLog;
    }
  });

  it('import is pure — it neither executes the repo scan nor prints/exits', () => {
    assert.strictEqual(importLogCalls, 0);
    assert.strictEqual(importExitCalls, 0);
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
  });

  it('rejects unknown flags, extra roots, boolean values, and repeats with exit 4 + usage', async () => {
    const invalid = [
      argv('--typo'),
      argv('.', 'extra'),
      argv('.', 'yagni'),
      argv('--help=true'),
      argv('--help', '--help'),
    ];
    for (const rawArgs of invalid) {
      const result = await mod.run(rawArgs);
      assert.strictEqual(result.exitCode, 4, `${rawArgs.join(' ')}\n${result.text}`);
      assert.match(result.text, /ERR_CLI_YAGNI_BAD_INVOCATION/);
      assert.match(result.text, /usage: gennady yagni \[root\]/);
    }
  });

  it('rejects a missing root, a file root, and a non-git directory with teaching diagnostics', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-invalid-root-'));
    try {
      const missing = await mod.run(argv(join(dir, 'missing')));
      assert.strictEqual(missing.exitCode, 2);
      assert.match(missing.text, /ERR_CLI_YAGNI_BAD_ROOT/);

      const file = join(dir, 'root.txt');
      writeFileSync(file, 'not a directory', 'utf-8');
      const fileRoot = await mod.run(argv(file));
      assert.strictEqual(fileRoot.exitCode, 2);
      assert.match(fileRoot.text, /root is not a directory/);

      const nonGit = await mod.run(argv(dir));
      assert.strictEqual(nonGit.exitCode, 2);
      assert.match(nonGit.text, /ERR_CLI_YAGNI_GIT_SCOPE_UNAVAILABLE/);
      assert.match(nonGit.text, /initialize Git/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a valid empty repository uses the empty-tree baseline and analyzes its untracked sources', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-empty-tree-'));
    const prevCwd = process.cwd();
    try {
      initRepo(dir);
      mkdirSync(join(dir, 'src'));
      writeFileSync(join(dir, 'src', 'orphan.js'), 'export function orphan() {}\n', 'utf-8');
      process.chdir(dir);
      const result = await mod.run(argv());
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /ERR_CLI_YAGNI_UNDERUSED/);
      assert.match(result.text, /`orphan`/);
      assert.match(result.text, /1 changed file\(s\)/);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an empty repository analyzes untracked Go and Python through the shared source policy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-empty-polyglot-'));
    try {
      initRepo(dir);
      writeFileSync(join(dir, 'orphan.go'), 'package main\nfunc orphanGo() {}\n', 'utf-8');
      writeFileSync(join(dir, 'orphan.py'), 'def orphan_python():\n    pass\n', 'utf-8');
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /`orphanGo`/);
      assert.match(result.text, /`orphan_python`/);
      assert.match(result.text, /2 changed file\(s\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Go exported visibility is adapter-owned: a public one-use symbol remains a finding', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-go-public-'));
    try {
      initRepo(dir);
      writeFileSync(
        join(dir, 'main.go'),
        'package main\nfunc PublicThing() {}\nfunc main() { PublicThing() }\n',
        'utf-8'
      );
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /ERR_CLI_YAGNI_UNDERUSED/);
      assert.match(result.text, /`PublicThing`.*1 usage/s);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a fallback language reports unknown one-use visibility instead of false clean/YAGNI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-unknown-visibility-'));
    try {
      initRepo(dir);
      writeFileSync(
        join(dir, 'Service.java'),
        'class Service {}\nclass Main { Service service; }\n',
        'utf-8'
      );
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 1, result.text);
      assert.match(result.text, /ERR_CLI_YAGNI_VISIBILITY_UNKNOWN/);
      assert.match(result.text, /No YAGNI accusation was made/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unreadable production corpus file is an environment error, never underuse', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-unreadable-corpus-'));
    const locked = join(dir, 'src', 'locked.js');
    try {
      initRepo(dir);
      mkdirSync(join(dir, 'src'));
      writeFileSync(locked, 'export function baseline() {}\n', 'utf-8');
      git(dir, 'add', '.');
      git(
        dir,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-qm',
        'baseline'
      );
      writeFileSync(join(dir, 'src', 'candidate.ts'), 'export function candidate() {}\n', 'utf-8');
      git(dir, 'config', 'core.filemode', 'false');
      git(dir, 'update-index', '--assume-unchanged', 'src/locked.js');
      chmodSync(locked, 0);
      try {
        readFileSync(locked, 'utf-8');
        t.skip('filesystem/user ignores chmod read restrictions');
        return;
      } catch {}
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 2, result.text);
      assert.match(result.text, /ERR_CLI_YAGNI_CORPUS_UNREADABLE/);
      assert.match(result.text, /locked\.js/);
      assert.doesNotMatch(result.text, /ERR_CLI_YAGNI_UNDERUSED/);
    } finally {
      try {
        chmodSync(locked, 0o600);
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unreadable spec is an environment error, never no-waiver evidence', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-unreadable-spec-'));
    const locked = join(dir, 'specs', 'locked.md');
    try {
      initRepo(dir);
      mkdirSync(join(dir, 'src'));
      mkdirSync(join(dir, 'specs'));
      writeFileSync(join(dir, 'src', 'candidate.ts'), 'export function candidate() {}\n', 'utf-8');
      writeFileSync(locked, '### `candidate`\n- **Usage Waiver:** valid if readable\n', 'utf-8');
      chmodSync(locked, 0);
      try {
        readFileSync(locked, 'utf-8');
        t.skip('filesystem/user ignores chmod read restrictions');
        return;
      } catch {}
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 2, result.text);
      assert.match(result.text, /ERR_CLI_YAGNI_CORPUS_UNREADABLE/);
      assert.match(result.text, /locked\.md/);
      assert.doesNotMatch(result.text, /ERR_CLI_YAGNI_UNDERUSED/);
    } finally {
      try {
        chmodSync(locked, 0o600);
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a deleted changed source is a valid empty current-symbol set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-deleted-source-'));
    try {
      initRepo(dir);
      writeFileSync(join(dir, 'gone.py'), 'def gone():\n    pass\n', 'utf-8');
      git(dir, 'add', '.');
      git(
        dir,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-qm',
        'baseline'
      );
      rmSync(join(dir, 'gone.py'));
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 0, result.text);
      assert.match(result.text, /1 changed file\(s\) scanned/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unreadable existing changed source fails closed instead of looking deleted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-unreadable-source-'));
    const file = join(dir, 'locked.py');
    try {
      initRepo(dir);
      writeFileSync(file, 'def locked():\n    pass\n', 'utf-8');
      chmodSync(file, 0);
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 2, result.text);
      assert.match(result.text, /cannot read changed file locked\.py/);
      assert.doesNotMatch(result.text, /✅ clean/);
    } finally {
      try {
        chmodSync(file, 0o600);
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a changed source symlink fails closed and is never followed outside the worktree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-symlink-source-'));
    const outside = join(tmpdir(), `yagni-outside-${process.pid}.py`);
    try {
      initRepo(dir);
      writeFileSync(outside, 'def outside():\n    pass\n', 'utf-8');
      symlinkSync(outside, join(dir, 'linked.py'));
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 2, result.text);
      assert.match(result.text, /linked\.py is a symbolic link/);
      assert.doesNotMatch(result.text, /✅ clean/);
    } finally {
      rmSync(outside, { force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('git exit 128 during changed-file discovery fails closed instead of returning clean', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-corrupt-git-'));
    try {
      initRepo(dir, true);
      const head = git(dir, 'rev-parse', 'HEAD');
      rmSync(join(dir, '.git', 'objects', head.slice(0, 2), head.slice(2)));
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 2, result.text);
      assert.match(result.text, /ERR_CLI_YAGNI_GIT_SCOPE_UNAVAILABLE/);
      assert.match(result.text, /exited 128/);
      assert.doesNotMatch(result.text, /✅ clean/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a clean valid repository with HEAD remains a clean control', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-clean-git-'));
    try {
      initRepo(dir, true);
      const result = await mod.run(argv(dir));
      assert.strictEqual(result.exitCode, 0, result.text);
      assert.match(result.text, /✅ clean \(0 changed file\(s\) scanned\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
