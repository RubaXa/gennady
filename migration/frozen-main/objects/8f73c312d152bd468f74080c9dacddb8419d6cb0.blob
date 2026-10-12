// @file: Integration tests for gennady agents-rules command — run() with mocked fs
// @consumers: agents-rules.cmd.ts, run
// @tasks: TSK-59

import { describe, it, mock, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Locate project root ─────────────────────────────────────────────────────

const __testdir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__testdir, '../../../..');
const gennadyLink = join(projectRoot, 'node_modules', 'gennady');

// ── Mock state ──────────────────────────────────────────────────────────────

let pkgGuard: boolean;
let readmeExists: boolean;
let readmeContent: string;
let readmeError: Error | null;
let exitCode: number | null;
let stdoutLines: string[];
let stderrLines: string[];

// ── Mock functions ──────────────────────────────────────────────────────────

const mockExistsSync = mock.fn((path: string) => {
  if (path.endsWith('node_modules/gennady')) return pkgGuard;
  if (path.endsWith('package.json')) return !path.includes('/dist/');
  if (path.endsWith('README.md')) return readmeExists;
  return false;
});

const mockReadFileSync = mock.fn((_path: string, _encoding: string) => {
  if (readmeError) throw readmeError;
  return readmeContent;
});

// ── Register mocks ──────────────────────────────────────────────────────────

mock.module('node:fs', {
  namedExports: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
});

// ── Ensure gennady symlink for import.meta.resolve ──────────────────────────

let symlinkCreated = false;
try {
  symlinkSync(projectRoot, gennadyLink, 'dir');
  symlinkCreated = true;
} catch (e: any) {
  if (e.code !== 'EEXIST') throw e;
}

after(() => {
  if (symlinkCreated) {
    try {
      unlinkSync(gennadyLink);
    } catch {
      /* best effort */
    }
  }
});

// ── Import SUT after mocks are registered ───────────────────────────────────

const { run } = await import('../agents-rules.cmd.ts');

// ── Lifecycle ───────────────────────────────────────────────────────────────

const origExit = process.exit;
const origLog = console.log;
const origError = console.error;

beforeEach(() => {
  pkgGuard = false;
  readmeExists = false;
  readmeContent = '';
  readmeError = null;
  exitCode = null;
  stdoutLines = [];
  stderrLines = [];

  mockExistsSync.mock.resetCalls();
  mockReadFileSync.mock.resetCalls();

  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw Object.assign(new Error(`process.exit(${exitCode})`), { exitCode });
  }) as typeof process.exit;

  console.log = (...args: any[]) => {
    stdoutLines.push(args.map(String).join(' '));
  };
  console.error = (...args: any[]) => {
    stderrLines.push(args.map(String).join(' '));
  };
});

afterEach(() => {
  process.exit = origExit;
  console.log = origLog;
  console.error = origError;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('agents-rules.cmd run', () => {
  // #region TEST_CASE_AR_1: package not found
  it('package not found → exit 1 with message', async () => {
    // contract: missing node_modules/gennady produces clear stderr message + exit 1
    // failure mode: do not leak internal paths in error message

    try {
      await run([]);
    } catch {
      /* process.exit throws after capturing exitCode */
    }

    assert.strictEqual(exitCode, 1);
    assert.match(stderrLines.join('\n'), /gennady package not found/);
    assert.match(stderrLines.join('\n'), /npm i -D gennady/);
    assert.strictEqual(stdoutLines.length, 0);
  });
  // #endregion

  // #region TEST_CASE_AR_2: package found + README exists
  it('package found + README exists → stdout content, exit 0', async () => {
    // contract: stdout receives full README.md content, exit code 0
    // invariant: no stderr on success

    pkgGuard = true;
    readmeExists = true;
    readmeContent = '# Gennady Orient\n\nUsage instructions for AI agents.\n';

    await run([]);

    assert.strictEqual(exitCode, null);
    assert.match(stdoutLines.join('\n'), /Usage instructions for AI agents/);
    assert.strictEqual(stderrLines.length, 0);
  });
  // #endregion

  // #region TEST_CASE_AR_3: package found + README missing
  it('package found + README missing → exit 1 with message', async () => {
    // contract: stderr contains path + descriptive error, exit 1

    pkgGuard = true;
    readmeExists = false;

    try {
      await run([]);
    } catch {
      /* process.exit throws after capturing exitCode */
    }

    assert.strictEqual(exitCode, 1);
    assert.match(stderrLines.join('\n'), /README\.md not found at/);
    assert.strictEqual(stdoutLines.length, 0);
  });
  // #endregion

  // #region TEST_CASE_AR_4: package found + README EACCES
  it('package found + README EACCES → exit 1 with message', async () => {
    // contract: read error is surfaced with message prefix, exit 1

    pkgGuard = true;
    readmeExists = true;
    readmeError = Object.assign(new Error('EACCES: permission denied, open'), {
      code: 'EACCES',
    });

    try {
      await run([]);
    } catch {
      /* process.exit throws after capturing exitCode */
    }

    assert.strictEqual(exitCode, 1);
    assert.match(stderrLines.join('\n'), /Cannot read README\.md:/);
    assert.match(stderrLines.join('\n'), /EACCES/);
    assert.strictEqual(stdoutLines.length, 0);
  });
  // #endregion
});
