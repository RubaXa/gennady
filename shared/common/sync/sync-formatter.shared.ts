// @file: Shared sync formatter — formatSyncOutput with markers and summary
// @consumers: sync.cmd.ts, sync-skills.cmd.ts
// @tasks: TSK-56

/** @purpose Entry shape for the shared formatter: status discriminator and relative path. */
export type SyncFormatEntry = {
  /** @purpose Sync status discriminator. */
  status: 'added' | 'updated' | 'deleted' | 'unchanged';
  /** @purpose File path relative to the sync root. */
  relativePath: string;
};

/** @purpose Options for formatSyncOutput: dryRun toggles preview labels. */
export type SyncFormatOptions = {
  /** @purpose When true, outputs preview labels instead of writing. */
  dryRun?: boolean;
};

const MARKER_ADDED = '+';
const MARKER_UPDATED = '~';
const MARKER_DELETED = '-';
const MARKER_UNCHANGED = '=';

const LABEL_UNCHANGED = '(unchanged)';
const LABEL_WOULD_ADD = '(would add)';
const LABEL_WOULD_UPDATE = '(would update)';
const LABEL_WOULD_DELETE = '(would delete)';
const LABEL_UNCHANGED_SKIP = '(unchanged, skip)';

/**
 * @purpose Format a list of sync entries into stdout lines with markers and a summary.
 * @param entries List of entries with status and relative path.
 * @param [opts] Formatting options — dryRun enables preview labels.
 * @returns Array of formatted lines; the last line is the summary.
 */
export function formatSyncOutput(
  entries: SyncFormatEntry[],
  opts: SyncFormatOptions = {}
): string[] {
  const lines: string[] = [];

  for (const entry of entries) {
    const { relativePath, status } = entry;
    let marker: string;
    let label: string;

    if (status === 'added') {
      marker = MARKER_ADDED;
      label = opts.dryRun ? LABEL_WOULD_ADD : '';
    } else if (status === 'updated') {
      marker = MARKER_UPDATED;
      label = opts.dryRun ? LABEL_WOULD_UPDATE : '';
    } else if (status === 'deleted') {
      marker = MARKER_DELETED;
      label = opts.dryRun ? LABEL_WOULD_DELETE : '';
    } else {
      marker = MARKER_UNCHANGED;
      label = opts.dryRun ? LABEL_UNCHANGED_SKIP : LABEL_UNCHANGED;
    }

    const paddedPath = relativePath.padEnd(64);
    if (label) {
      lines.push(`  ${marker} ${paddedPath} ${label}`);
    } else {
      lines.push(`  ${marker} ${relativePath}`);
    }
  }

  const added = entries.filter((e) => e.status === 'added').length;
  const updated = entries.filter((e) => e.status === 'updated').length;
  const unchanged = entries.filter((e) => e.status === 'unchanged').length;
  const deleted = entries.filter((e) => e.status === 'deleted').length;

  if (opts.dryRun) {
    lines.push('Dry-run: no files written.');
  } else {
    let summary = `Synced: ${added} added, ${updated} updated, ${unchanged} skipped (unchanged)`;
    if (deleted > 0) {
      summary += `, ${deleted} deleted`;
    }
    lines.push(summary);
  }

  return lines;
}
