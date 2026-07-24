// @file: pid-utils — macOS PID ownership verification to prevent recycled PID kills, plus
//   transparent graceful termination of an orphaned opencode child left by a previous
//   `gennady inbox serve` instance (never any process outside our own recorded PID files —
//   the operator's own manually-run opencode/OpenCode.app is never touched).
// @consumers: gracefulShutdown, serve.cmd.ts, bootstrap.ts
// @tasks: TSK-115, TSK-117

import { execSync } from 'node:child_process';
import { logger } from '#logger';

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

/**
 * @purpose Ask an orphaned opencode child (from a previous, no-longer-running `gennady inbox
 *   serve` instance) to stop, transparently — never a silent/forceful kill.
 * @invariant Caller must have already verified this `pid` came from our port-scoped pid file
 *   and passed {@link isOpencodePid} — never touches an untold process.
 * @invariant SIGTERM first, poll for exit, escalate to SIGKILL only after `graceMs` — every
 *   step logged with the reason, a transparent trail of why.
 * @param pid Process ID to terminate — already verified as ours.
 * @param reason Human-readable reason, logged alongside every step (e.g. "port 4182 pid file
 *   pointed at a live opencode process from a previous inbox serve instance").
 * @param [graceMs] Time to wait for a clean exit after SIGTERM before escalating (default 3000ms).
 * @returns True once the process is confirmed gone (by either signal); false if it survived SIGKILL too.
 */
export async function terminateOrphanedOpencode(
  pid: number,
  reason: string,
  graceMs = 3000
): Promise<boolean> {
  logger.warn('[terminateOrphanedOpencode] [alive → terminating]', { pid, reason });

  try {
    process.kill(pid, 'SIGTERM');
  } catch (cause) {
    // Already gone between the liveness check and here — nothing to do.
    logger.info('[terminateOrphanedOpencode] [terminating → already_gone]', { pid });
    return true;
  }

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (!isOpencodePid(pid)) {
      logger.info('[terminateOrphanedOpencode] [terminating → stopped]', {
        pid,
        signal: 'SIGTERM',
        reason,
      });
      return true;
    }
  }

  logger.warn('[terminateOrphanedOpencode] [terminating → escalating]', {
    pid,
    reason: 'SIGTERM ignored within grace period',
  });
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    logger.info('[terminateOrphanedOpencode] [escalating → already_gone]', { pid });
    return true;
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const stillAlive = isOpencodePid(pid);
  logger.info(
    stillAlive
      ? '[terminateOrphanedOpencode] [escalating → failed] process survived SIGKILL'
      : '[terminateOrphanedOpencode] [escalating → stopped]',
    { pid, signal: 'SIGKILL', reason }
  );
  return !stillAlive;
}
