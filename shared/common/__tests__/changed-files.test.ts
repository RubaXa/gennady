// @file: Unit tests for changed-files.ts — real git repos (no mocking: git behavior is deterministic),
//   covering getChangedFiles's unfiltered diff (added for sdd-task --group-scope, D-item "group-scope
//   underreports diff") alongside shared production/all-SDD-source extension filters.
// @spec: SHARED
// @consumers: node:test runner

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getChangedFiles,
  getChangedSourceFiles,
  hasGitHead,
  getHeadContent,
  getHeadContents,
} from '../changed-files.ts';

function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
}

describe('changed-files', () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'changed-files-'));
    writeFileSync(join(dir, 'README.md'), '# init\n', 'utf-8');
    initGitRepo(dir);
    // tracked source file, modified after commit
    writeFileSync(join(dir, 'src.ts'), '// changed\n', 'utf-8');
    // untracked files of assorted kinds
    writeFileSync(join(dir, 'notes.md'), '# notes\n', 'utf-8');
    writeFileSync(join(dir, 'config.json'), '{}\n', 'utf-8');
    writeFileSync(join(dir, 'extra.ts'), '// extra\n', 'utf-8');
    writeFileSync(join(dir, 'extra.test.ts'), '// test\n', 'utf-8');
    writeFileSync(join(dir, 'Foo.swift'), '// swift\n', 'utf-8');
    writeFileSync(join(dir, 'FooTests.swift'), '// swift test\n', 'utf-8');
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), '// vendored\n', 'utf-8');
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('hasGitHead is true once a commit exists', () => {
    assert.strictEqual(hasGitHead(dir), true);
  });

  it('getChangedFiles returns every changed file regardless of extension, excluding node_modules', () => {
    const result = getChangedFiles(dir);
    assert.strictEqual(result.status, 'ok');
    if (result.status === 'error') return;
    const files = result.files;
    assert.ok(files.includes('src.ts'));
    assert.ok(files.includes('notes.md'));
    assert.ok(files.includes('config.json'));
    assert.ok(files.includes('extra.ts'));
    assert.ok(files.includes('extra.test.ts'));
    assert.ok(!files.some((f) => f.includes('node_modules/')));
  });

  it('getChangedSourceFiles retains production and test files from shared extensions', () => {
    const result = getChangedSourceFiles(dir);
    assert.strictEqual(result.status, 'ok');
    if (result.status === 'error') return;
    const files = result.files;
    assert.ok(files.includes('src.ts'));
    assert.ok(files.includes('extra.ts'));
    assert.ok(files.includes('Foo.swift'));
    assert.ok(!files.includes('notes.md'));
    assert.ok(!files.includes('config.json'));
    assert.ok(files.includes('extra.test.ts'));
    assert.ok(files.includes('FooTests.swift'));
    assert.ok(!files.some((f) => f.includes('node_modules/')));
  });

  it('passes a root containing shell metacharacters as one argv value and executes no shell text', () => {
    const parent = mkdtempSync(join(tmpdir(), 'changed-files-argv-'));
    const marker = join(parent, 'SHOULD_NOT_EXIST');
    const hostile = join(parent, `repo-$(touch SHOULD_NOT_EXIST)-\`touch SHOULD_NOT_EXIST\``);
    mkdirSync(hostile);
    writeFileSync(join(hostile, 'tracked.ts'), 'before\n');
    initGitRepo(hostile);
    writeFileSync(join(hostile, 'tracked.ts'), 'after\n');
    const previous = process.cwd();
    try {
      process.chdir(parent);
      const result = getChangedFiles(hostile);
      assert.strictEqual(result.status, 'ok');
      if (result.status !== 'error') assert.deepStrictEqual(result.files, ['tracked.ts']);
      assert.throws(() => readFileSync(marker, 'utf-8'));
    } finally {
      process.chdir(previous);
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('aggregates staged, intent-to-add, untracked and NUL-sensitive names on an unborn branch', () => {
    const unborn = mkdtempSync(join(tmpdir(), 'changed-files-unborn-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: unborn });
      writeFileSync(join(unborn, 'staged.ts'), 'staged\n');
      writeFileSync(join(unborn, 'intent.ts'), 'intent\n');
      writeFileSync(join(unborn, 'untracked.ts'), 'untracked\n');
      writeFileSync(join(unborn, 'odd\nname.ts'), 'odd\n');
      execFileSync('git', ['add', 'staged.ts'], { cwd: unborn });
      execFileSync('git', ['add', '-N', 'intent.ts'], { cwd: unborn });
      const noHead = getChangedFiles(unborn);
      assert.strictEqual(noHead.status, 'no-head');
      if (noHead.status === 'no-head') {
        assert.deepStrictEqual(noHead.files, [
          'intent.ts',
          'odd\nname.ts',
          'staged.ts',
          'untracked.ts',
        ]);
      }
    } finally {
      rmSync(unborn, { recursive: true, force: true });
    }
  });

  it('preserves a staged deletion with a real HEAD and still distinguishes corrupt HEAD', () => {
    const deletion = mkdtempSync(join(tmpdir(), 'changed-files-deletion-'));
    const corrupt = mkdtempSync(join(tmpdir(), 'changed-files-corrupt-'));
    try {
      writeFileSync(join(deletion, 'deleted.ts'), 'before\n');
      initGitRepo(deletion);
      execFileSync('git', ['rm', '-q', 'deleted.ts'], { cwd: deletion });
      const deleted = getChangedFiles(deletion);
      assert.deepStrictEqual(deleted, { status: 'ok', files: ['deleted.ts'] });

      writeFileSync(join(corrupt, 'tracked.ts'), 'before\n');
      initGitRepo(corrupt);
      writeFileSync(join(corrupt, 'tracked.ts'), 'dirty\n');
      const branch = execFileSync('git', ['symbolic-ref', 'HEAD'], {
        cwd: corrupt,
        encoding: 'utf-8',
      }).trim();
      writeFileSync(join(corrupt, '.git', branch), `${'1'.repeat(40)}\n`);
      const broken = getChangedFiles(corrupt);
      assert.strictEqual(broken.status, 'error');
      if (broken.status === 'error') {
        assert.notStrictEqual(broken.exitCode, 0);
        assert.ok(broken.stderr.length > 0);
      }
    } finally {
      rmSync(deletion, { recursive: true, force: true });
      rmSync(corrupt, { recursive: true, force: true });
    }
  });
  it('reads literal NUL-sensitive paths and exact UTF8/binary boundaries without a live-source fallback', () => {
    const root = mkdtempSync(join(tmpdir(), 'head-contents-literal-'));
    const seeded = new Map<string, Buffer>([
      ['specs/plain.spec.md', Buffer.from('Привет 🌍\r\nline\n\0tail\n')],
      ['specs/route[one].spec.md', Buffer.from('literal brackets\n')],
      ['specs/routeo.spec.md', Buffer.from('must not substitute a glob match\n')],
      ['specs/tab\tname.spec.md', Buffer.from('tab path\n')],
      ['specs/line\nname.spec.md', Buffer.from('line path\n')],
      ['specs/:(glob)magic.spec.md', Buffer.from('literal pathspec magic\n')],
      ['specs/-dash.spec.md', Buffer.from('dash\n')],
      ['specs/empty.spec.md', Buffer.alloc(0)],
      ['specs/invalid-utf8.spec.md', Buffer.from([0xff, 0, 10, 0xfe, 10])],
    ]);
    try {
      for (const [file, bytes] of seeded) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), bytes);
      }
      initGitRepo(root);
      writeFileSync(join(root, 'specs/plain.spec.md'), 'unrelated current source\n');
      const selected = [
        ...seeded.keys(),
        'specs/missing[one].spec.md',
        'specs',
        '../outside',
        'bad\0name',
      ];
      const values = getHeadContents(root, [...selected, selected[0]]);
      assert.equal(values.size, selected.length);
      for (const [file, bytes] of seeded)
        assert.equal(values.get(file), bytes.toString('utf8'), file);
      for (const file of selected.slice(seeded.size)) assert.equal(values.get(file), null, file);
      assert.equal(values.get('specs/plain.spec.md'), getHeadContent(root, 'specs/plain.spec.md'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('pins one HEAD for67 files with three Git calls and observes a changed HEAD on the next invocation', () => {
    const root = mkdtempSync(join(tmpdir(), 'head-contents-pin-'));
    const paths = Array.from({ length: 67 }, (_, index) => `spec-${index}.spec.md`);
    const originalSpawn = childProcess.spawnSync;
    try {
      for (const [index, file] of paths.entries())
        writeFileSync(join(root, file), `old ${index}\n`);
      initGitRepo(root);
      const oldHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      writeFileSync(join(root, paths[0]), 'new HEAD content\n');
      execFileSync('git', ['add', '-A'], { cwd: root });
      execFileSync('git', ['commit', '-qm', 'next'], { cwd: root });
      const newHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      execFileSync('git', ['checkout', '--detach', '-q', oldHead], { cwd: root });
      const calls: string[][] = [];
      childProcess.spawnSync = ((command, args, options) => {
        const result = originalSpawn(command, args, options);
        if (command === 'git') {
          calls.push([...args]);
          if (args.includes('ls-tree'))
            execFileSync('git', ['checkout', '--detach', '-q', newHead], { cwd: root });
        }
        return result;
      }) as typeof childProcess.spawnSync;
      syncBuiltinESMExports();
      const first = getHeadContents(root, paths);
      assert.equal(first.get(paths[0]), 'old 0\n');
      for (let index = 1; index < paths.length; index++)
        assert.equal(first.get(paths[index]), `old ${index}\n`);
      assert.equal(calls.length, 3);
      const tree = calls.find((args) => args.includes('ls-tree'))!;
      assert.ok(tree.includes(oldHead));
      assert.ok(tree.includes('--literal-pathspecs'));
      const second = getHeadContents(root, paths);
      assert.equal(second.get(paths[0]), 'new HEAD content\n');
      assert.equal(calls.length, 6, 'No cross-invocation HEAD cache is allowed');
    } finally {
      childProcess.spawnSync = originalSpawn;
      syncBuiltinESMExports();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null for no repository, unborn HEAD and corrupt Git rather than treating current files as baselines', () => {
    for (const state of ['outside', 'unborn', 'corrupt'] as const) {
      const root = mkdtempSync(join(tmpdir(), 'head-contents-state-'));
      try {
        writeFileSync(join(root, 'value.spec.md'), 'current bytes are not a baseline\n');
        if (state === 'unborn') execFileSync('git', ['init', '-q'], { cwd: root });
        if (state === 'corrupt') {
          initGitRepo(root);
          writeFileSync(join(root, '.git', 'HEAD'), `${'1'.repeat(40)}\n`);
        }
        assert.deepEqual(
          [...getHeadContents(root, ['value.spec.md', 'missing.spec.md'])],
          [
            ['value.spec.md', null],
            ['missing.spec.md', null],
          ]
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('does not bind another blob or partial response when Git batch framing is malformed', () => {
    const root = mkdtempSync(join(tmpdir(), 'head-contents-framing-'));
    const originalSpawn = childProcess.spawnSync;
    try {
      writeFileSync(join(root, 'value.spec.md'), 'HEAD bytes\n');
      initGitRepo(root);
      writeFileSync(join(root, 'value.spec.md'), 'live source must not be substituted\n');
      for (const variant of ['trailing', 'wrong-oid', 'failed-tree'] as const) {
        childProcess.spawnSync = ((command, args, options) => {
          const result = originalSpawn(command, args, options);
          if (command === 'git' && args.includes('ls-tree') && variant === 'failed-tree')
            return { ...result, status: 128, stderr: Buffer.from('injected Git failure') };
          if (command === 'git' && args.includes('cat-file')) {
            const bytes = result.stdout as Buffer;
            const stdout =
              variant === 'trailing'
                ? Buffer.concat([bytes, Buffer.from('unconsumed response')])
                : Buffer.concat([Buffer.from(bytes[0] === 48 ? '1' : '0'), bytes.subarray(1)]);
            return { ...result, stdout };
          }
          return result;
        }) as typeof childProcess.spawnSync;
        syncBuiltinESMExports();
        assert.equal(getHeadContents(root, ['value.spec.md']).get('value.spec.md'), null, variant);
      }
    } finally {
      childProcess.spawnSync = originalSpawn;
      syncBuiltinESMExports();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('bounds large object catalogs in binary batches while preserving every result', () => {
    const root = mkdtempSync(join(tmpdir(), 'head-contents-chunks-'));
    const originalSpawn = childProcess.spawnSync;
    const paths = Array.from({ length: 513 }, (_, index) => `value-${index}.spec.md`);
    try {
      for (const [index, file] of paths.entries()) writeFileSync(join(root, file), `${index}\n`);
      initGitRepo(root);
      let batches = 0;
      childProcess.spawnSync = ((command, args, options) => {
        if (command === 'git' && args.includes('cat-file')) {
          batches++;
          assert.ok(options.maxBuffer <= 64 * 1024 * 1024 + 512 * 128);
          for (const oid of String(options.input).trim().split('\n'))
            assert.match(oid, /^[a-f0-9]{40,64}$/);
        }
        return originalSpawn(command, args, options);
      }) as typeof childProcess.spawnSync;
      syncBuiltinESMExports();
      const values = getHeadContents(root, paths);
      assert.ok(batches > 1);
      for (const [index, file] of paths.entries()) assert.equal(values.get(file), `${index}\n`);
    } finally {
      childProcess.spawnSync = originalSpawn;
      syncBuiltinESMExports();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('bounds long path catalogs without dropping requested keys or re-reading a moving HEAD', () => {
    const root = mkdtempSync(join(tmpdir(), 'head-contents-argv-'));
    const originalSpawn = childProcess.spawnSync;
    const content = 'shared immutable object\n';
    // This protocol packing control uses real Git object bytes, without creating1000 deep working paths.
    const paths = Array.from(
      { length: 1000 },
      (_, index) => `${'long/'.repeat(150)}value-${index}.spec.md`
    );
    try {
      writeFileSync(join(root, 'one.spec.md'), content);
      initGitRepo(root);
      const oid = execFileSync('git', ['rev-parse', 'HEAD:one.spec.md'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      let pins = 0,
        trees = 0,
        objects = 0;
      childProcess.spawnSync = ((command, args, options) => {
        if (command === 'git' && args.includes('rev-parse')) pins++;
        if (command === 'git' && args.includes('ls-tree')) {
          trees++;
          const selected = args.slice(args.indexOf('--') + 1);
          assert.ok(selected.length <= 128);
          assert.ok(
            selected.reduce((sum, file) => sum + Buffer.byteLength(file) + 1, 0) <= 32 * 1024
          );
          return {
            status: 0,
            signal: null,
            pid: 0,
            output: [],
            stdout: Buffer.from(
              selected
                .map((file) => `100644 blob ${oid} ${Buffer.byteLength(content)}\t${file}\0`)
                .join('')
            ),
            stderr: Buffer.alloc(0),
          };
        }
        if (command === 'git' && args.includes('cat-file')) objects++;
        return originalSpawn(command, args, options);
      }) as typeof childProcess.spawnSync;
      syncBuiltinESMExports();
      const values = getHeadContents(root, paths);
      assert.equal(values.size, paths.length);
      for (const file of paths) assert.equal(values.get(file), content, file);
      assert.equal(pins, 1);
      assert.ok(trees > 1);
      assert.equal(objects, 1, 'Identical OIDs across path chunks need one immutable object read');
    } finally {
      childProcess.spawnSync = originalSpawn;
      syncBuiltinESMExports();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
