// @file: Persistent global registry of inbox MRs we have already classified.
// @consumers: inbox.cmd
// @tasks: N/A

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
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
 * @purpose Resolve the registry file path (global; overridable for tests).
 * @returns Absolute path to the registry JSON.
 * @sideEffect Reads env GENNADY_INBOX_REGISTRY / HOME.
 * @consumer inbox.cmd
 */
export function resolveRegistryPath(): string {
  return process.env.GENNADY_INBOX_REGISTRY ?? join(homedir(), '.gennady', 'inbox-registry.json');
}

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
 * @purpose Resolve the drafts output directory (global; overridable for tests).
 * @returns Absolute path to the inbox-out directory.
 * @sideEffect Reads env GENNADY_INBOX_OUT / HOME.
 * @consumer inbox.cmd
 */
export function resolveOutDir(): string {
  return process.env.GENNADY_INBOX_OUT ?? join(homedir(), '.gennady', 'inbox-out');
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
