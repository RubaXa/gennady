// @file: Integration tests for sync-skills CLI — run() with mock deps
// @consumers: SyncSkillsCmd
// @tasks: TSK-57

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
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import { run } from '../sync-skills.cmd.ts';
import type { SyncCmdDeps } from '../../../../shared/common/sync/sync-deps.type.ts';
import { ERR_SKILLS_SKILL_NOT_FOUND } from '../sync-skills.types.ts';

// #region HELPERS

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

let _tmpDir: string;

function createFile(dir: string, relativePath: string, content: string): void {
  const fullPath = join(dir, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

// #endregion

// #region run — happy path

describe('run integration', () => {
  let _sourceDir: string;
  const _originalCwd = process.cwd.bind(process);

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-cmd-test-'));
    _sourceDir = join(_tmpDir, 'node_modules', 'gennady', 'ai', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
    (process as any).cwd = () => _tmpDir;
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
    (process as any).cwd = _originalCwd;
  });

  function makeDeps(overrides?: Partial<SyncCmdDeps>): SyncCmdDeps {
    return {
      readFile: (p: string) => readFileSync(p),
      writeFile: (p: string, data: Buffer) => {
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, data);
      },
      mkdir: (p: string, opts?: { recursive: boolean }) => mkdirSync(p, opts),
      stat: (p: string) => fsStatSync(p),
      readdir: (p: string) => {
        try { return readdirSync(p); } catch { return []; }
      },
      resolvePackageDir: () => _sourceDir,
      unlink: unlinkSync,
      rmdir: (p: string, opts?: { recursive: boolean }) => rmdirSync(p, opts),
      ...overrides,
    };
  }

  it('syncs all skills from source to target', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit Skill');
    createFile(join(_sourceDir, 'sdd-check'), 'SKILL.md', '# Check Skill');

    const stdout = captureStream();
    const stderr = captureStream();
    const deps = makeDeps({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    const exitCode = run(['node', 'gennady', 'sync-skills'], deps);

    assert.equal(exitCode, 0);

    const output = stdout._chunks.join('');
    assert.ok(output.includes('Sync skills'), 'output header');
    assert.ok(output.includes('sdd-audit'), 'contains sdd-audit');
    assert.ok(output.includes('sdd-check'), 'contains sdd-check');
    assert.ok(output.includes('Synced: 2 added'), 'summary line');

    const targetDir = join(_tmpDir, '.claude', 'skills');
    assert.ok(existsSync(join(targetDir, 'sdd-audit', 'SKILL.md')));
    assert.ok(existsSync(join(targetDir, 'sdd-check', 'SKILL.md')));
  });

  it('reports unchanged on repeat run', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Same');
    mkdirSync(join(_tmpDir, '.claude', 'skills', 'sdd-audit'), { recursive: true });
    createFile(join(_tmpDir, '.claude', 'skills', 'sdd-audit'), 'SKILL.md', '# Same');

    const stdout = captureStream();
    const deps = makeDeps({ stdout: stdout as unknown as NodeJS.WriteStream });

    const exitCode = run(['node', 'gennady', 'sync-skills'], deps);

    assert.equal(exitCode, 0);

    const output = stdout._chunks.join('');
    assert.ok(output.includes('= sdd-audit/'), 'unchanged marker');
    assert.ok(output.includes('(unchanged)'));
    assert.ok(output.includes('0 added, 0 updated, 1 skipped'));
  });

  it('detects updated file when content differs', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# New');
    mkdirSync(join(_tmpDir, '.claude', 'skills', 'sdd-audit'), { recursive: true });
    createFile(join(_tmpDir, '.claude', 'skills', 'sdd-audit'), 'SKILL.md', '# Old');

    const stdout = captureStream();
    const deps = makeDeps({ stdout: stdout as unknown as NodeJS.WriteStream });

    const exitCode = run(['node', 'gennady', 'sync-skills'], deps);

    assert.equal(exitCode, 0);

    const output = stdout._chunks.join('');
    assert.ok(output.includes('~ sdd-audit/'), 'updated marker');

    const targetContent = readFileSync(
      join(_tmpDir, '.claude', 'skills', 'sdd-audit', 'SKILL.md'),
      'utf-8'
    );
    assert.equal(targetContent, '# New');
  });
});

// #endregion

// #region run — dry-run

