// @file: Inbox configuration I/O: types, validation, atomic load/save for ~/.gennady/agent-inbox/config.json.
// @consumers: inbox.cmd, inbox-config.cmd
// @tasks: TSK-90

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { logger } from '#logger';

/** @purpose Per-machine inbox configuration persisted at ~/.gennady/agent-inbox/config.json. */
export type InboxConfig = {
  /** @purpose Schema version for forward compatibility | @invariant Always 1 for current schema */
  version: 1;
  /** @purpose Absolute path to the root of cloned repositories */
  reposBase?: string;
  /** @purpose VCS hostname without scheme */
  vcsHost?: string;
  /** @purpose Persisted dry-run default; environment/explicit serve option may override it. */
  dryRun?: boolean;
};

/** @purpose Internal result of config validation — reports which required keys are missing. */
export type ValidateConfigResult = {
  /** @purpose Whether all required keys are present */
  valid: boolean;
  /** @purpose List of missing required key names */
  missing: string[];
};

const REQUIRED_KEYS = ['reposBase', 'vcsHost'] as const;
const CURRENT_VERSION = 1;

/**
 * @purpose Validate that the config object has all required keys populated.
 * @param config Parsed config object.
 * @returns Result with validity flag and list of missing keys.
 */
export function validateConfig(config: InboxConfig): ValidateConfigResult {
  const missing = REQUIRED_KEYS.filter((k) => !config[k]);
  return { valid: missing.length === 0, missing: [...missing] };
}

/**
 * @purpose Load and parse the config file, returning null when absent, throwing on corruption or version mismatch.
 * @param path Absolute path to config.json.
 * @throws {Error} When file exists but JSON is malformed or version is incompatible.
 * @returns Parsed config, or null when the file does not exist.
 * @sideEffect File read.
 */
export async function loadConfig(path: string): Promise<InboxConfig | null> {
  // #region START_READ_CONFIG_RAW
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') {
      logger.debug('[loadConfig] [reading → absent] Config file not found', { path });
      return null;
    }
    const error = new Error('[loadConfig] Failed to read config file', { cause });
    logger.error('[loadConfig] [reading → failed]', { error });
    throw error;
  }
  // #endregion END_READ_CONFIG_RAW

  // #region START_PARSE_CONFIG_JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    const error = new Error('[loadConfig] Config file contains invalid JSON', { cause });
    logger.error('[loadConfig] [parsing → failed]', { error });
    throw error;
  }
  // #endregion END_PARSE_CONFIG_JSON

  // #region START_GUARD_CONFIG_VERSION
  // invariant: version field prevents silent misinterpretation of future schemas by incompatible code
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new Error('[loadConfig] Config missing version field');
  }
  const cfg = parsed as Record<string, unknown>;
  if (cfg.version !== CURRENT_VERSION) {
    throw new Error(
      `[loadConfig] Unsupported config version: ${cfg.version} (expected ${CURRENT_VERSION})`
    );
  }
  // #endregion END_GUARD_CONFIG_VERSION

  return cfg as unknown as InboxConfig;
}

/**
 * @purpose Atomically persist config: write to a temp file, then rename to the target path.
 * @param path Absolute path to config.json.
 * @param config Config object to persist.
 * @throws {Error} When parent directories cannot be created or the file cannot be written.
 * @returns Resolves when the config is atomically written to disk.
 * @sideEffect Creates parent directories, writes config to disk.
 */
export async function saveConfig(path: string, config: InboxConfig): Promise<void> {
  // #region START_ENSURE_PARENT_DIR
  try {
    await mkdir(dirname(path), { recursive: true });
  } catch (cause) {
    const error = new Error('[saveConfig] Failed to create parent directory', { cause });
    logger.error('[saveConfig] [preparing → failed]', { error });
    throw error;
  }
  // #endregion END_ENSURE_PARENT_DIR

  const tmp = `${path}.tmp`;

  // #region START_ATOMIC_SAVE
  try {
    await writeFile(tmp, JSON.stringify(config, null, 2), 'utf-8');
    await rename(tmp, path);
    logger.debug('[saveConfig] [writing → saved]', { path });
  } catch (cause) {
    const error = new Error('[saveConfig] Atomic save failed', { cause });
    logger.error('[saveConfig] [writing → failed]', { error });
    throw error;
  }
  // #endregion END_ATOMIC_SAVE
}
