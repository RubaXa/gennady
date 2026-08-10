// @file: StateStore — unified access point to all file-backed state (config, registry, audit) under ~/.gennady.
// @consumers: inbox-api, inbox-roles, inbox-dashboard, inbox-opencode, CLI
// @tasks: TSK-109, TSK-157, TSK-172, TSK-173

import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { logger } from '#logger';
import { InboxConfig, type ConfigLoadResult } from './inbox-config.ts';
import { InboxRegistryAccess, type MrForDelta, type DeltaResult } from './inbox-registry.ts';
import { AuditLog, type AuditEntry } from './audit-log.ts';
import { type CapabilityRegistry } from './capability-modes.ts';
import type { InboxConfig as InboxConfigRaw } from '../../../../cli/cmd/inbox/_core/logic/inbox-config.logic.ts';
import type { InboxRegistry } from '../../../../cli/cmd/inbox/_core/logic/inbox-registry.logic.ts';
import type { ReviewRuntimeBinding } from './types/review-runtime-binding.type.ts';
import type { ReviewRuntimeProfile } from './runtime-profile.ts';
import { EventJournal } from './event-journal.ts';
import { ReviewConfig } from './review-config.ts';
import { ReviewState } from './state/review-state.ts';

/**
 * @purpose Singleton access to file-backed agent-inbox state: config, registry, audit.
 * @invariant Atomic I/O: all writes use tmp + rename strategy through underlying modules.
 * @invariant State directory is auto-created on first save operation (lazy).
 */
export class StateStore {
  /** @purpose Root state directory path. */
  protected _stateDir: string;
  /** @purpose Config sub-service. */
  protected _config: InboxConfig;
  /** @purpose Registry sub-service. */
  protected _registry: InboxRegistryAccess;
  /** @purpose Audit log sub-service. */
  protected _auditLog: AuditLog;
  /** @purpose Validated profile that selected this state root, when composed by bootstrap. */
  protected _runtimeProfile: ReviewRuntimeProfile | null;

  /**
   * @purpose Create a StateStore with all sub-services bound to the given state directory.
   * @param [state] Root state directory or validated runtime binding (defaults to production compatibility root).
   */
  constructor(state?: string | ReviewRuntimeBinding) {
    // The CLI and its Playwright proof share this explicit override.  It preserves the default
    // operator state while letting a real `gennady inbox serve` process boot against an isolated,
    // journal-seeded directory without test-only dependency injection.
    this._stateDir =
      typeof state === 'string'
        ? state
        : (state?.stateRoot ?? process.env.GENNADY_STATE_DIR ?? join(homedir(), '.gennady'));
    this._runtimeProfile = typeof state === 'object' ? state.profile : null;
    this._config = new InboxConfig(this._stateDir);
    this._registry = new InboxRegistryAccess(this._stateDir);
    this._auditLog = new AuditLog(this._stateDir);
  }

  /**
   * @purpose Load and validate the inbox config.
   * @invariant Absent/corrupt → structured signal `{ configured: false, missing: [...] }`.
   * @returns Config load result with structured signal or full config.
   */
  async loadConfig(): Promise<ConfigLoadResult> {
    logger.debug('[StateStore#loadConfig] [idle → loading]');
    return this._config.load();
  }

  /**
   * @returns Root state directory path.
   */
  getStateDir(): string {
    return this._stateDir;
  }

  /**
   * @purpose Expose the validated runtime profile that owns this store.
   * @returns Immutable profile, or null for legacy explicitly rooted callers.
   */
  getRuntimeProfile(): ReviewRuntimeProfile | null {
    return this._runtimeProfile;
  }

  /**
   * @purpose Atomically update config keys, auto-creating the state directory if needed.
   * @param partial Keys to set on the config.
   * @returns Promise that resolves when the config is saved.
   * @sideEffect Creates `<stateDir>/agent-inbox/` directory; writes config atomically.
   */
  async saveConfig(
    partial: Partial<Pick<InboxConfigRaw, 'reposBase' | 'vcsHost' | 'dryRun'>>
  ): Promise<void> {
    logger.debug('[StateStore#saveConfig] [idle → saving]', { keys: Object.keys(partial) });

    // #region START_ENSURE_STATE_DIR
    // invariant: mkdir is safe to call even if dir exists — ensures state dir before any write
    try {
      await mkdir(join(this._stateDir, 'agent-inbox'), { recursive: true });
    } catch (cause) {
      const error = new Error('[StateStore#saveConfig] Failed to create state directory', {
        cause,
      });
      logger.error('[StateStore#saveConfig] [saving → failed]', { error });
      throw error;
    }
    // #endregion END_ENSURE_STATE_DIR

    await this._config.save(partial);
  }

