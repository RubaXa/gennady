// @file: SddSyncCommand — CLI entry for gennady sdd-sync: propagate a ticket's Status into *.3-tasks.md trackers.
// @consumers: gennady.ts
// @tasks: N/A

import { readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
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
  proveRepoFile,
  readProvenRepoFile,
  revalidateRepoFile,
  writeProvenRepoFile,
  type RepoFileIdentity,
} from '../../../shared/common/repo-file-identity.ts';
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
function isAllowedOwnerIndex(ticketPath: string, index: RepoFileIdentity): boolean {
  const parts = index.relative.split('/');
  if (parts[0] !== 'specs') return false;
  const name = parts.at(-1) ?? '';
  if (index.relative === 'specs/3-tasks.md') return true;
  if (!name.endsWith('.3-tasks.md') || parts.length < 3) return false;
  const owner = name.slice(0, -'.3-tasks.md'.length);
  if (owner !== parts.at(-2)) return false;
  const indexDir = dirname(index.absolute);
  const ticketDir = dirname(ticketPath);
  const ownership = relative(indexDir, ticketDir);
  return ownership === '' || (!ownership.startsWith(`..${sep}`) && ownership !== '..');
}

type IndexSet = { ok: true; indexes: RepoFileIdentity[] } | { ok: false; detail: string };

function discoverIndexes(root: string, ticketPath: string): IndexSet {
  const found: RepoFileIdentity[] = [];
  let dir = dirname(resolve(ticketPath));
  for (let hops = 0; hops < 8; hops++) {
    const relDir = relative(root, dir);
    if (relDir === '..' || relDir.startsWith(`..${sep}`)) {
      return { ok: false, detail: 'ticket owner walk escaped the canonical project root' };
    }
    try {
      for (const entry of readdirSync(dir)) {
        // `<scope-or-module>.3-tasks.md` (scope/module trackers) AND the bare project-index
        // `3-tasks.md` (specs/3-tasks.md, no scope prefix) — both are in scope for the rollup
        // Progress recompute pass, see recomputeProgress().
        if (!entry.endsWith('.3-tasks.md') && entry !== '3-tasks.md') continue;
        const raw = relative(root, join(dir, entry));
        const proven = proveRepoFile(root, raw);
        if (!proven.ok) return { ok: false, detail: `${raw}: ${proven.detail}` };
        if (isAllowedOwnerIndex(ticketPath, proven.identity)) found.push(proven.identity);
      }
    } catch (cause) {
      return {
        ok: false,
        detail: `${relDir || '.'}: ${(cause as NodeJS.ErrnoException).code ?? 'unreadable directory'}`,
      };
    }
    const parent = dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }
  return { ok: true, indexes: found };
}

/**
 * @purpose Recompute each index's rollup Progress cells (`Tasks`/`Done`) from its linked trackers'
 *   fresh-off-disk rows, resolving Index links relative to that index's own directory.
 * @invariant Skips a non-rollup index and unresolved linked tracker; index identity loss fails verify.
 * @param root Canonical project root for linked tracker containment.
 * @param indexes Proven identities of every index in scope for this sync run.
 * @returns Report lines plus whether an index could no longer be proven.
 */
function recomputeProgress(
  root: string,
  indexes: RepoFileIdentity[]
): { report: string[]; verifyFailed: boolean } {
  const report: string[] = [];
  let verifyFailed = false;
  for (const idx of indexes) {
    const observed = readProvenRepoFile(idx);
    if (!observed.ok) {
      verifyFailed = true;
      report.push(`  VERIFY-FAIL: ${relative(process.cwd(), idx.absolute)}`);
      continue;
    }
    const content = observed.content;
    const { text, updated } = recomputeRollupProgress(content, (link) => {
      const linkedRaw = relative(root, resolve(dirname(idx.absolute), link));
      const linked = proveRepoFile(root, linkedRaw);
      if (!linked.ok) return null;
      const read = readProvenRepoFile(linked.identity);
      return read.ok ? parseTrackerRows(read.content) : null;
    });
    if (updated.length === 0) continue;
    const written = writeProvenRepoFile(idx, text);
    if (!written.ok) {
      verifyFailed = true;
      report.push(`  VERIFY-FAIL: ${relative(process.cwd(), idx.absolute)}`);
      continue;
    }
    const rel = relative(process.cwd(), idx.absolute);
    report.push(`  progress:   ${rel} (${updated.join(', ')})`);
  }
  return { report, verifyFailed };
}

