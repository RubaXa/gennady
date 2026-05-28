// @file: Sync command types — SyncOptions, SyncFileEntry, SyncResult
// @consumers: sync-core.ts, sync-formatter.ts, sync.cmd.ts
// @tasks: TSK-53, TSK-54

/** @purpose Discriminated status of a synced file: new, changed, or identical */
export type SyncFileStatus = 'added' | 'updated' | 'unchanged';

export interface SyncOptions {
  /** Абсолютный путь к ai/directives/ в npm-пакете */
  sourceDir: string;
  /** Абсолютный путь к <cwd>/ai/directives/ */
  targetDir: string;
  /** Опциональный фильтр: имена поддиректорий внутри ai/directives/ */
  subdirs?: string[];
  /** Предпросмотр без записи */
  dryRun?: boolean;
}

export interface SyncFileEntry {
  /** Путь относительно ai/directives/ (например, sdd/discovery.directive.xml) */
  relativePath: string;
  status: SyncFileStatus;
  sourceSize?: number;
  targetSize?: number;
}

export class SyncResult {
  readonly entries: SyncFileEntry[];

  constructor(entries: SyncFileEntry[]) {
    this.entries = entries;
  }

  get added(): SyncFileEntry[] {
    return this.entries.filter((e) => e.status === 'added');
  }

  get updated(): SyncFileEntry[] {
    return this.entries.filter((e) => e.status === 'updated');
  }

  get unchanged(): SyncFileEntry[] {
    return this.entries.filter((e) => e.status === 'unchanged');
  }

  get summary(): string {
    const a = this.added.length;
    const u = this.updated.length;
    const s = this.unchanged.length;
    return `Synced: ${a} added, ${u} updated, ${s} skipped (unchanged)`;
  }

  get dryRunSummary(): string {
    return 'Dry-run: no files written.';
  }
}

export const ERR_SYNC_SUBDIR_NOT_FOUND = 'ERR_SYNC_SUBDIR_NOT_FOUND';
export const ERR_SYNC_PKG_NOT_FOUND = 'ERR_SYNC_PKG_NOT_FOUND';
export const ERR_SYNC_SOURCE_NOT_FOUND = 'ERR_SYNC_SOURCE_NOT_FOUND';
