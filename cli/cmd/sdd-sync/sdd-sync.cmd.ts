// @file: SddSyncCommand — CLI entry for gennady sdd-sync: propagate a ticket's Status into *.3-tasks.md trackers.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import {
  parseMeta,
  parseTrackerRows,
  recomputeRollupProgress,
  updateTrackerStatus,
} from '../../../shared/sdd/tracker.ts';
import { resolveTicketArg, resolutionLine } from '../../../shared/sdd/ticket-resolve.ts';
import {
  ambiguousIdError,
  badInvocation,
  fileError,
  metaError,
  unknownIdError,
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
        // `<scope-or-module>.3-tasks.md` (scope/module trackers) AND the bare project-index
        // `3-tasks.md` (specs/3-tasks.md, no scope prefix) — both are in scope for the rollup
        // Progress recompute pass, see recomputeProgress().
        if (entry.endsWith('.3-tasks.md') || entry === '3-tasks.md') found.push(join(dir, entry));
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
 * @purpose Recompute each index's rollup Progress cells (`Tasks`/`Done`) from its linked trackers'
 *   fresh-off-disk rows, resolving Index links relative to that index's own directory.
 * @invariant Skips a non-rollup index and any link that fails to resolve/read — never a failure.
 * @param indexes Absolute paths of every index in scope for this sync run.
 * @returns One report line per index whose rollup table changed.
 */
function recomputeProgress(indexes: string[]): string[] {
  const report: string[] = [];
  for (const idx of indexes) {
    let content: string;
    try {
      content = readFileSync(idx, 'utf-8');
    } catch {
      continue;
    }
    const { text, updated } = recomputeRollupProgress(content, (link) => {
      try {
        return parseTrackerRows(readFileSync(resolve(dirname(idx), link), 'utf-8'));
      } catch {
        return null;
      }
    });
    if (updated.length === 0) continue;
    writeFileSync(idx, text, 'utf-8');
    const rel = relative(process.cwd(), idx);
    report.push(`  progress:   ${rel} (${updated.join(', ')})`);
  }
  return report;
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

  const root = resolve('.');
  const resolved = resolveTicketArg(ticket, root);
  if (!resolved.ok) {
    if (resolved.reason === 'unreadable') return fileError(ticket);
    if (resolved.reason === 'unknown-id') return unknownIdError(ticket, resolved.refs);
    return ambiguousIdError(ticket, resolved.matches, root);
  }
  const ticketPath = resolved.path;
  const ticketContent = resolved.content;
  const idBanner =
    resolved.resolvedFrom === 'id'
      ? resolutionLine('sdd-sync', resolved.id, ticketPath, root)
      : null;

  const metaRes = extractSection(ticketContent, 'META');
  if (metaRes.status !== 'ok') return metaError(ticket);
  const { taskId, status } = parseMeta(metaRes.content);
  if (!taskId || !status) return metaError(ticket);

  const indexes =
    positional.length > 1
      ? positional.slice(1).map((p) => resolve(p))
      : discoverIndexes(ticketPath);
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

  // Progress recompute happens AFTER the Status write above, so it reads the just-updated tracker
  // rows, not the stale pre-sync state.
  report.push(...recomputeProgress(indexes));

  const header = `[sdd-sync] ${taskId} → ${status}`;
  const body = indexes.length === 0 ? '  (no *.3-tasks.md index files found)' : report.join('\n');
  const text = idBanner ? `${idBanner}\n${header}\n${body}` : `${header}\n${body}`;

  if (verifyFailed) {
    return { ok: false, code: ERR_CLI_SDD_SYNC_VERIFY, exitCode: 1, message: text };
  }
  return { ok: true, text };
}

// Self-executing for CLI: gennady sdd-sync <ticket> [index ...]
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