/**
 * @purpose Execute gennady sdd-sync — read the ticket Status and bring matching tracker rows into agreement, verifying each write.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param [projectRoot] Canonical ticket/index root; defaults to cwd.
 * @returns SyncOutcome — a per-index report on success, else an actionable failure.
 */
export async function run(rawArgs: string[], projectRoot = resolve('.')): Promise<SyncOutcome> {
  const args = parseArgs(rawArgs, {});
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-sync'
  );

  const ticket = positional[0];
  if (!ticket) return badInvocation('missing <ticket>');

  const root = realpathSync(resolve(projectRoot));
  const resolved = resolveTicketArg(ticket, root);
  if (!resolved.ok) {
    if (resolved.reason === 'unreadable') return fileError(ticket);
    if (resolved.reason === 'unsafe-path' || resolved.reason === 'unsafe-corpus') {
      return fileError(`${ticket} (${resolved.detail})`);
    }
    if (resolved.reason === 'unknown-id') return unknownIdError(ticket, resolved.refs);
    if (resolved.reason === 'ambiguous-id') return ambiguousIdError(ticket, resolved.matches, root);
    return fileError(ticket);
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

  let indexSet: IndexSet;
  if (positional.length > 1) {
    const indexes: RepoFileIdentity[] = [];
    for (const raw of positional.slice(1)) {
      const proven = proveRepoFile(root, raw);
      if (!proven.ok) return fileError(`${raw} (${proven.detail})`);
      if (!isAllowedOwnerIndex(ticketPath, proven.identity)) {
        return fileError(
          `${raw} (index must be specs/3-tasks.md or an owning specs/**/<owner>.3-tasks.md)`
        );
      }
      indexes.push(proven.identity);
    }
    indexSet = { ok: true, indexes };
  } else {
    indexSet = discoverIndexes(root, ticketPath);
  }
  if (!indexSet.ok) return fileError(`index discovery (${indexSet.detail})`);
  const indexes = indexSet.indexes;
  const ticketStillSame = revalidateRepoFile(resolved.identity);
  if (!ticketStillSame.ok) return fileError(`${ticket} (${ticketStillSame.detail})`);
  logger.debug(`[SddSyncCommand#run] ${taskId} → ${status}; ${indexes.length} index file(s)`);

  // #region START_SYNC — invariant: update each index; verify the write took before reporting updated
  const report: string[] = [];
  let verifyFailed = false;
  for (const idx of indexes) {
    const rel = relative(process.cwd(), idx.absolute);
    const observed = readProvenRepoFile(idx);
    if (!observed.ok) {
      verifyFailed = true;
      report.push(`  unreadable: ${rel}`);
      continue;
    }
    const idxContent = observed.content;
    const upd = updateTrackerStatus(idxContent, taskId, status);
    if (!upd.ok) {
      report.push(`  ${upd.reason === 'task_not_found' ? 'no-row' : 'no-table'}:   ${rel}`);
      continue;
    }
    if (!upd.changed) {
      report.push(`  in-sync:    ${rel}`);
      continue;
    }
    const written = writeProvenRepoFile(idx, upd.text);
    if (!written.ok) {
      verifyFailed = true;
      report.push(`  VERIFY-FAIL: ${rel}`);
      continue;
    }
    const reread = readProvenRepoFile(idx);
    const reverify = reread.ok
      ? updateTrackerStatus(reread.content, taskId, status)
      : { ok: false as const, reason: 'no_table' as const };
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
  const progress = recomputeProgress(root, indexes);
  report.push(...progress.report);
  verifyFailed ||= progress.verifyFailed;

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
