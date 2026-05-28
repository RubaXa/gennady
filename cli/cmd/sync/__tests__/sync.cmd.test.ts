// @file: Integration tests for sync CLI — run() with mock deps
// @consumers: TSK-54
// @tasks: TSK-54

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync as fsStatSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import { run } from '../sync.cmd.ts';
import type { SyncCmdDeps } from '../sync.cmd.ts';

interface CaptureStream extends Writable {
  _chunks: string[];
}

function captureStream(): CaptureStream {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  }) as CaptureStream;
  stream._chunks = chunks;
  return stream;
}

function makeDeps(sourceDir: string, targetDir: string): SyncCmdDeps {
  return {
    readFile: (p: string) => {
      if (!existsSync(p)) {
        const err = new Error(`ENOENT: ${p}`);
        (err as NodeJS.ErrnoException).code = 'ENOENT';
        throw err;
      }
      return readFileSync(p);
    },
    writeFile: (p: string, data: Buffer) => {
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, data);
    },
    mkdir: (p: string, opts?: { recursive: boolean }) => {
      mkdirSync(p, opts);
    },
    stat: (p: string) => fsStatSync(p),
    readdir: readdirSync,
    resolvePackageDir: (_cwd: string) => sourceDir,
  };
}

describe('run (integration)', () => {
  let _tmpDir: string;
  let _sourceDir: string;
  let _targetDir: string;
  const _originalCwd = process.cwd.bind(process);

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-cmd-test-'));
    _sourceDir = join(_tmpDir, 'pkg', 'ai', 'directives');
    _targetDir = join(_tmpDir, 'ai', 'directives');
    mkdirSync(_sourceDir, { recursive: true });
    mkdirSync(_targetDir, { recursive: true });

    (process as any).cwd = () => _tmpDir;
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
    (process as any).cwd = _originalCwd;
  });

  // #region TEST_CASE_CMD_1: happy path — all files new
  it('adds all new files and returns exit 0', () => {
    // purpose: first sync, all files new → exit 0, all added
    // contract: output contains + markers, summary line with correct counts

    writeFileSync(join(_sourceDir, 'a.xml'), '<a/>', 'utf-8');
    writeFileSync(join(_sourceDir, 'b.xml'), '<b/>', 'utf-8');

    const stdout = captureStream();
    const stderr = captureStream();
    const deps = makeDeps(_sourceDir, _targetDir);
    deps.stdout = stdout as unknown as NodeJS.WriteStream;
    deps.stderr = stderr as unknown as NodeJS.WriteStream;

    const exitCode = run(['node', 'sync'], deps);

    assert.equal(exitCode, 0);
    const output = stdout._chunks.join('');
    assert.ok(output.includes('+ a.xml'));
    assert.ok(output.includes('+ b.xml'));
    assert.ok(output.includes('Synced: 2 added, 0 updated, 0 skipped'));
  });
  // #endregion

  // #region TEST_CASE_CMD_2: repeat — nothing changes
  it('reports all unchanged on repeat run', () => {
    // purpose: second sync with no changes → all unchanged
    // contract: exit 0, = markers

    writeFileSync(join(_sourceDir, 'same.xml'), '<s/>', 'utf-8');
    writeFileSync(join(_targetDir, 'same.xml'), '<s/>', 'utf-8');

    const stdout = captureStream();
    const deps = makeDeps(_sourceDir, _targetDir);
    deps.stdout = stdout as unknown as NodeJS.WriteStream;

    const exitCode = run(['node', 'sync'], deps);

    assert.equal(exitCode, 0);
    const output = stdout._chunks.join('');
    assert.ok(output.includes('= same.xml'));
    assert.ok(output.includes('(unchanged)'));
    assert.ok(output.includes('0 added, 0 updated, 1 skipped'));
  });
  // #endregion

  // #region TEST_CASE_CMD_3: file changed
  it('reports updated when file content changed', () => {
    // purpose: source updated → file marked as updated
    // contract: exit 0, ~ marker, file written with new content

    writeFileSync(join(_sourceDir, 'changed.xml'), '<new/>', 'utf-8');
    writeFileSync(join(_targetDir, 'changed.xml'), '<old/>', 'utf-8');

    const stdout = captureStream();
    const deps = makeDeps(_sourceDir, _targetDir);
    deps.stdout = stdout as unknown as NodeJS.WriteStream;

    const exitCode = run(['node', 'sync'], deps);

    assert.equal(exitCode, 0);
    const output = stdout._chunks.join('');
    assert.ok(output.includes('~ changed.xml'));
    assert.ok(output.includes('1 updated'));

    // verify file was actually overwritten
    const targetContent = readFileSync(join(_targetDir, 'changed.xml'), 'utf-8');
    assert.equal(targetContent, '<new/>');
  });
  // #endregion

  // #region TEST_CASE_CMD_4: --dry-run
  it('dry-run outputs preview without writing files', () => {
    // purpose: --dry-run flag → preview mode
    // contract: exit 0, (would add) markers, files NOT written

    writeFileSync(join(_sourceDir, 'new.xml'), '<n/>', 'utf-8');

    const stdout = captureStream();
    const deps = makeDeps(_sourceDir, _targetDir);
    deps.stdout = stdout as unknown as NodeJS.WriteStream;

    const exitCode = run(['node', 'sync', '--dry-run'], deps);

    assert.equal(exitCode, 0);
    const output = stdout._chunks.join('');
    assert.ok(output.includes('(dry-run)'));
    assert.ok(output.includes('(would add)'));
    assert.ok(output.includes('Dry-run: no files written.'));

    // verify file was NOT written
    assert.ok(!existsSync(join(_targetDir, 'new.xml')));
  });
  // #endregion

  // #region TEST_CASE_CMD_5: filter single subdir
  it('syncs only filtered subdirectory', () => {
    // purpose: positional arg "sdd" → only sdd/ files
    // contract: only files from sdd/ appear in output

    mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });
    writeFileSync(join(_sourceDir, 'sdd', 'd.xml'), '', 'utf-8');
    mkdirSync(join(_sourceDir, 'coding'), { recursive: true });
    writeFileSync(join(_sourceDir, 'coding', 'c.xml'), '', 'utf-8');

    const stdout = captureStream();
    const deps = makeDeps(_sourceDir, _targetDir);
    deps.stdout = stdout as unknown as NodeJS.WriteStream;

    const exitCode = run(['node', 'sync', 'sdd'], deps);

    assert.equal(exitCode, 0);
    const output = stdout._chunks.join('');
    assert.ok(output.includes('sdd/d.xml'));
    assert.ok(!output.includes('coding'));
  });
  // #endregion

  // #region TEST_CASE_CMD_6: filter multiple subdirs
  it('syncs multiple filtered subdirectories', () => {
    // purpose: positional args "sdd", "coding" → files from both
    // contract: both subdirs appear, exit 0

    mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });
    writeFileSync(join(_sourceDir, 'sdd', 'd.xml'), '', 'utf-8');
    mkdirSync(join(_sourceDir, 'coding'), { recursive: true });
    writeFileSync(join(_sourceDir, 'coding', 'c.xml'), '', 'utf-8');

    const stdout = captureStream();
    const deps = makeDeps(_sourceDir, _targetDir);
    deps.stdout = stdout as unknown as NodeJS.WriteStream;

    const exitCode = run(['node', 'sync', 'sdd', 'coding'], deps);

    assert.equal(exitCode, 0);
    const output = stdout._chunks.join('');
    assert.ok(output.includes('sdd/d.xml'));
    assert.ok(output.includes('coding/c.xml'));
  });
  // #endregion

  // #region TEST_CASE_CMD_7: nonexistent subdir → error
  it('exits 1 on nonexistent subdirectory', () => {
    // purpose: bad subdir name → error message + available list
    // contract: exit 1, stderr contains error and available dirs

    mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });

    const stdout = captureStream();
    const stderr = captureStream();
    const deps = makeDeps(_sourceDir, _targetDir);
    deps.stdout = stdout as unknown as NodeJS.WriteStream;
    deps.stderr = stderr as unknown as NodeJS.WriteStream;

    const exitCode = run(['node', 'sync', 'nonexistent'], deps);

    assert.equal(exitCode, 1);
    const errOutput = stderr._chunks.join('');
    assert.ok(errOutput.includes('not found in package'));
    assert.ok(errOutput.includes('Available:'));
    assert.ok(errOutput.includes('sdd'));
  });
  // #endregion

  // #region TEST_CASE_CMD_8: package not found → error
  it('exits 1 when package not found', () => {
    // purpose: resolvePackageDir returns null → clear error message
    // contract: exit 1, stderr contains "not found"

    const stdout = captureStream();
    const stderr = captureStream();
    const deps: SyncCmdDeps = {
      readFile: () => Buffer.from(''),
      writeFile: () => {},
      mkdir: () => {},
      stat: () => ({ isDirectory: () => false, isFile: () => false }),
      readdir: () => [],
      resolvePackageDir: () => null,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    };

    const exitCode = run(['node', 'sync'], deps);

    assert.equal(exitCode, 1);
    const errOutput = stderr._chunks.join('');
    assert.ok(errOutput.includes('package not found'));
    assert.ok(errOutput.includes('npm i -D gennady'));
  });
  // #endregion

  // #region TEST_CASE_CMD_9: --dry-run with positional args combined
  it('handles --dry-run with positional subdir filter', () => {
    // purpose: both dryRun and subdir filter work together
    // contract: exit 0, preview output with (would add) for filtered files only

    mkdirSync(join(_sourceDir, 'sdd'), { recursive: true });
    writeFileSync(join(_sourceDir, 'sdd', 'd.xml'), '<d/>', 'utf-8');
    mkdirSync(join(_sourceDir, 'testing'), { recursive: true });
    writeFileSync(join(_sourceDir, 'testing', 't.xml'), '<t/>', 'utf-8');

    const stdout = captureStream();
    const deps = makeDeps(_sourceDir, _targetDir);
    deps.stdout = stdout as unknown as NodeJS.WriteStream;

    const exitCode = run(['node', 'sync', '--dry-run', 'sdd'], deps);

    assert.equal(exitCode, 0);
    const output = stdout._chunks.join('');
    assert.ok(output.includes('(dry-run)'));
    assert.ok(output.includes('sdd/d.xml'));
    assert.ok(output.includes('(would add)'));
    assert.ok(!output.includes('testing'));
    assert.ok(output.includes('Dry-run: no files written.'));

    // verify no files written
    assert.ok(!existsSync(join(_targetDir, 'sdd', 'd.xml')));
  });
  // #endregion
});
