// @file: SddSyncCommand — CLI entry for gennady sdd-sync: propagate a ticket's Status into *.3-tasks.md trackers.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parseMeta, updateTrackerStatus } from '../../../shared/sdd/tracker.ts';
import {
  badInvocation,
  fileError,
  metaError,
  ERR_CLI_SDD_SYNC_VERIFY,
  type SyncOutcome,
} from './sdd-sync.types.ts';

/**
 * @purpose Collect every *.3-tasks.md from the ticket's directory upward to the filesystem root (depth-capped).
 * @param ticketPath Path of the ticket whose trackers are sought.
 * @returns Absolute paths of discovered index files, nearest first.
 */
function discoverIndexes(ticketPath: string): string[] {
  const found: string[] = [];
  let dir = dirname(resolve(ticketPath));
  for (let hops = 0; hops < 8; hops++) {
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith('.3-tasks.md')) found.push(join(dir, entry));
      }
    } catch {
      // unreadable dir — skip this level
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

/**
 * @purpose Execute gennady sdd-sync — read the ticket Status and bring matching tracker rows into agreement, verifying each write.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns SyncOutcome — a per-index report on success, else an actionable failure.
 */
export async function run(rawArgs: string[]): Promise<SyncOutcome> {
  const args = parseArgs(rawArgs, {});
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-sync'
  );

  const ticket = positional[0];
  if (!ticket) return badInvocation('missing <ticket>');

  let ticketContent: string;
  try {
    ticketContent = readFileSync(resolve(ticket), 'utf-8');
  } catch {
    return fileError(ticket);
  }

  const metaRes = extractSection(ticketContent, 'META');
  if (metaRes.status !== 'ok') return metaError(ticket);
  const { taskId, status } = parseMeta(metaRes.content);
  if (!taskId || !status) return metaError(ticket);

  const indexes = positional.length > 1 ? positional.slice(1).map((p) => resolve(p)) : discoverIndexes(ticket);
  logger.debug(`[SddSyncCommand#run] ${taskId} → ${status}; ${indexes.length} index file(s)`);

  // #region START_SYNC — invariant: update each index; verify the write took before reporting updated
  const report: string[] = [];
  let verifyFailed = false;
  for (const idx of indexes) {
    const rel = relative(process.cwd(), idx);
    let idxContent: string;
    try {
      idxContent = readFileSync(idx, 'utf-8');
    } catch {
      report.push(`  unreadable: ${rel}`);
      continue;
    }
    const upd = updateTrackerStatus(idxContent, taskId, status);
    if (!upd.ok) {
      report.push(`  ${upd.reason === 'task_not_found' ? 'no-row' : 'no-table'}:   ${rel}`);
      continue;
    }
    if (!upd.changed) {
      report.push(`  in-sync:    ${rel}`);
      continue;
    }
    writeFileSync(idx, upd.text, 'utf-8');
    const reverify = updateTrackerStatus(readFileSync(idx, 'utf-8'), taskId, status);
    if (reverify.ok && !reverify.changed) {
      report.push(`  updated:    ${rel}`);
    } else {
      verifyFailed = true;
      report.push(`  VERIFY-FAIL: ${rel}`);
    }
  }
  // #endregion END_SYNC

  const header = `[sdd-sync] ${taskId} → ${status}`;
  const body = indexes.length === 0 ? '  (no *.3-tasks.md index files found)' : report.join('\n');
  const text = `${header}\n${body}`;

  if (verifyFailed) {
    return { ok: false, code: ERR_CLI_SDD_SYNC_VERIFY, exitCode: 1, message: text };
  }
  return { ok: true, text };
}

// Self-executing for CLI: gennady sdd-sync <ticket> [index ...]
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