describe('run --dry-run', () => {
  let _sourceDir: string;
  const _originalCwd = process.cwd.bind(process);

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-cmd-test-'));
    _sourceDir = join(_tmpDir, 'node_modules', 'gennady', 'ai', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
    (process as any).cwd = () => _tmpDir;
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
    (process as any).cwd = _originalCwd;
  });

  function makeDeps(overrides?: Partial<SyncCmdDeps>): SyncCmdDeps {
    return {
      readFile: (p: string) => readFileSync(p),
      writeFile: (p: string, data: Buffer) => {
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, data);
      },
      mkdir: (p: string, opts?: { recursive: boolean }) => mkdirSync(p, opts),
      stat: (p: string) => fsStatSync(p),
      readdir: (p: string) => {
        try { return readdirSync(p); } catch { return []; }
      },
      resolvePackageDir: () => _sourceDir,
      unlink: unlinkSync,
      rmdir: (p: string, opts?: { recursive: boolean }) => rmdirSync(p, opts),
      ...overrides,
    };
  }

  it('previews without writing files', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# New');

    const stdout = captureStream();
    const deps = makeDeps({ stdout: stdout as unknown as NodeJS.WriteStream });

    const exitCode = run(['node', 'gennady', 'sync-skills', '--dry-run'], deps);

    assert.equal(exitCode, 0);

    const output = stdout._chunks.join('');
    assert.ok(output.includes('(dry-run)'), 'dry-run header');
    assert.ok(output.includes('(would add)'));
    assert.ok(output.includes('Dry-run: no files written.'));

    const targetFile = join(_tmpDir, '.claude', 'skills', 'sdd-audit', 'SKILL.md');
    assert.ok(!existsSync(targetFile), 'no file written');
  });

  it('dry-run with orphan does not delete files', () => {
    mkdirSync(join(_tmpDir, '.claude', 'skills', 'sdd-old'), { recursive: true });
    createFile(join(_tmpDir, '.claude', 'skills', 'sdd-old'), 'SKILL.md', '# Old');

    const stdout = captureStream();
    const deps = makeDeps({ stdout: stdout as unknown as NodeJS.WriteStream });

    const exitCode = run(['node', 'gennady', 'sync-skills', '--dry-run'], deps);

    assert.equal(exitCode, 0);

    const output = stdout._chunks.join('');
    assert.ok(output.includes('(would delete)'), 'dry-run delete preview');

    assert.ok(existsSync(join(_tmpDir, '.claude', 'skills', 'sdd-old')));
  });
});

// #endregion

// #region run — filter

describe('run filter', () => {
  let _sourceDir: string;
  const _originalCwd = process.cwd.bind(process);

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-cmd-test-'));
    _sourceDir = join(_tmpDir, 'node_modules', 'gennady', 'ai', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
    (process as any).cwd = () => _tmpDir;
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
    (process as any).cwd = _originalCwd;
  });

  function makeDeps(overrides?: Partial<SyncCmdDeps>): SyncCmdDeps {
    return {
      readFile: (p: string) => readFileSync(p),
      writeFile: (p: string, data: Buffer) => {
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, data);
      },
      mkdir: (p: string, opts?: { recursive: boolean }) => mkdirSync(p, opts),
      stat: (p: string) => fsStatSync(p),
      readdir: (p: string) => {
        try { return readdirSync(p); } catch { return []; }
      },
      resolvePackageDir: () => _sourceDir,
      unlink: unlinkSync,
      rmdir: (p: string, opts?: { recursive: boolean }) => rmdirSync(p, opts),
      ...overrides,
    };
  }

  it('syncs only specified skill', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');

    const stdout = captureStream();
    const deps = makeDeps({ stdout: stdout as unknown as NodeJS.WriteStream });

    const exitCode = run(['node', 'gennady', 'sync-skills', 'sdd-execute'], deps);

    assert.equal(exitCode, 0);

    const output = stdout._chunks.join('');
    assert.ok(output.includes('sdd-execute'));
    assert.ok(!output.includes('sdd-audit'));

    assert.ok(existsSync(join(_tmpDir, '.claude', 'skills', 'sdd-execute')));
    assert.ok(!existsSync(join(_tmpDir, '.claude', 'skills', 'sdd-audit')));
  });

  it('syncs multiple specified skills', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');
    createFile(join(_sourceDir, 'sdd-check'), 'SKILL.md', '# Check');

    const stdout = captureStream();
    const deps = makeDeps({ stdout: stdout as unknown as NodeJS.WriteStream });

    const exitCode = run(['node', 'gennady', 'sync-skills', 'sdd-audit', 'sdd-execute'], deps);

    assert.equal(exitCode, 0);

    const output = stdout._chunks.join('');
    assert.ok(output.includes('sdd-audit'));
    assert.ok(output.includes('sdd-execute'));
    assert.ok(!output.includes('sdd-check'));
  });
});

// #endregion

// #region run — error paths