  /**
   * @purpose Read durable dry-run configuration before external effect paths are assembled.
   * @returns Persisted mode, or undefined when no explicit local preference exists.
   */
  async loadDryRun(): Promise<boolean | undefined> {
    return this._config.loadDryRun();
  }

  // load/delta/promote/save through InboxRegistryAccess

  /**
   * @purpose Load the MR registry from disk.
   * @invariant Missing file → empty registry.
   * @returns Loaded registry.
   */
  loadRegistry(): InboxRegistry {
    logger.debug('[StateStore#loadRegistry] [idle → loading]');
    return this._registry.load();
  }

  /**
   * @purpose Compute delta between current MRs and registry entries.
   * @param mrs MR list from VCS call.
   * @returns Delta result with NEW and ↑ entries.
   */
  updateDelta(mrs: MrForDelta[]): DeltaResult {
    return this._registry.updateDelta(mrs);
  }

  /**
   * @purpose Promote candidateHeadSha → lastReviewedHeadSha for a completed review.
   * @param webUrl MR web URL to finalize.
   * @returns Updated registry (shallow copy).
   */
  promoteReviewedHeadSha(webUrl: string): InboxRegistry {
    return this._registry.promoteReviewedHeadSha(webUrl);
  }

  /**
   * @purpose Atomically persist the registry to disk.
   * @sideEffect Writes to `<stateDir>/inbox-registry.json`.
   */
  saveRegistry(): void {
    this._registry.save();
  }

  /**
   * @purpose Persist the operator's explicit role assignment so a restart restores it (SV-08).
   * @param webUrl MR web URL being assigned.
   * @param role Role name the operator picked.
   * @param [entrySeed] Project/iid for an MR with no registry entry yet.
   * @sideEffect Writes to `<stateDir>/inbox-registry.json`.
   */
  recordAssignment(
    webUrl: string,
    role: string,
    entrySeed?: { project: string; iid: string }
  ): void {
    this._registry.recordAssignment(webUrl, role, entrySeed);
  }

  /**
   * @purpose Drop a persisted assignment when its instance reaches a terminal state.
   * @param webUrl MR web URL to clear.
   * @sideEffect Writes to `<stateDir>/inbox-registry.json`.
   */
  clearAssignment(webUrl: string): void {
    this._registry.clearAssignment(webUrl);
  }

  // lastReadAt / capabilities / boot-readiness — D-302, D-317, D-305

  /**
   * @purpose Record the timestamp when the operator last read this MR's event feed (D-317).
   * @param webUrl MR web URL key.
   * @param [ts] ISO timestamp; defaults to now.
   * @sideEffect Mutates in-memory entry; caller persists via saveRegistry().
   */
  recordLastRead(webUrl: string, ts?: string): void {
    this._registry.recordLastRead(webUrl, ts);
  }

  /**
   * @purpose Retrieve per-MR capability modes for graduated autonomy (D-302).
   * @param webUrl MR web URL key.
   * @returns Capability registry; empty object when absent.
   */
  retrieveCapabilities(webUrl: string): CapabilityRegistry {
    const raw = this._registry.retrieveCapabilities(webUrl);
    return raw as CapabilityRegistry;
  }

  /**
   * @purpose Store per-MR capability modes for graduated autonomy (D-302).
   * @param webUrl MR web URL key.
   * @param capabilities Updated capability registry.
   * @sideEffect Mutates in-memory entry; caller persists via saveRegistry().
   */
  storeCapabilities(webUrl: string, capabilities: CapabilityRegistry): void {
    this._registry.storeCapabilities(webUrl, capabilities);
  }

  // audit log append/query through AuditLog

