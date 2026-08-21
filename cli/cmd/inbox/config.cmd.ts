// @file: CLI command: inbox config — manage agent-inbox configuration (~/.gennady/agent-inbox/config.json).
// @consumers: gennady.ts
// @tasks: TSK-92

import { existsSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import { resolveStateDir, configPath } from './_core/logic/state-paths.logic.ts';
import {
  loadConfig,
  saveConfig,
  validateConfig,
  type InboxConfig,
} from './_core/logic/inbox-config.logic.ts';

/**
 * @purpose Collect all --set KEY=VALUE pairs from the argument list.
 * @param argv Raw CLI arguments.
 * @returns Map of key → value extracted from --set flags.
 */
function collectSetFlags(argv: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--set' && argv[i + 1] !== undefined) {
      const eqIdx = argv[i + 1].indexOf('=');
      if (eqIdx > 0) result.set(argv[i + 1].slice(0, eqIdx), argv[i + 1].slice(eqIdx + 1));
      i++;
    } else if (arg.startsWith('--set=')) {
      const raw = arg.slice('--set='.length);
      const eqIdx = raw.indexOf('=');
      if (eqIdx > 0) result.set(raw.slice(0, eqIdx), raw.slice(eqIdx + 1));
    }
  }
  return result;
}

/**
 * @purpose Collect all --unset KEY values from the argument list.
 * @param argv Raw CLI arguments.
 * @returns Array of key names to remove.
 */
function collectUnsetFlags(argv: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--unset' && argv[i + 1] !== undefined) {
      result.push(argv[i + 1]);
      i++;
    } else if (arg.startsWith('--unset=')) {
      result.push(arg.slice('--unset='.length));
    }
  }
  return result;
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

/**
 * @purpose Validate a reposBase value: must be non-empty, absolute, exist on disk, and be a directory.
 * @param value Proposed reposBase path.
 * @returns Error message in Russian, or null when valid.
 */
function validateReposBase(value: string): string | null {
  if (!value) return 'reposBase не может быть пустым';
  if (!isAbsolute(value)) return 'reposBase должен быть абсолютным путём';
  if (!existsSync(value)) return `Путь "${value}" не существует`;
  if (!statSync(value).isDirectory()) return `"${value}" не является директорией`;
  return null;
}

/**
 * @purpose Validate a vcsHost value: must be non-empty.
 * @param value Proposed vcsHost.
 * @returns Error message in Russian, or null when valid.
 */
function validateVcsHost(value: string): string | null {
  if (!value) return 'vcsHost не может быть пустым';
  return null;
}

function formatError(detail: string): string {
  return JSON.stringify({ ok: false, error: 'CONFIG', detail });
}

/**
 * @purpose Format the config output JSON with configured flag.
 * @param config Current config object.
 * @returns JSON string.
 */
function formatConfigOutput(config: InboxConfig): string {
  const { valid } = validateConfig(config);
  const { version: _, ...visible } = config;
  return JSON.stringify({ configured: valid, ...visible });
}

async function run(): Promise<number> {
  const argv = process.argv.slice(2);
  const stateDir = resolveStateDir(argv);
  const cfgPath = configPath(stateDir);

  if (hasFlag(argv, '--path')) {
    console.info(cfgPath);
    return 0;
  }

  if (hasFlag(argv, '--init')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const question = (prompt: string): Promise<string> =>
      new Promise((resolve) => rl.question(prompt, resolve));

    let reposBase = '';
    // #region START_COLLECT_REPOSBASE — invariant: loop until valid absolute-path directory is entered
    while (true) {
      reposBase = await question('reposBase (абсолютный путь): ');
      const err = validateReposBase(reposBase);
      if (!err) break;
      console.error(err);
    }
    // #endregion END_COLLECT_REPOSBASE

    let vcsHost = '';
    // #region START_COLLECT_VCSHOST — invariant: loop until non-empty hostname is entered
    while (true) {
      vcsHost = await question('vcsHost: ');
      const err = validateVcsHost(vcsHost);
      if (!err) break;
      console.error(err);
    }
    // #endregion END_COLLECT_VCSHOST

    rl.close();

    const config: InboxConfig = { version: 1, reposBase, vcsHost };
    try {
      await saveConfig(cfgPath, config);
    } catch (cause) {
      console.error(formatError((cause as Error).message));
      return 1;
    }
    console.info(formatConfigOutput(config));
    return 0;
  }

  const setFlags = collectSetFlags(argv);
  const unsetKeys = collectUnsetFlags(argv);

  // #region START_APPLY_MUTATIONS — invariant: validate all --set values before any mutation
  if (setFlags.size > 0 || unsetKeys.length > 0) {
    for (const [key, value] of setFlags) {
      if (key === 'reposBase') {
        const err = validateReposBase(value);
        if (err) {
          console.error(formatError(err));
          return 1;
        }
      }
      if (key === 'autoReviewQuietMinutes') {
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          console.error(formatError('autoReviewQuietMinutes должен быть положительным числом'));
          return 1;
        }
        setFlags.set(key, String(minutes));
      }
    }

    let config: InboxConfig;
    try {
      config = (await loadConfig(cfgPath)) ?? { version: 1 as const };
    } catch (cause) {
      console.error(formatError((cause as Error).message));
      return 1;
    }

    for (const [key, value] of setFlags) {
      (config as Record<string, unknown>)[key] =
        key === 'autoReviewQuietMinutes' ? Number(value) : value;
    }
    for (const key of unsetKeys) {
      delete (config as Record<string, unknown>)[key];
    }

    try {
      await saveConfig(cfgPath, config);
    } catch (cause) {
      console.error(formatError((cause as Error).message));
      return 1;
    }
    console.info(formatConfigOutput(config));
    return 0;
  }
  // #endregion END_APPLY_MUTATIONS

  // #region START_SHOW_CONFIG — invariant: absent file is not an error
  try {
    const config = await loadConfig(cfgPath);
    if (!config) {
      console.info(JSON.stringify({ configured: false }));
      return 0;
    }
    console.info(formatConfigOutput(config));
    return 0;
  } catch (cause) {
    console.error(formatError((cause as Error).message));
    return 1;
  }
  // #endregion END_SHOW_CONFIG
}

process.exit(await run());
