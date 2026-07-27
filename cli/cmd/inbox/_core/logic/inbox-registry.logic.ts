// @file: Persistent global registry of inbox MRs we have already classified.
// @consumers: inbox.cmd
// @tasks: N/A, TSK-94

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type { VcsActionableRole } from '../../../../../services/vcs-client/entities/vcs-actionable-mr.type.ts';

/** @purpose What we remember about one MR across ticks. */
export type RegistryEntry = {
  /** @purpose Project full path */
  project: string;
  /** @purpose Merge request internal ID */
  iid: string;
  /** @purpose Role at last sighting */
  role: VcsActionableRole | null;
  /** @purpose Delta stage recorded at last classification */
  stage: string;
  /** @purpose MR updatedAt at last classification — basis for the next delta */
  lastSeenUpdatedAt: string;
  /** @purpose ISO timestamp when this MR first entered the inbox */
  firstSeenAt: string;
  /** @purpose ISO timestamp of the last classification touch */
  lastClassifiedAt: string;
  /** @purpose HEAD SHA at last sighting — basis for detecting new commits since last classification */
  candidateHeadSha?: string;
  /** @purpose HEAD SHA at the last completed review — basis for headChanged delta */
  lastReviewedHeadSha?: string;
  /** @purpose HEAD SHA at which I last approved — set when myLogin is in approvedBy; basis for approval-reset detection */
  lastApprovedHeadSha?: string;
  /** @purpose Role the operator explicitly assigned (SV-08) | @invariant Distinct from `role` (last-sighting classification) — survives restarts and is restored regardless of role activation */
  assignedRole?: string;
  /** @purpose ISO timestamp of that explicit assignment */
  assignedAt?: string;
};

/** @purpose The whole registry document persisted to disk. */
export type InboxRegistry = {
  /** @purpose Schema version for future migrations */
  version: number;
  /** @purpose Entries keyed by MR webUrl */
  entries: Record<string, RegistryEntry>;
};

const EMPTY: InboxRegistry = { version: 1, entries: {} };

/**
 * @purpose Load the registry, tolerating a missing or corrupt file.
 * @param path Registry file path.
 * @returns Parsed registry, or an empty one when absent/unreadable.
 * @sideEffect Reads the file system.
 * @consumer inbox.cmd
 */
export function loadRegistry(path: string): InboxRegistry {
  if (!existsSync(path)) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as InboxRegistry;
    return parsed && typeof parsed === 'object' && parsed.entries ? parsed : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * @purpose Persist the registry atomically (write temp + rename).
 * @param path Registry file path.
 * @param registry Registry document to write.
 * @sideEffect Creates the parent directory and writes the file system.
 * @consumer inbox.cmd
 */
export function saveRegistry(path: string, registry: InboxRegistry): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf8');
  renameSync(tmp, path);
}

/**
 * @purpose Promote candidateHeadSha → lastReviewedHeadSha, leaving candidateHeadSha unchanged.
 *   Returns a shallow copy of the registry; original is not mutated.
 * @param registry Current registry.
 * @param ref MR reference in `group/project!iid` format.
 * @returns New registry with promoted head sha, or unchanged registry when entry not found.
 * @consumer inbox.cmd
 */
export function promoteReviewedHead(registry: InboxRegistry, ref: string): InboxRegistry {
  // #region START_RESOLVE_ENTRY_BY_REF
  // invariant: ref format is `group/project!iid`; no-op on invalid format
  const sep = ref.lastIndexOf('!');
  if (sep === -1) return registry;
  const project = ref.slice(0, sep);
  const iid = ref.slice(sep + 1);
  // #endregion END_RESOLVE_ENTRY_BY_REF

  // #region START_FIND_AND_PROMOTE_ENTRY
  const entries = { ...registry.entries };
  let found = false;
  for (const [webUrl, entry] of Object.entries(entries)) {
    if (entry.project === project && entry.iid === iid) {
      // invariant: only promote when candidateHeadSha is a non-empty truthy value
      if (entry.candidateHeadSha) {
        entries[webUrl] = {
          ...entry,
          lastReviewedHeadSha: entry.candidateHeadSha,
        };
      }
      found = true;
      break;
    }
  }
  // #endregion END_FIND_AND_PROMOTE_ENTRY

  // invariant: return original registry when no entry was matched
  if (!found) return registry;
  return { ...registry, entries };
}

/**
 * @purpose Reset inbox state to a clean slate: drop the registry (delta/stage memory)
 *   and all prepared drafts.
 * @param registryPath Registry file path.
 * @param outDir Drafts output directory.
 * @returns Which targets were actually removed.
 * @sideEffect FS: deletes the registry file and the output directory.
 * @consumer inbox.cmd
 */
export function resetInboxState(
  registryPath: string,
  outDir: string
): { registryRemoved: boolean; outRemoved: boolean } {
  let registryRemoved = false;
  let outRemoved = false;
  if (existsSync(registryPath)) {
    rmSync(registryPath, { force: true });
    registryRemoved = true;
  }
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
    outRemoved = true;
  }
  return { registryRemoved, outRemoved };
}
