// @file: Process inspection helpers for Claude provider — batch ps and argument parsing
// @consumers: ClaudeProvider
// @tasks: TSK-39

import { execSync } from 'node:child_process';
import { logger } from '#logger';

// #region START_PS_INFO_ENTRY_TYPE
/** @purpose Result of a batch ps query for a single alive process. */
export type PsInfoEntry = {
  /** @purpose Process ID */
  pid: number;
  /** @purpose CPU usage percentage */
  cpuPercent: number;
  /** @purpose Memory usage in megabytes | @invariant Converted from RSS KB: rss / 1024 */
  memoryMb: number;
  /** @purpose Full command-line arguments of the process */
  args: string;
};
// #endregion END_PS_INFO_ENTRY_TYPE

/**
 * @purpose Batch process inspection: one ps spawn for all PIDs — returns alive processes only.
 * @invariant Single `ps -p` call regardless of PID count; dead PIDs are absent from the result Map.
 * @invariant On ps command failure: warn-log and return empty Map — graceful degradation.
 * @param pids Array of process IDs to inspect.
 * @returns Map of pid → PsInfoEntry for alive processes; empty Map if no PIDs or ps fails.
 * @sideEffect Process: spawns `ps` via execSync.
 */
export function psInfo(pids: number[]): Map<number, PsInfoEntry> {
  // #region START_EMPTY_GUARD
  if (pids.length === 0) return new Map();
  // #endregion END_EMPTY_GUARD

  // #region START_BATCH_PS_CALL — invariant: single ps spawn per batch, per ticket contract
  try {
    const pidList = pids.join(',');
    const output = execSync(`ps -p ${pidList} -o pid=,pcpu=,rss=,args=`, {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const result = new Map<number, PsInfoEntry>();
    const lines = output.trim().split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // pid pcpu rss args... — split on whitespace, first 3 tokens are numeric
      const parts = trimmed.split(/\s+/);
      if (parts.length < 4) continue;

      const rawPid = parts[0]!;
      const rawCpu = parts[1]!;
      const rawRss = parts[2]!;
      const args = parts.slice(3).join(' ');

      const pid = parseInt(rawPid, 10);
      const cpuPercent = parseFloat(rawCpu);
      const rssKb = parseInt(rawRss, 10);

      if (isNaN(pid) || isNaN(cpuPercent) || isNaN(rssKb)) continue;

      result.set(pid, {
        pid,
        cpuPercent,
        memoryMb: rssKb / 1024,
        args,
      });
    }

    logger.debug(`[psInfo] [idle → completed] Batch ps: ${pids.length} requested, ${result.size} alive`);
    return result;
  } catch (cause) {
    const error = new Error('[psInfo] Batch ps command failed', { cause });
    logger.warn(`[psInfo] [idle → failed] ps command error for ${pids.length} PIDs`, { error });
    return new Map();
  }
  // #endregion END_BATCH_PS_CALL
}

/**
 * @purpose Extract --model and --effort values from Claude process command-line arguments.
 * @param args Full command-line arguments string from ps.
 * @returns Parsed model and effort strings (undefined when absent).
 */
export function parseClaudeArgs(args: string): { model?: string; effort?: string } {
  const result: { model?: string; effort?: string } = {};

  const modelMatch = args.match(/--model\s+(\S+)/);
  if (modelMatch) {
    result.model = modelMatch[1];
  }

  const effortMatch = args.match(/--effort\s+(\S+)/);
  if (effortMatch) {
    result.effort = effortMatch[1];
  }

  return result;
}
