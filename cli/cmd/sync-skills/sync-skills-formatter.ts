// @file: SyncSkills formatter — format entries grouped by skill with markers and padding
// @consumers: SyncSkillsCmd, sync-skills-formatter.test.ts
// @tasks: TSK-57

import type { SyncSkillsFileEntry, SyncSkillsFileStatus } from './sync-skills.types.ts';

/** @purpose Formatting options for the sync-skills formatter. */
export type SyncSkillsFormatOptions = {
  /** @purpose Preview mode — shows would-be actions without writing. */
  dryRun?: boolean;
};

const LABEL_WOULD_ADD = '(would add)';
const LABEL_WOULD_UPDATE = '(would update)';
const LABEL_WOULD_DELETE = '(would delete)';
const LABEL_UNCHANGED_SKIP = '(unchanged, skip)';
const LABEL_UNCHANGED = '(unchanged)';

const STATUS_ORDER: Record<SyncSkillsFileStatus, number> = {
  added: 0,
  updated: 1,
  deleted: 2,
  deleteFailed: 3,
  unchanged: 4,
};

/** @purpose Per-entry dry-run label — used by the mixed-status renderer so every entry keeps its own status. */
function dryRunEntryLabel(e: SyncSkillsFileEntry): string {
  switch (e.status) {
    case 'added':
      return LABEL_WOULD_ADD;
    case 'updated':
      return LABEL_WOULD_UPDATE;
    case 'deleted':
      return LABEL_WOULD_DELETE;
    case 'deleteFailed':
      return `(delete failed: ${e.errorCode ?? 'UNKNOWN'})`;
    default:
      return '';
  }
}

/** @purpose Per-entry live-mode suffix — same purpose as dryRunEntryLabel, for the non-dry-run path. */
function liveEntrySuffix(e: SyncSkillsFileEntry): string {
  switch (e.status) {
    case 'added':
      return ' (added)';
    case 'updated':
      return ' (updated)';
    case 'deleted':
      return ' (deleted)';
    case 'deleteFailed':
      return ` (delete failed: ${e.errorCode ?? 'UNKNOWN'})`;
    default:
      return '';
  }
}

/**
 * @purpose Format sync-skills entries into stdout lines grouped by skill with markers.
 * @param entries List of sync-skills file entries.
 * @param [opts] Formatting options — dryRun enables preview labels.
 * @returns Array of formatted lines; the last line is the summary.
 */
export function format(
  entries: SyncSkillsFileEntry[],
  opts: SyncSkillsFormatOptions = {}
): string[] {
  const dryRun = opts.dryRun === true;

  if (entries.length === 0) {
    if (dryRun) return ['Dry-run: no files written.'];
    return ['Synced: 0 added, 0 updated, 0 skipped, 0 deleted'];
  }

  // #region START_GROUP — invariant: group entries by skillName, determine dominant status per group
  const skillGroups = new Map<
    string,
    { entries: SyncSkillsFileEntry[]; dominantStatus: SyncSkillsFileStatus }
  >();

  for (const entry of entries) {
    let group = skillGroups.get(entry.skillName);
    if (!group) {
      group = { entries: [], dominantStatus: 'unchanged' };
      skillGroups.set(entry.skillName, group);
    }
    group.entries.push(entry);

    const rank = STATUS_ORDER[entry.status];
    const currentRank = STATUS_ORDER[group.dominantStatus];
    if (rank < currentRank) {
      group.dominantStatus = entry.status;
    }
  }

  const sortedGroups = [...skillGroups.entries()].sort(([nameA, a], [nameB, b]) => {
    const rankDiff = STATUS_ORDER[a.dominantStatus] - STATUS_ORDER[b.dominantStatus];
    if (rankDiff !== 0) return rankDiff;
    return nameA.localeCompare(nameB);
  });
  // #endregion END_GROUP

  // #region START_COMPUTE_PADDING — invariant: pad to max skill-name prefix width across all group headers
  const maxPrefixLen = Math.max(...sortedGroups.map(([name]) => `  _ ${name}/`.length));
  const labelColumn = maxPrefixLen + 4;
  // #endregion END_COMPUTE_PADDING

  const lines: string[] = [];

  // A sentinel entry (relativePath === '') marks a whole-skill orphan operation (deleteOrphan) and
  // never coexists with added/updated entries for the same skillName (collectAndCompareSkills
  // removes a name from the orphan set once matched to a source skill) — so hasSentinel cleanly
  // tells a whole-skill delete/deleteFailed apart from in-skill file-level changes below.
  // Regression guard for the generic branch: a single "dominant" marker used to filter the file
  // list to just that one status, so a skill with e.g. both an updated SKILL.md and a deleted
  // stray file rendered as "updated" only — the deletion silently vanished, in dry-run AND live.
  // #region START_FORMAT_GROUPS — invariant: every non-unchanged entry visible under its own status, even in a mixed group
  for (const [skillName, group] of sortedGroups) {
    const dominant = group.dominantStatus;
    const hasSentinel = group.entries.some((e) => e.relativePath === '');

    if (dominant === 'unchanged') {
      const marker = '=';
      const header = `  ${marker} ${skillName}/`;
      const label = dryRun ? LABEL_UNCHANGED_SKIP : LABEL_UNCHANGED;
      lines.push(header.padEnd(labelColumn) + label);
      continue;
    }

    if (hasSentinel && dominant === 'deleteFailed') {
      const marker = '!';
      const code = group.entries.find((e) => e.errorCode)?.errorCode ?? 'UNKNOWN';
      const header = `  ${marker} ${skillName}/`;
      lines.push(header.padEnd(labelColumn) + `(delete failed: ${code})`);
      continue;
    }

    if (hasSentinel && dominant === 'deleted') {
      const marker = '-';
      const header = `  ${marker} ${skillName}/`;
      if (dryRun) {
        lines.push(header.padEnd(labelColumn) + LABEL_WOULD_DELETE);
      } else {
        lines.push(header);
      }

      for (const e of group.entries
        .filter((e) => e.relativePath !== '')
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
        lines.push(`      ${e.relativePath}`);
      }
      continue;
    }

    const marker =
      dominant === 'added'
        ? '+'
        : dominant === 'updated'
          ? '~'
          : dominant === 'deleted'
            ? '-'
            : '!';
    const header = `  ${marker} ${skillName}/`;
    lines.push(header);

    const changed = group.entries
      .filter((e) => e.status !== 'unchanged')
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    for (const e of changed) {
      const line = `      ${e.relativePath}`;
      if (dryRun) {
        lines.push(line.padEnd(labelColumn) + dryRunEntryLabel(e));
      } else {
        lines.push(line + liveEntrySuffix(e));
      }
    }
  }
  // #endregion END_FORMAT_GROUPS

  // #region START_SUMMARY — invariant: summary line includes counts, deleteFailed counted separately
  const added = entries.filter((e) => e.status === 'added').length;
  const updated = entries.filter((e) => e.status === 'updated').length;
  const skipped = entries.filter((e) => e.status === 'unchanged').length;
  const deleted = entries.filter((e) => e.status === 'deleted').length;
  const failed = entries.filter((e) => e.status === 'deleteFailed').length;

  if (dryRun) {
    lines.push('Dry-run: no files written.');
  } else {
    let summary = `Synced: ${added} added, ${updated} updated, ${skipped} skipped, ${deleted} deleted`;
    if (failed > 0) summary += `, ${failed} delete failed`;
    lines.push(summary);
  }
  // #endregion END_SUMMARY

  return lines;
}
