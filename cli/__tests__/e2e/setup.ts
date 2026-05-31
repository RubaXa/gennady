// @file: E2E setup service — build, pack, git init, fixture copy, npm install → E2eContext.
// @consumers: E2eContext, setupE2e
// @tasks: TSK-60

import { execSync } from 'node:child_process';
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '#logger';

/** @purpose Dependencies injectable for error-path testing. */
export type SetupE2eDeps = {
  execSync: typeof execSync;
  mkdtempSync: typeof mkdtempSync;
  cpSync: typeof cpSync;
  rmSync: typeof rmSync;
  readdirSync: typeof readdirSync;
  lstatSync: typeof lstatSync;
  writeFileSync: typeof writeFileSync;
  nodeSpawn: typeof nodeSpawn;
};

/** @purpose Result of a spawned CLI command. */
export type SpawnResult = {
  /** @purpose Captured stdout output. */
  stdout: string;
  /** @purpose Captured stderr output. */
  stderr: string;
  /** @purpose Process exit code (0 = success). */
  exitCode: number;
};

/** @purpose Ready-to-use e2e test context with spawn capability and cleanup. */
export type E2eContext = {
  /** @purpose Path to the temp fixture-project directory. */
  readonly cwd: string;
  /** @purpose Execute `npx gennady <args>` in the fixture project. */
  spawn(args: string[]): Promise<SpawnResult>;
  /** @purpose Remove the temp directory. Idempotent. */
  cleanup(): void;
};

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const FIXTURE_DIR = resolve(import.meta.dirname, 'fixtures');

let _ctx: E2eContext | null = null;

/**
 * @purpose Retrieve the shared E2eContext set by the orchestrator before hook.
 * @throws {Error} When context has not been set yet.
 */
export function getContext(): E2eContext {
  if (!_ctx) throw new Error('[getContext] E2E context not set — call setContext before tests');
  return _ctx;
}

/** @purpose Set the shared E2eContext. Called by the orchestrator before hook. */
export function setContext(ctx: E2eContext): void {
  _ctx = ctx;
}

/**
 * @purpose Full e2e setup: build → pack → temp dir → fixture copy → git init → npm install → E2eContext.
 * @invariant On failure at any step, temp dir is cleaned up and the error is rethrown with cause.
 * @returns Ready-to-use E2eContext.
 * @throws {Error} When build, pack, fixture copy, temp dir creation, or npm install fails.
 */
export async function setupE2e(): Promise<E2eContext> {
  return _setupE2e({
    execSync,
    mkdtempSync,
    cpSync,
    rmSync,
    readdirSync,
    lstatSync,
    writeFileSync,
    nodeSpawn,
  });
}

/**
 * @purpose Create E2EContext with injected dependencies (for error-path testing).
 * @param deps Injectables replacing node:fs and node:child_process calls.
 * @returns E2eContext produced by the setup pipeline.
 */
export function createContext(deps: SetupE2eDeps, cwd: string): E2eContext {
  return _createE2eContext(deps, cwd);
}

/**
 * @purpose Full setup pipeline with injected dependencies — used by error-path tests.
 * @param deps Injectables for setup steps.
 * @returns E2eContext produced by the pipeline.
 */
export async function runSetupWithDeps(deps: SetupE2eDeps): Promise<E2eContext> {
  return _setupE2e(deps);
}

// Internal

