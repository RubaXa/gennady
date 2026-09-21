// @file: Sync formatter — re-exports formatSyncOutput from shared, backward-compat formatEntries alias
// @spec: CLI-SYNC
// @consumers: sync.cmd.ts, sync-formatter.test.ts

import { formatSyncOutput as _formatSyncOutput } from '../../../shared/common/sync/sync-formatter.shared.ts';
import type { SyncFileEntry } from './sync.types.ts';

export { formatSyncOutput } from '../../../shared/common/sync/sync-formatter.shared.ts';

/**
 * @purpose Backward-compat alias for shared formatSyncOutput.
 * @param entries List of sync file entries.
 * @param [opts] Formatting options.
 * @returns Array of formatted stdout lines.
 */
export function formatEntries(entries: SyncFileEntry[], opts?: { dryRun?: boolean }): string[] {
  return _formatSyncOutput(entries, opts);
}
