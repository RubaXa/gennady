// @file: Execute system command synchronously with safe error handling.
// @consumers: git-core, resolve-conflicts-context-git-build.logic
// @tasks: N/A

import { execSync as nodeExecSync } from 'node:child_process';
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
