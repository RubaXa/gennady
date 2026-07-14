// @file: state-seed — parse/apply a seed.json document into the StateStore registry (fresh /
//   reviewed@headSha) so a run-mode pass starts from a known prior-review state instead of an
//   empty registry.
// @consumers: run-mode.ts, cli/cmd/inbox/serve.cmd.ts
// @tasks: TSK-121

import { readFile } from 'node:fs/promises';
import { logger } from '#logger';
import type { StateStore } from '../modules/inbox-core/state-store.ts';
import type { RegistryEntry } from '../../../cli/cmd/inbox/_core/logic/inbox-registry.logic.ts';

/**
 * @purpose One MR's seeded review state.
 * @invariant `headSha` is required when `state === 'reviewed'`; ignored for `'fresh'`.
 */
export type SeedMrState = {
  /** @purpose 'fresh' clears any prior review memory for this MR | 'reviewed' sets a known review baseline */
  state: 'fresh' | 'reviewed';
  /** @purpose HEAD sha the MR was reviewed at — becomes `RegistryEntry.lastReviewedHeadSha` */
  headSha?: string;
};

/** @purpose Whole seed document — per-MR review-state overrides applied before a run-mode pass. */
export type SeedState = {
  /** @purpose Schema version for future migrations */
  version: 1;
  /** @purpose Seeded states keyed by MR web URL */
  mrs: Record<string, SeedMrState>;
};

/**
 * @purpose Validate an untrusted parsed JSON value against the SeedState shape.
 * @param raw Parsed JSON value.
 * @throws {Error} When `mrs` is missing, or any entry has an invalid `state` or a `'reviewed'`
 *   entry missing `headSha`.
 * @returns Validated SeedState.
 */
export function parseSeedState(raw: unknown): SeedState {
  const doc = raw as { mrs?: Record<string, SeedMrState> } | null;
  if (!doc || typeof doc !== 'object' || !doc.mrs || typeof doc.mrs !== 'object') {
    throw new Error('[parseSeedState] Seed document must have an "mrs" object');
  }

  for (const [webUrl, mrSeed] of Object.entries(doc.mrs)) {
    if (mrSeed?.state !== 'fresh' && mrSeed?.state !== 'reviewed') {
      throw new Error(`[parseSeedState] MR "${webUrl}": state must be 'fresh' or 'reviewed'`);
    }
    if (mrSeed.state === 'reviewed' && !mrSeed.headSha) {
      throw new Error(`[parseSeedState] MR "${webUrl}": 'reviewed' state requires headSha`);
    }
  }

  return { version: 1, mrs: doc.mrs };
}

/**
 * @purpose Read and parse a seed.json file from disk.
 * @param path Path to the seed JSON file.
 * @throws {Error} When the file cannot be read/parsed, or fails `parseSeedState` validation.
 * @returns Validated SeedState.
 * @sideEffect Filesystem read.
 */
export async function loadSeedState(path: string): Promise<SeedState> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf-8'));
    return parseSeedState(raw);
  } catch (cause) {
    const error = new Error(`[loadSeedState] Failed to load seed file: ${path}`, { cause });
    logger.error('[loadSeedState] [loading → failed]', { path, error });
    throw error;
  }
}

/**
 * @purpose Derive project/iid from a GitLab MR web URL for a brand-new registry entry.
 * @param webUrl MR web URL.
 * @returns Extracted project and iid, or defaults on parse failure.
 */
function _parseMrUrl(webUrl: string): { project: string; iid: string } {
  try {
    const parsed = new URL(webUrl);
    const match = parsed.pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)/);
    if (match) return { project: match[1], iid: match[2] };
  } catch {
    /* fall through to defaults */
  }
  return { project: 'unknown/project', iid: '0' };
}

/**
 * @purpose Apply a validated seed to the registry: `'fresh'` clears prior review memory;
 *   `'reviewed'` sets `lastReviewedHeadSha` as the prep node's headChanged baseline.
 * @param store State store bound to the target registry.
 * @param seed Validated seed document.
 * @throws {Error} When persisting the updated registry fails.
 * @sideEffect Mutates and persists the registry so a subsequent `store.loadRegistry()`
 *   (RoleScheduler, context-builder) observes the seeded state.
 */
export function applySeedState(store: StateStore, seed: SeedState): void {
  const registry = store.loadRegistry();

  // #region START_APPLY_SEED_ENTRIES — invariant: 'fresh' removes the entry outright rather than
  // clearing individual fields, so no stale stage/lastSeenUpdatedAt survives from a prior run
  for (const [webUrl, mrSeed] of Object.entries(seed.mrs)) {
    if (mrSeed.state === 'fresh') {
      delete registry.entries[webUrl];
      continue;
    }

    const existing = registry.entries[webUrl];
    const { project, iid } = _parseMrUrl(webUrl);
    const now = new Date().toISOString();
    const entry: RegistryEntry = {
      project: existing?.project ?? project,
      iid: existing?.iid ?? iid,
      role: existing?.role ?? null,
      stage: existing?.stage ?? '',
      lastSeenUpdatedAt: existing?.lastSeenUpdatedAt ?? now,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastClassifiedAt: now,
      candidateHeadSha: existing?.candidateHeadSha,
      lastReviewedHeadSha: mrSeed.headSha,
      lastApprovedHeadSha: existing?.lastApprovedHeadSha,
    };
    registry.entries[webUrl] = entry;
  }
  // #endregion END_APPLY_SEED_ENTRIES

  try {
    store.saveRegistry();
  } catch (cause) {
    const error = new Error('[applySeedState] Failed to persist seeded registry', { cause });
    logger.error('[applySeedState] [applying → failed]', { error });
    throw error;
  }

  logger.info('[applySeedState] [idle → applied]', { count: Object.keys(seed.mrs).length });
}
