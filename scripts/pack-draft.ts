#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptions } from 'node:child_process';
import { homedir } from 'node:os';
import { parseArgs } from '../shared/common/parse-args.ts';
import { logger } from '../shared/common/logger.ts';

const rootDir = process.cwd();
const packageJsonPath = resolve(rootDir, 'package.json');
const packageLockPath = resolve(rootDir, 'package-lock.json');
const registry = 'https://registry.npmjs.org/';
const defaultTarget = resolve(homedir(), 'Developer', 'gennady-todomvc');

type PackageJsonShape = {
  version?: string;
  [key: string]: unknown;
};

type PackageLockShape = {
  version?: string;
  packages?: {
    ''?: {
      version?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function run(command: string, args: string[], options: SpawnSyncOptions = {}): void {
  logger.debug(`[run] [idle → starting] Exec '${command}' command`, { args });
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`[run] Command '${command}' failed`, {
      cause: result.error ?? { exitCode: result.status },
    });
  }
}

function runCapture(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`[runCapture] Command '${command}' failed`, {
      cause: result.error ?? { exitCode: result.status, stderr: result.stderr },
    });
  }
  return (result.stdout || '').trim();
}

/** @purpose Strip a trailing `-draft.N` suffix, returning the base `X.Y.Z` version. */
function getBaseVersion(version: string): string {
  return version.replace(/-draft\.\d+$/, '');
}

/** @purpose Query npm for already-published `X.Y.Z-draft.N` build numbers of the given base. */
function publishedDraftBuilds(base: string): number[] {
  const out = runCapture('npm', ['view', 'gennady', 'versions', '--json', '--registry', registry]);
  const versions = JSON.parse(out) as string[];
  const re = new RegExp(`^${base.replace(/\./g, '\\.')}-draft\\.(\\d+)$`);
  const builds: number[] = [];
  for (const v of versions) {
    const m = re.exec(v);
    if (m) builds.push(Number(m[1]));
  }
  return builds;
}

/** @purpose Offline fallback: `-draft.N` build numbers from `gennady-<base>-draft.N.tgz` tarballs in rootDir. */
function localDraftBuilds(base: string): number[] {
  const re = new RegExp(`^gennady-${base.replace(/\./g, '\\.')}-draft\\.(\\d+)\\.tgz$`);
  const builds: number[] = [];
  for (const name of readdirSync(rootDir)) {
    const m = re.exec(name);
    if (m) builds.push(Number(m[1]));
  }
  return builds;
}

/** @purpose Registry build numbers when reachable; local tarball numbers otherwise — pack-draft must work offline. */
function knownDraftBuilds(base: string): number[] {
  try {
    return publishedDraftBuilds(base);
  } catch (error) {
    logger.warn(
      `[main] [resolving → resolving] Registry unreachable, falling back to local tgz numbering`,
      {
        errorMessage: getErrorMessage(error),
      }
    );
    return localDraftBuilds(base);
  }
}

function setVersion(
  packageJson: PackageJsonShape,
  packageLock: PackageLockShape,
  version: string
): void {
  packageJson.version = version;
  packageLock.version = version;
  if (packageLock.packages?.['']) {
    packageLock.packages[''].version = version;
  }
  writeJson(packageJsonPath, packageJson);
  writeJson(packageLockPath, packageLock);
}

function packDraft(): void {
  const args = parseArgs(process.argv, {
    dryRun: ['dry-run', 'dryRun'],
    target: { aliases: ['target'], takesValue: true },
    skipInstall: ['skip-install', 'skipInstall'],
  });
  const isDryRun = Boolean(args.dryRun);
  const skipInstall = Boolean(args.skipInstall);
  const target = typeof args.target === 'string' ? resolve(args.target) : defaultTarget;

  logger.info(`[main] [idle → starting] Local draft flow started`, {
    isDryRun,
    skipInstall,
    target,
  });

  const packageJson = readJson<PackageJsonShape>(packageJsonPath);
  const packageLock = readJson<PackageLockShape>(packageLockPath);

  if (!packageJson.version || !packageLock.version) {
    throw new Error('[main] package.json / package-lock.json must contain a "version" field.');
  }

  const originalVersion = packageJson.version;
  const base = getBaseVersion(originalVersion);
  const builds = knownDraftBuilds(base);
  const nextBuild = builds.length > 0 ? Math.max(...builds) + 1 : 1;
  const draftVersion = `${base}-draft.${nextBuild}`;

  logger.info(`[main] [idle → resolving] Draft version resolved`, {
    base,
    publishedDraftBuilds: builds,
    draftVersion,
  });

  if (isDryRun) {
    logger.info(`[main] [resolving → dryRunCompleted] Dry run completed`, {
      draftVersion,
      target,
    });
    return;
  }

  if (!skipInstall && !existsSync(target)) {
    throw new Error(`[main] Target project dir does not exist: ${target}`);
  }

  logger.info(`[main] [resolving → bumping] Bumping manifests to temporary version`, {
    draftVersion,
  });
  setVersion(packageJson, packageLock, draftVersion);

  let tgzName: string | undefined;
  try {
    logger.info(`[main] [bumping → building] Building publish artifacts`);
    run('npm', ['run', 'build:publish']);

    logger.info(`[main] [building → packing] Packing tarball`);
    const packOutput = runCapture('npm', ['pack', '--json']);
    tgzName = (JSON.parse(packOutput) as Array<{ filename: string }>)[0].filename;
    const tgzPath = resolve(rootDir, tgzName);

    if (!skipInstall) {
      logger.info(`[main] [packing → installing] Installing tarball into target`, {
        target,
        tgzName,
      });
      run('npm', ['install', '--save-dev', tgzPath], { cwd: target });

      // A fresh install without a re-sync leaves the target's materialized ai/directives and
      // .claude/skills stale — the doors would then run the OLD flow against the NEW package.
      logger.info(`[main] [installing → syncing] Re-syncing directives + skills in target`);
      run('node', [resolve(target, 'node_modules/gennady/dist/gennady.js'), 'sync-skills'], {
        cwd: target,
      });
    }

    logger.info(`[main] [installing → done] Local draft flow finished`, {
      draftVersion,
      target: skipInstall ? '(not installed)' : target,
      tgzName,
    });
  } finally {
    logger.info(`[main] [installing → rollingBack] Reverting manifests to original version`, {
      originalVersion,
    });
    setVersion(packageJson, packageLock, originalVersion);
  }
}

try {
  packDraft();
} catch (error) {
  logger.error(`[main] [starting → failed] pack-draft failed`, {
    errorMessage: getErrorMessage(error),
    cause: error instanceof Error ? error.cause : undefined,
  });
  process.exit(1);
}
