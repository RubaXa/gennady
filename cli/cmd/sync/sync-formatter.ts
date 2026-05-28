// @file: Sync formatter — format SyncFileEntry[] to stdout lines
// @consumers: sync.cmd.ts, sync-formatter.test.ts
// @tasks: TSK-53, TSK-54

import type { SyncFileEntry } from './sync.types.ts';

interface FormatOpts {
  dryRun?: boolean;
}

const MARKER_ADDED = '+';
const MARKER_UPDATED = '~';
const MARKER_UNCHANGED = '=';

const LABEL_UNCHANGED = '(unchanged)';
const LABEL_WOULD_ADD = '(would add)';
const LABEL_WOULD_UPDATE = '(would update)';
const LABEL_UNCHANGED_SKIP = '(unchanged, skip)';

/**
 * @purpose Форматировать список файлов в строки для stdout.
 * Порядок строк соответствует порядку entries.
 * Последняя строка — итог.
 */
export function formatEntries(entries: SyncFileEntry[], opts: FormatOpts = {}): string[] {
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

  if (opts.dryRun) {
    lines.push('Dry-run: no files written.');
  } else {
    lines.push(`Synced: ${added} added, ${updated} updated, ${unchanged} skipped (unchanged)`);
  }

  return lines;
}
