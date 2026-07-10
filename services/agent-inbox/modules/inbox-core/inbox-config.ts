// @file: InboxConfig wrapper — structured config signal, atomic save, unset support over CLI config logic.
// @consumers: StateStore, CLI inbox commands
// @tasks: TSK-109

import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '#logger';
import {
  loadConfig as loadConfigRaw,
  saveConfig as saveConfigRaw,
  validateConfig,
  type InboxConfig as InboxConfigRaw,
} from '../../../../cli/cmd/inbox/_core/logic/inbox-config.logic.ts';

/** @purpose Structured result when config exists but is not fully configured. */
export type ConfigNotConfigured = {
  /** @purpose Always false when config is missing required keys */
  configured: false;
  /** @purpose List of missing required key names */
  missing: string[];
};

/** @purpose Structured result when config is fully configured. */
export type ConfigConfigured = {
  /** @purpose Always true when all required keys are present */
  configured: true;
  /** @purpose Absolute path to the root of cloned repositories */
  reposBase: string;
  /** @purpose VCS hostname without scheme */
  vcsHost: string;
};

/** @purpose Unified config load result — either fully configured or a structured signal with missing keys. */
export type ConfigLoadResult = ConfigNotConfigured | ConfigConfigured;

/**
 * @purpose Abstractions over per-machine inbox config persisted at `<stateDir>/agent-inbox/config.json`.
 * @invariant Atomic I/O via tmp + rename from underlying CLI logic.
 * @invariant Corrupt JSON → `configured: false`, not a thrown error (spec AI-22).
 */
export class InboxConfig {
  /** @purpose Root state directory path. */
  protected _stateDir: string;
  /** @purpose Cached raw config (null until loaded). */
  protected _rawConfig: InboxConfigRaw | null;

  /**
   * @purpose Create an InboxConfig instance bound to a state directory.
   * @param [stateDir] Root state directory (defaults to ~/.gennady).
   */
  constructor(stateDir?: string) {
    this._stateDir = stateDir ?? join(homedir(), '.gennady');
    this._rawConfig = null;
  }

  /**
   * @purpose Absolute path to config.json under `<stateDir>/agent-inbox/config.json`.
   * @returns Full path to the config file.
   */
  get configPath(): string {
    return join(this._stateDir, 'agent-inbox', 'config.json');
  }

  /**
   * @purpose Load and validate the config file from disk.
   * @invariant Absent file → structured signal `{ configured: false, missing: [...] }`, not an error.
   * @invariant Corrupt JSON → structured signal, exit 0 (spec AI-22).
   * @returns Config load result with structured signal or full config.
   */
  async load(): Promise<ConfigLoadResult> {
    logger.debug('[InboxConfig#load] [idle → loading]', { path: this.configPath });

    // #region START_LOAD_RAW_CONFIG
    let raw: InboxConfigRaw | null;
    try {
      raw = await loadConfigRaw(this.configPath);
    } catch (cause) {
      // invariant: corrupt JSON or version mismatch → configured:false per AI-22
      logger.warn(
        '[InboxConfig#load] [loading → degraded] Config unreadable, treating as unconfigured',
        {
          path: this.configPath,
          cause,
        }
      );
      return { configured: false, missing: ['reposBase', 'vcsHost'] };
    }
    // #endregion END_LOAD_RAW_CONFIG

    // #region START_VALIDATE_AND_SIGNAL
    if (!raw) {
      logger.debug('[InboxConfig#load] [loading → absent] No config file found');
      return { configured: false, missing: ['reposBase', 'vcsHost'] };
    }

    this._rawConfig = raw;
    const validation = validateConfig(raw);
    if (!validation.valid) {
      logger.debug('[InboxConfig#load] [loading → incomplete]', { missing: validation.missing });
      return { configured: false, missing: validation.missing };
    }

    logger.info('[InboxConfig#load] [loading → loaded] Config valid', { path: this.configPath });
    return {
      configured: true,
      reposBase: raw.reposBase!,
      vcsHost: raw.vcsHost!,
    };
    // #endregion END_VALIDATE_AND_SIGNAL
  }

  /**
   * @purpose Atomically update one or more config keys, preserving existing values.
   * @param partial Partial config keys to set.
   * @throws {Error} With CONFIG error code on I/O failure.
   * @returns Promise that resolves when the config is saved.
   * @sideEffect Atomic write to disk via tmp + rename.
   */
  async save(partial: Partial<Pick<InboxConfigRaw, 'reposBase' | 'vcsHost'>>): Promise<void> {
    logger.debug('[InboxConfig#save] [idle → saving]', { keys: Object.keys(partial) });

    // #region START_RESOLVE_BASE_CONFIG
    // invariant: load first if not yet loaded, defaulting to version 1 template
    if (!this._rawConfig) {
      try {
        this._rawConfig = await loadConfigRaw(this.configPath);
      } catch {
        // absent or corrupt → start fresh
      }
    }
    const base: InboxConfigRaw = this._rawConfig ?? { version: 1 };
    // #endregion END_RESOLVE_BASE_CONFIG

    // #region START_MERGE_AND_PERSIST
    const updated: InboxConfigRaw = {
      version: base.version,
      reposBase: partial.reposBase ?? base.reposBase,
      vcsHost: partial.vcsHost ?? base.vcsHost,
    };

    try {
      await saveConfigRaw(this.configPath, updated);
      this._rawConfig = updated;
      logger.info('[InboxConfig#save] [saving → saved]', { path: this.configPath });
    } catch (cause) {
      const error = new Error('[InboxConfig#save] Atomic save failed', { cause });
      logger.error('[InboxConfig#save] [saving → failed]', { error });
      throw error;
    }
    // #endregion END_MERGE_AND_PERSIST
  }

  /**
   * @purpose Remove a key from the config, atomically persisting the change.
   * @param key Key to unset (reposBase or vcsHost).
   * @throws {Error} With CONFIG error code on I/O failure.
   * @returns Promise that resolves when the key is removed.
   * @sideEffect Atomic write to disk via tmp + rename.
   */
  async unset(key: 'reposBase' | 'vcsHost'): Promise<void> {
    logger.debug('[InboxConfig#unset] [idle → unsetting]', { key });

    // #region START_RESOLVE_BASE_FOR_UNSET
    if (!this._rawConfig) {
      try {
        this._rawConfig = await loadConfigRaw(this.configPath);
      } catch {
        // absent or corrupt → nothing to unset
        return;
      }
    }
    if (!this._rawConfig) return;
    // #endregion END_RESOLVE_BASE_FOR_UNSET

    // #region START_REMOVE_AND_PERSIST
    const updated: InboxConfigRaw = {
      version: this._rawConfig.version,
      reposBase: key === 'reposBase' ? undefined : this._rawConfig.reposBase,
      vcsHost: key === 'vcsHost' ? undefined : this._rawConfig.vcsHost,
    };

    try {
      await saveConfigRaw(this.configPath, updated);
      this._rawConfig = updated;
      logger.info('[InboxConfig#unset] [unsetting → unset]', { key, path: this.configPath });
    } catch (cause) {
      const error = new Error('[InboxConfig#unset] Atomic save after unset failed', { cause });
      logger.error('[InboxConfig#unset] [unsetting → failed]', { error });
      throw error;
    }
    // #endregion END_REMOVE_AND_PERSIST
  }
}
