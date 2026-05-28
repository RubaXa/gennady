// @file: Sync command types — SyncOptions, SyncFileEntry, SyncResult
// @consumers: sync-core.ts, sync-formatter.ts, sync.cmd.ts
// @tasks: TSK-53, TSK-54

/** @purpose Discriminated status of a synced file: new, changed, or identical. */
export type SyncFileStatus = 'added' | 'updated' | 'unchanged';

/** @purpose Options for the sync command. */
export interface SyncOptions {
  /** @purpose Absolute path to ai/directives/ in the npm package. */
  sourceDir: string;
  /** @purpose Absolute path to <cwd>/ai/directives/. */
  targetDir: string;
  /** @purpose Optional filter: subdirectory names inside ai/directives/. */
  subdirs?: string[];
  /** @purpose Preview without writing. */
  dryRun?: boolean;
}

/** @purpose A single file entry in the sync result. */
export interface SyncFileEntry {
  /** @purpose Path relative to ai/directives/ (e.g., sdd/discovery.directive.xml). */
  relativePath: string;
  /** @purpose Sync status: added, updated, or unchanged. */
  status: SyncFileStatus;
  /** @purpose Size of the source file in bytes. */
  sourceSize?: number;
  /** @purpose Size of the target file in bytes. */
  targetSize?: number;
}

/** @purpose Aggregated result of a sync operation with computed summaries. */
export class SyncResult {
  /** @purpose List of all synced file entries. */
  readonly entries: SyncFileEntry[];

  /** @purpose Construct a SyncResult from a list of entries. | @param entries File entries. */
  constructor(entries: SyncFileEntry[]) {
    this.entries = entries;
  }

  /** @purpose Files with status "added". | @returns Array of added entries. */
  get added(): SyncFileEntry[] {
    return this.entries.filter((e) => e.status === 'added');
  }

  /** @purpose Files with status "updated". | @returns Array of updated entries. */
  get updated(): SyncFileEntry[] {
    return this.entries.filter((e) => e.status === 'updated');
  }

  /** @purpose Files with status "unchanged". | @returns Array of unchanged entries. */
  get unchanged(): SyncFileEntry[] {
    return this.entries.filter((e) => e.status === 'unchanged');
  }

  /** @purpose Human-readable summary of added/updated/unchanged counts. | @returns Summary string. */
  get summary(): string {
    const a = this.added.length;
    const u = this.updated.length;
    const s = this.unchanged.length;
    return `Synced: ${a} added, ${u} updated, ${s} skipped (unchanged)`;
  }

  /** @purpose Dry-run summary message. | @returns Dry-run message. */
  get dryRunSummary(): string {
    return 'Dry-run: no files written.';
  }
}

/** @purpose Error code: subdirectory not found in source. */
export const ERR_SYNC_SUBDIR_NOT_FOUND = 'ERR_SYNC_SUBDIR_NOT_FOUND';
/** @purpose Error code: package not found in node_modules. */
export const ERR_SYNC_PKG_NOT_FOUND = 'ERR_SYNC_PKG_NOT_FOUND';
/** @purpose Error code: source directory not found. */
export const ERR_SYNC_SOURCE_NOT_FOUND = 'ERR_SYNC_SOURCE_NOT_FOUND';
