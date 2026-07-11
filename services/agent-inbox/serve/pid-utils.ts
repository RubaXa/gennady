// @file: pid-utils — macOS PID ownership verification to prevent recycled PID kills.
// @consumers: gracefulShutdown, serve.cmd.ts
// @tasks: TSK-115, TSK-117

import { execSync } from 'node:child_process';

/**
 * @purpose Verify a PID belongs to an opencode process (prevents recycled PID kills).
 * Uses `ps -p <pid> -o comm=` on macOS.
 * @param pid Process ID to verify.
 * @returns True if the PID's command name contains "opencode".
 */
export function isOpencodePid(pid: number): boolean {
  try {
    const comm = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf-8' }).trim();
    return comm.toLowerCase().includes('opencode');
  } catch {
    return false;
  }
}
