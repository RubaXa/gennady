// @file: SyncSkills types — SyncSkillsOptions, SyncSkillsFileEntry, SyncSkillsResult
// @consumers: SyncSkillsCore, SyncSkillsFormatter, SyncSkillsCmd
// @tasks: TSK-57

/** @purpose Discriminated status of a synced skill file. */
export type SyncSkillsFileStatus =
  | 'added'
  | 'updated'
  | 'deleted'
  | 'unchanged'
  | 'deleteFailed';

/** @purpose Options for the sync-skills command. */
export type SyncSkillsOptions = {
  /** @purpose Absolute path to ai/skills/ in the npm package. */
  sourceDir: string;
  /** @purpose Absolute path to <cwd>/.claude/skills/. */
  targetDir: string;
  /** @purpose Optional filter: skill directory names. */
  skillNames?: string[];
  /** @purpose Preview without writing. */
  dryRun?: boolean;
};

/** @purpose A single file entry in the sync-skills result. */
export type SyncSkillsFileEntry = {
  /** @purpose Skill directory name (e.g., sdd-execute). */
  skillName: string;
  /** @purpose Path relative to the skill root (e.g., SKILL.md, scripts/verify.sh). */
  relativePath: string;
  /** @purpose Sync status. */
  status: SyncSkillsFileStatus;
  /** @purpose Size of the source file in bytes. */
  sourceSize?: number;
  /** @purpose Size of the target file in bytes (updated/unchanged only). */
  targetSize?: number;
  /** @purpose OS error code for deleteFailed entries. */
  errorCode?: string;
};

/** @purpose Aggregated result of a sync-skills operation with computed summaries. */
export class SyncSkillsResult {
  /** @purpose List of all synced file entries, sorted lexicographically by skillName then relativePath. */
  readonly entries: SyncSkillsFileEntry[];

  /**
   * @purpose Construct a SyncSkillsResult from a list of entries.
   * @param entries File entries.
   */
  constructor(entries: SyncSkillsFileEntry[]) {
    this.entries = entries;
  }

  /** @purpose Files with status "added". | @returns Array of added entries. */
  get added(): SyncSkillsFileEntry[] {
    return this.entries.filter((e) => e.status === 'added');
  }

  /** @purpose Files with status "updated". | @returns Array of updated entries. */
  get updated(): SyncSkillsFileEntry[] {
    return this.entries.filter((e) => e.status === 'updated');
  }

  /** @purpose Files with status "deleted". | @returns Array of deleted entries. */
  get deleted(): SyncSkillsFileEntry[] {
    return this.entries.filter((e) => e.status === 'deleted');
  }

  /** @purpose Files with status "unchanged". | @returns Array of unchanged entries. */
  get unchanged(): SyncSkillsFileEntry[] {
    return this.entries.filter((e) => e.status === 'unchanged');
  }

  /** @purpose Files with status "deleteFailed". | @returns Array of delete-failed entries. */
  get deleteFailed(): SyncSkillsFileEntry[] {
    return this.entries.filter((e) => e.status === 'deleteFailed');
  }

  /** @purpose Human-readable summary of sync counts. | @returns Summary string. */
  get summary(): string {
    const a = this.added.length;
    const u = this.updated.length;
    const s = this.unchanged.length;
    const d = this.deleted.length;
    const f = this.deleteFailed.length;
    let text = `Synced: ${a} added, ${u} updated, ${s} skipped, ${d} deleted`;
    if (f > 0) text += `, ${f} delete failed`;
    return text;
  }

  /** @purpose Dry-run summary message. | @returns Dry-run message. */
  get dryRunSummary(): string {
    return 'Dry-run: no files written.';
  }
}

/** @purpose Error code: source directory not found. */
export const ERR_SKILLS_SOURCE_NOT_FOUND = 'ERR_SKILLS_SOURCE_NOT_FOUND';
/** @purpose Error code: skill name not found in source. */
export const ERR_SKILLS_SKILL_NOT_FOUND = 'ERR_SKILLS_SKILL_NOT_FOUND';
