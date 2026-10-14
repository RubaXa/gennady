// @file: Execute system command synchronously with safe error handling.
// @consumers: git-core, resolve-conflicts-context-git-build.logic, golang-scope.logic
// @tasks: N/A

import { execSync as nodeExecSync, execFileSync } from 'node:child_process';
import { logger } from './logger.ts';

/**
 * @purpose Execute system command synchronously with safe error handling.
 * @pre Command and binary available in PATH; run in correct environment.
 * @sideEffect Process: launch external process; Logs: error on failure.
 * @consumer git/git-core, other domains via utils
 */
export const execSyncSafe = (cmd: string): string => {
  try {
    return nodeExecSync(cmd, { encoding: 'utf-8' });
  } catch (cause) {
    logger.error(`[execSyncSafe] [running → failed] Command failed`, { cause });
    return '';
  }
};

/**
 * @purpose Execute a binary with argv (no shell, explicit cwd); trimmed stdout or empty string on failure.
 * @sideEffect Process: launches the external binary.
 * @consumer golang-scope.logic
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