  /**
   * @purpose Append an event to the audit log (serve-mode only).
   * @param entry Audit event to record.
   * @returns Promise that resolves when the entry is appended.
   * @sideEffect Appends one JSON line to `<stateDir>/agent-inbox/audit.jsonl`; may trigger rotation.
   */
  async appendAudit(entry: AuditEntry): Promise<void> {
    logger.debug('[StateStore#appendAudit] [idle → appending]', {
      mr: entry.mr,
      event: entry.event,
    });
    await this._auditLog.append(entry);
  }

  /**
   * @purpose Query all audit events for a specific MR.
   * @param mr MR web URL to filter by.
   * @returns Audit entries for the given MR.
   */
  async queryAudit(mr: string): Promise<AuditEntry[]> {
    logger.debug('[StateStore#queryAudit] [idle → querying]', { mr });
    return this._auditLog.query(mr);
  }

  /**
   * @purpose Open the canonical profile-rooted review event journal used for state reconstruction.
   * @returns Durable journal bound beneath this store's validated runtime root.
   * @sideEffect Creates the journal parent directory when absent.
   */
  openReviewJournal(): EventJournal {
    return new EventJournal(join(this._stateDir, 'agent-inbox', 'review-events.jsonl'));
  }

  /**
   * @purpose Rebuild and atomically replace the disposable canonical review-state registry.
   * @invariant Registry bytes depend only on journal append order, config and optional observation time.
   * @param [config] Validated lifecycle and verification timing policy.
   * @param [now] Optional controlled instant used only for projected verificationDue.
   * @throws {Error} When replay rejects an event or the cache cannot be atomically persisted.
   * @returns Deterministically key-sorted registry snapshot.
   * @sideEffect Reads the canonical journal and atomically writes review-state-registry.json.
   */
  async rebuildReviewStateRegistry(
    config = new ReviewConfig(),
    now?: string
  ): Promise<Record<string, Record<string, unknown>>> {
    const events = this.openReviewJournal().replayReviewEvents();
    const grouped = new Map<string, typeof events>();
    // #region START_REBUILD_DISPOSABLE_PROJECTIONS_FROM_JOURNAL
    for (const event of events) {
      const key = event.identifyMr();
      const group = grouped.get(key) ?? [];
      group.push(event);
      grouped.set(key, group);
    }

    const registry: Record<string, Record<string, unknown>> = {};
    for (const key of [...grouped.keys()].sort()) {
      registry[key] = ReviewState.fold(grouped.get(key)!, config).toSnapshot(now);
    }
    // #endregion END_REBUILD_DISPOSABLE_PROJECTIONS_FROM_JOURNAL

    const directory = join(this._stateDir, 'agent-inbox');
    const target = join(directory, 'review-state-registry.json');
    const temporary = `${target}.${randomUUID()}.tmp`;
    // #region START_ATOMICALLY_REPLACE_REVIEW_REGISTRY_CACHE
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
      await rename(temporary, target);
      return registry;
    } catch (cause) {
      const error = new Error('[StateStore#rebuildReviewStateRegistry] Cache write failed', {
        cause,
      });
      logger.error('[StateStore#rebuildReviewStateRegistry] [rebuilding → failed]', {
        error,
        target,
      });
      throw error;
    }
    // #endregion END_ATOMICALLY_REPLACE_REVIEW_REGISTRY_CACHE
  }

  /**
   * @purpose Read the disposable review-state cache without treating it as canonical truth.
   * @returns Persisted registry or an empty cache when absent.
   */
  async loadReviewStateRegistry(): Promise<Record<string, Record<string, unknown>>> {
    const target = join(this._stateDir, 'agent-inbox', 'review-state-registry.json');
    // #region START_READ_DISPOSABLE_REVIEW_CACHE
    try {
      return JSON.parse(await readFile(target, 'utf8')) as Record<string, Record<string, unknown>>;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return {};
      const error = new Error('[StateStore#loadReviewStateRegistry] Cache read failed', { cause });
      logger.error('[StateStore#loadReviewStateRegistry] [reading → failed]', { error, target });
      throw error;
    }
    // #endregion END_READ_DISPOSABLE_REVIEW_CACHE
  }
}
