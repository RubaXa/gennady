// @file: Execute system command synchronously with safe error handling.
// @consumers: git-core, resolve-conflicts-context-git-build.logic, sdd-check.cmd, changed-files, yagni.cmd, golang-scope.logic (V-02)
// @tasks: N/A

import { execSync as nodeExecSync, execFileSync } from 'node:child_process';
import { logger } from './logger.ts';

/** @purpose Options for execSyncSafe. */
export type ExecSyncSafeOptions = {
  /** @purpose Exit codes that are a normal outcome for this command (e.g. grep's 1 for "no match") — suppresses the error log, still returns ''. */
  expectedExitCodes?: number[];
};

/**
 * @purpose Execute system command synchronously with safe error handling.
 * @pre Command and binary available in PATH; run in correct environment.
 * @sideEffect Process: launch external process; Logs: error on failure, unless the exit code is in `expectedExitCodes`.
 * @consumer git/git-core, other domains via utils
 */
export const execSyncSafe = (cmd: string, options?: ExecSyncSafeOptions): string => {
  try {
    return nodeExecSync(cmd, { encoding: 'utf-8' });
  } catch (cause) {
    const status = (cause as { status?: number }).status;
    const expected = status !== undefined && (options?.expectedExitCodes ?? []).includes(status);
    if (!expected) {
      logger.error(`[execSyncSafe] [running → failed] Command failed`, { cause });
    }
    return '';
  }
};

/**
 * @purpose Execute a binary with argv (no shell, explicit cwd); trimmed stdout or empty string on failure.
 * @sideEffect Process: launches the external binary.
 * @consumer golang-scope.logic (ported verbatim from MAIN d37d5910 as part of V-02)
 */
export const execFileTrimSafe = (bin: string, args: readonly string[], cwd: string): string => {
  try {
    return execFileSync(bin, [...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};