describe('run error paths', () => {
  let _sourceDir: string;
  const _originalCwd = process.cwd.bind(process);

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-cmd-test-'));
    _sourceDir = join(_tmpDir, 'node_modules', 'gennady', 'ai', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
    (process as any).cwd = () => _tmpDir;
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
    (process as any).cwd = _originalCwd;
  });

  function makeDeps(overrides?: Partial<SyncCmdDeps>): SyncCmdDeps {
    return {
      readFile: (p: string) => readFileSync(p),
      writeFile: (p: string, data: Buffer) => {
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, data);
      },
      mkdir: (p: string, opts?: { recursive: boolean }) => mkdirSync(p, opts),
      stat: (p: string) => fsStatSync(p),
      readdir: (p: string) => {
        try { return readdirSync(p); } catch { return []; }
      },
      resolvePackageDir: () => _sourceDir,
      unlink: unlinkSync,
      rmdir: (p: string, opts?: { recursive: boolean }) => rmdirSync(p, opts),
      ...overrides,
    };
  }

  it('exits 1 when skill name not found in source', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');

    const stdout = captureStream();
    const stderr = captureStream();
    const deps = makeDeps({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    const exitCode = run(['node', 'gennady', 'sync-skills', 'nonexistent'], deps);

    assert.equal(exitCode, 1);

    const errOutput = stderr._chunks.join('');
    assert.ok(errOutput.includes('not found in source'), 'error message');
    assert.ok(errOutput.includes('Available:'), 'available skills');
    assert.ok(errOutput.includes('sdd-audit'));
  });

  it('exits 1 when package not found', () => {
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

    const exitCode = run(['node', 'gennady', 'sync-skills'], deps);

    assert.equal(exitCode, 1);

    const errOutput = stderr._chunks.join('');
    assert.ok(errOutput.includes('package not found'), 'error about missing package');
    assert.ok(errOutput.includes('npm i -D gennady'), 'install hint');
  });

  it('exits 1 when sourceDir does not exist', () => {
    const badSourceDir = join(_tmpDir, 'nonexistent-package', 'ai', 'skills');

    const stdout = captureStream();
    const stderr = captureStream();
    const deps: SyncCmdDeps = {
      readFile: () => Buffer.from(''),
      writeFile: () => {},
      mkdir: () => {},
      stat: () => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      },
      readdir: () => [],
      resolvePackageDir: () => badSourceDir,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    };

    const exitCode = run(['node', 'gennady', 'sync-skills'], deps);

    assert.equal(exitCode, 1);

    const errOutput = stderr._chunks.join('');
    assert.ok(errOutput.includes('Source directory not found'));
  });
});

// #endregion

// #region run — parseArgs

describe('run parseArgs', () => {
  let _sourceDir: string;
  const _originalCwd = process.cwd.bind(process);

  beforeEach(() => {
    _tmpDir = mkdtempSync(join(tmpdir(), 'sync-skills-cmd-test-'));
    _sourceDir = join(_tmpDir, 'node_modules', 'gennady', 'ai', 'skills');
    mkdirSync(_sourceDir, { recursive: true });
    (process as any).cwd = () => _tmpDir;
  });

  afterEach(() => {
    if (existsSync(_tmpDir)) rmSync(_tmpDir, { recursive: true });
    (process as any).cwd = _originalCwd;
  });

  it('returns error for non-existent skill with --dry-run', () => {
    createFile(join(_sourceDir, 'sdd-audit'), 'SKILL.md', '# Audit');

    const stdout = captureStream();
    const stderr = captureStream();
    const deps: SyncCmdDeps = {
      readFile: (p: string) => readFileSync(p),
      writeFile: (p: string, data: Buffer) => {
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, data);
      },
      mkdir: (p: string, opts?: { recursive: boolean }) => mkdirSync(p, opts),
      stat: (p: string) => fsStatSync(p),
      readdir: (p: string) => {
        try { return readdirSync(p); } catch { return []; }
      },
      resolvePackageDir: () => _sourceDir,
      unlink: unlinkSync,
      rmdir: (p: string, opts?: { recursive: boolean }) => rmdirSync(p, opts),
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    };

    const exitCode = run(['node', 'gennady', 'sync-skills', '--dry-run', 'sdd-execute'], deps);

    assert.equal(exitCode, 1);

    const errOutput = stderr._chunks.join('');
    assert.ok(errOutput.includes('sdd-execute'), 'error names the missing skill');
  });

  it('parses positional skill name arguments', () => {
    createFile(join(_sourceDir, 'sdd-execute'), 'SKILL.md', '# Execute');

    const stdout = captureStream();
    const deps: SyncCmdDeps = {
      readFile: (p: string) => readFileSync(p),
      writeFile: (p: string, data: Buffer) => {
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, data);
      },
      mkdir: (p: string, opts?: { recursive: boolean }) => mkdirSync(p, opts),
      stat: (p: string) => fsStatSync(p),
      readdir: (p: string) => {
        try { return readdirSync(p); } catch { return []; }
      },
      resolvePackageDir: () => _sourceDir,
      unlink: unlinkSync,
      rmdir: (p: string, opts?: { recursive: boolean }) => rmdirSync(p, opts),
      stdout: stdout as unknown as NodeJS.WriteStream,
    };

    const exitCode = run(['node', 'gennady', 'sync-skills', 'sdd-execute'], deps);

    assert.equal(exitCode, 0);

    const output = stdout._chunks.join('');
    assert.ok(output.includes('sdd-execute'));
  });
});

// #endregion
