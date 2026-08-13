#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptions } from 'node:child_process';
import { parseArgs } from '../shared/common/parse-args.ts';
import { logger } from '../shared/common/logger.ts';

const rootDir = process.cwd();
const packageJsonPath = resolve(rootDir, 'package.json');
const packageLockPath = resolve(rootDir, 'package-lock.json');
const registry = 'https://registry.npmjs.org/';

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

function publishDraft(): void {
  const args = parseArgs(process.argv, {
    dryRun: ['dry-run', 'dryRun'],
    otp: { aliases: ['otp'], takesValue: true },
  });
  const isDryRun = Boolean(args.dryRun);
  const otp = typeof args.otp === 'string' ? args.otp : undefined;

  logger.info(`[main] [idle → starting] Draft publish flow started`, { isDryRun, otp: !!otp });

  const packageJson = readJson<PackageJsonShape>(packageJsonPath);
  const packageLock = readJson<PackageLockShape>(packageLockPath);

  if (!packageJson.version || !packageLock.version) {
    throw new Error('[main] package.json / package-lock.json must contain a "version" field.');
  }

  const originalVersion = packageJson.version;
  const base = getBaseVersion(originalVersion);
  const builds = publishedDraftBuilds(base);
  const nextBuild = builds.length > 0 ? Math.max(...builds) + 1 : 1;
  const draftVersion = `${base}-draft.${nextBuild}`;

  logger.info(`[main] [idle → resolving] Draft version resolved`, {
    base,
    publishedDraftBuilds: builds,
    draftVersion,
  });

  if (isDryRun) {
    logger.info(`[main] [resolving → dryRunCompleted] Dry run completed`, { draftVersion });
    return;
  }

  logger.info(`[main] [resolving → bumping] Bumping manifests to temporary version`, {
    draftVersion,
  });
  setVersion(packageJson, packageLock, draftVersion);

  try {
    logger.info(`[main] [bumping → publishing] Publishing package with draft tag`);
    const publishArgs = ['publish', '--tag', 'draft', '--registry', registry];
    if (otp) publishArgs.push('--otp', otp);
    run('npm', publishArgs);
    logger.info(`[main] [publishing → done] Draft publish flow finished`, { draftVersion });
  } finally {
    logger.info(`[main] [publishing → rollingBack] Reverting manifests to original version`, {
      originalVersion,
    });
    setVersion(packageJson, packageLock, originalVersion);
  }
}

try {
  publishDraft();
} catch (error) {
  logger.error(`[main] [starting → failed] publish-draft failed`, {
    errorMessage: getErrorMessage(error),
    cause: error instanceof Error ? error.cause : undefined,
  });
  process.exit(1);
}
