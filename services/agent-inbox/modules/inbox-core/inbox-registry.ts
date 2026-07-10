// @file: InboxRegistry wrapper — delta computation, promote, atomic save over CLI registry logic.
// @consumers: StateStore, CLI inbox commands
// @tasks: TSK-109

import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '#logger';
import {
  loadRegistry as loadRegistryRaw,
  saveRegistry as saveRegistryRaw,
  promoteReviewedHead,
  type InboxRegistry,
} from '../../../../cli/cmd/inbox/_core/logic/inbox-registry.logic.ts';

/** @purpose Tag for a delta entry — MR is brand-new to the registry. */
export type DeltaTag = 'NEW';

/** @purpose Tag for a delta entry — MR updatedAt changed since last sighting (↑). */
export type DeltaTagUpdated = '↑';

/** @purpose Tag for a delta entry — MR unchanged since last classification. */
export type DeltaTagIdle = 'idle';

/** @purpose Single delta entry for a given MR webUrl. */
export type DeltaEntry = {
  /** @purpose MR webUrl key */
  webUrl: string;
  /** @purpose Delta classification tag */
  tag: DeltaTag | DeltaTagUpdated | DeltaTagIdle;
};

/** @purpose Result of delta computation — only NEW and ↑ entries are actionable; idle entries are skipped. */
export type DeltaResult = {
  /** @purpose Newly discovered MRs */
  NEW: DeltaEntry[];
  /** @purpose MRs whose updatedAt changed since last check */
  '↑': DeltaEntry[];
};

/** @purpose Minimal MR info needed for delta computation — extracted from ActionableMr. */
export type MrForDelta = {
  /** @purpose MR web URL */
  webUrl: string;
  /** @purpose MR project full path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose MR updatedAt timestamp */
  updatedAt: string;
};

/**
 * @purpose Abstractions over the inbox MR registry persisted at `<stateDir>/inbox-registry.json`.
 * @invariant Delta computation separates NEW, ↑, and idle MRs without mutating registry until explicit save.
 * @invariant promoteReviewedHeadSha returns a copy; original is never mutated.
 */
export class InboxRegistryAccess {
  /** @purpose Root state directory path. */
  protected _stateDir: string;
  /** @purpose Cached registry (null until loaded). */
  protected _registry: InboxRegistry | null;

  /**
   * @purpose Create an InboxRegistryAccess instance bound to a state directory.
   * @param [stateDir] Root state directory (defaults to ~/.gennady).
   */
  constructor(stateDir?: string) {
    this._stateDir = stateDir ?? join(homedir(), '.gennady');
    this._registry = null;
  }

  /**
   * @purpose Absolute path to inbox-registry.json under the state dir.
   * @returns Full path to the registry file.
   */
  get registryPath(): string {
    return join(this._stateDir, 'inbox-registry.json');
  }

  /**
   * @purpose Load the registry from disk.
   * @invariant Missing file → empty registry, not an error.
   * @returns Loaded registry entries.
   */
  load(): InboxRegistry {
    logger.debug('[InboxRegistryAccess#load] [idle → loading]', { path: this.registryPath });
    this._registry = loadRegistryRaw(this.registryPath);
    const count = Object.keys(this._registry.entries).length;
    logger.debug('[InboxRegistryAccess#load] [loading → loaded]', {
      count,
      path: this.registryPath,
    });
    return this._registry;
  }

  /**
   * @purpose Compute delta between current MRs and the registry.
   * @invariant Does NOT mutate the registry — only classifies MRs.
   * @param mrs List of MRs from VCS to compute delta for.
   * @returns Delta result with NEW and ↑ entries; idle entries are skipped.
   */
  updateDelta(mrs: MrForDelta[]): DeltaResult {
    if (!this._registry) this.load();

    logger.debug('[InboxRegistryAccess#updateDelta] [idle → computing]', { mrCount: mrs.length });

    // #region START_COMPUTE_DELTA
    const result: DeltaResult = { NEW: [], '↑': [] };

    for (const mr of mrs) {
      const existing = this._registry!.entries[mr.webUrl];
      if (!existing) {
        // #region START_DELTA_NEW — MR never seen before
        const now = new Date().toISOString();
        this._registry!.entries[mr.webUrl] = {
          project: mr.project,
          iid: mr.iid,
          role: null,
          stage: '',
          lastSeenUpdatedAt: mr.updatedAt,
          firstSeenAt: now,
          lastClassifiedAt: now,
        };
        result.NEW.push({ webUrl: mr.webUrl, tag: 'NEW' });
        // #endregion END_DELTA_NEW
      } else if (existing.lastSeenUpdatedAt !== mr.updatedAt) {
        // #region START_DELTA_UPDATED — MR updated since last sighting
        existing.lastSeenUpdatedAt = mr.updatedAt;
        result['↑'].push({ webUrl: mr.webUrl, tag: '↑' });
        // #endregion END_DELTA_UPDATED
      }
      // idle entries are intentionally omitted from the result
    }

    logger.info('[InboxRegistryAccess#updateDelta] [computing → computed]', {
      NEW: result.NEW.length,
      '↑': result['↑'].length,
    });
    return result;
    // #endregion END_COMPUTE_DELTA
  }

  /**
   * @purpose Promote candidateHeadSha → lastReviewedHeadSha for a given MR ref.
   *   Returns a shallow copy; original registry (including in-memory) is not mutated.
   * @param webUrl MR web URL to promote head sha for.
   * @returns Updated registry with promoted head sha.
   */
  promoteReviewedHeadSha(webUrl: string): InboxRegistry {
    if (!this._registry) this.load();

    logger.debug('[InboxRegistryAccess#promoteReviewedHeadSha] [idle → promoting]', { webUrl });

    // #region START_RESOLVE_REF_AND_PROMOTE
    // invariant: extract project+iid from registry entry, then delegate to low-level promoteReviewedHead
    const entry = this._registry!.entries[webUrl];
    if (!entry) {
      logger.debug(
        '[InboxRegistryAccess#promoteReviewedHeadSha] [promoting → not_found] Entry not in registry',
        { webUrl }
      );
      return this._registry!;
    }

    const ref = `${entry.project}!${entry.iid}`;
    const updated = promoteReviewedHead(this._registry!, ref);
    this._registry = updated;
    logger.info('[InboxRegistryAccess#promoteReviewedHeadSha] [promoting → promoted]', {
      webUrl,
      ref,
    });
    return updated;
    // #endregion END_RESOLVE_REF_AND_PROMOTE
  }

  /**
   * @purpose Atomically persist the registry to disk.
   * @sideEffect Creates parent directories, writes file via tmp + rename.
   */
  save(): void {
    if (!this._registry) {
      logger.debug('[InboxRegistryAccess#save] [idle → skipped] No registry loaded to save');
      return;
    }

    logger.debug('[InboxRegistryAccess#save] [idle → saving]', { path: this.registryPath });

    // #region START_PERSIST_REGISTRY
    try {
      saveRegistryRaw(this.registryPath, this._registry);
      logger.info('[InboxRegistryAccess#save] [saving → saved]', {
        path: this.registryPath,
        entryCount: Object.keys(this._registry.entries).length,
      });
    } catch (cause) {
      const error = new Error('[InboxRegistryAccess#save] Atomic save failed', { cause });
      logger.error('[InboxRegistryAccess#save] [saving → failed]', { error });
      throw error;
    }
    // #endregion END_PERSIST_REGISTRY
  }
}