async function _setupE2e(deps: SetupE2eDeps): Promise<E2eContext> {
  // #region START_BUILD — invariant: npm run build must succeed before pack
  try {
    deps.execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  } catch (cause) {
    logger.error('[setupE2e] [build → failed]', { error: cause });
    throw new Error('[setupE2e] build failed', { cause });
  }
  // #endregion END_BUILD

  // #region START_PACK — invariant: npm pack creates gennady-X.Y.Z.tgz identical to published artifact
  let tgzName: string;
  try {
    tgzName = deps.execSync('npm pack', { cwd: PROJECT_ROOT, encoding: 'utf-8' }).trim();
  } catch (cause) {
    const err = cause as { stderr?: string };
    logger.error('[setupE2e] [pack → failed]', { error: cause });
    throw new Error(`npm pack failed: ${err.stderr ?? 'unknown error'}`, { cause });
  }
  // #endregion END_PACK

  // #region START_TEMP_DIR — invariant: os.tmpdir() must be writable
  let tmpDir: string;
  try {
    tmpDir = deps.mkdtempSync(join(tmpdir(), 'gennady-e2e-'));
  } catch (cause) {
    logger.error('[setupE2e] [temp-dir → failed]', { error: cause });
    throw new Error(
      `temp dir creation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
  }
  // #endregion END_TEMP_DIR

  try {
    // #region START_COPY_FIXTURE — invariant: fixture dir must exist
    if (!deps.lstatSync(FIXTURE_DIR).isDirectory()) {
      throw new Error(`fixture copy failed: ${FIXTURE_DIR}`);
    }
    deps.cpSync(FIXTURE_DIR, tmpDir, { recursive: true });
    // #endregion END_COPY_FIXTURE

    // #region START_GIT_INIT — invariant: git must initialize and stage all fixture files
    deps.execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    deps.execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    deps.execSync(
      'git reset src/no-header.ts src/no-consumers.ts src/bad-anchor.ts src/needs-autofix.ts',
      { cwd: tmpDir, stdio: 'pipe' }
    );
    // #endregion END_GIT_INIT

    // #region START_INSTALL — invariant: tgz must be valid npm package, installable via npm
    const srcTgz = resolve(PROJECT_ROOT, tgzName);
    const destTgz = join(tmpDir, tgzName);
    deps.cpSync(srcTgz, destTgz);
    try {
      deps.execSync(`npm install ./${tgzName}`, { cwd: tmpDir, stdio: 'pipe' });
    } catch (cause) {
      const err = cause as { stderr?: string };
      logger.error('[setupE2e] [install → failed]', { error: cause });
      throw new Error(`npm install failed: ${err.stderr ?? 'unknown error'}`, { cause });
    }
    // #endregion END_INSTALL

    return _createE2eContext(deps, tmpDir);
  } catch (cause) {
    logger.error('[setupE2e] [setup → rollback]', { error: cause });
    // #region START_ROLLBACK — invariant: cleanup temp dir on any setup failure
    try {
      deps.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup is best-effort; primary error takes precedence
    }
    throw cause;
    // #endregion END_ROLLBACK
  }
}

function _createE2eContext(deps: SetupE2eDeps, cwd: string): E2eContext {
  let _cleanedUp = false;

  return {
    cwd,

    spawn(args: string[]): Promise<SpawnResult> {
      return new Promise<SpawnResult>((resolve, reject) => {
        const child = deps.nodeSpawn('npx', ['gennady', ...args], {
          cwd,
          env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        // #region START_SPAWN_TIMEOUT — invariant: 30s timeout per spawn call
        const timer = setTimeout(() => {
          child.kill();
          logger.error(`[E2eContext#spawn] [spawn → timeout] gennady ${args.join(' ')}`);
          reject(new Error(`spawn timed out after 30s: gennady ${args.join(' ')}`));
        }, 30_000);
        // #endregion END_SPAWN_TIMEOUT

        child.on('error', (err: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          if (err.code === 'ENOENT') {
            logger.error('[E2eContext#spawn] [spawn → error] npx not found');
            reject(new Error('npx not found'));
          } else {
            logger.error('[E2eContext#spawn] [spawn → error]', { error: err });
            reject(err);
          }
        });

        child.on('close', (code: number | null) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        });
      });
    },

    cleanup(): void {
      // #region START_CLEANUP — invariant: idempotent, safe to call multiple times
      if (_cleanedUp) return;
      _cleanedUp = true;
      try {
        deps.rmSync(cwd, { recursive: true, force: true });
      } catch {
        // cleanup is best-effort
      }
      // #endregion END_CLEANUP
    },
  };
}
