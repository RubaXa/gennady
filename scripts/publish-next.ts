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

function getErrorCause(error: unknown): unknown {
  return error instanceof Error ? error.cause : undefined;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseAndBumpNextVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-next\.(\d+))?$/.exec(version);
  if (!match) {
    throw new Error(
      `[parseAndBumpNextVersion] Unsupported version format "${version}". Expected "X.Y.Z" or "X.Y.Z-next.N".`
    );
  }

  const [, major, minor, patch, build] = match;
  const nextBuild = build === undefined ? 1 : Number(build) + 1;
  return `${major}.${minor}.${patch}-next.${nextBuild}`;
}

function run(command: string, args: string[], options: SpawnSyncOptions = {}): void {
  const startedAt = Date.now();
  logger.debug(`[run] [idle → starting] Exec '${command}' command`, { args });

  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    logger.error(`[run] [starting → failed] Command '${command}' execution failed`, {
      args,
      exitCode: result.status,
      time: Date.now() - startedAt,
    });

    throw new Error(`[run] Command '${command}' failed`, {
      cause: result.error ?? { exitCode: result.status },
    });
  }

  logger.debug(`[run] [starting → completed] Command '${command}' execution completed`, {
    args,
    time: Date.now() - startedAt,
  });
}

function runCapture(command: string, args: string[]): string {
  const startedAt = Date.now();
  logger.debug(`[runCapture] [idle → starting] Exec capture '${command}' command`, { args });

  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    logger.error(`[runCapture] [starting → failed] Capture command '${command}' failed`, {
      args,
      exitCode: result.status,
      stderr: result.stderr || '',
      time: Date.now() - startedAt,
    });

    const stderrText = (result.stderr || '').trim();
    throw new Error(`[runCapture] Command '${command}' failed`, {
      cause: result.error ?? (stderrText || { exitCode: result.status }),
    });
  }

  logger.debug(`[runCapture] [starting → completed] Capture command '${command}' completed`, {
    args,
    time: Date.now() - startedAt,
  });

  return (result.stdout || '').trim();
}

function tagExists(tag: string): boolean {
  const result = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    cwd: rootDir,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function getNpmAuthUser(): string {
  const startedAt = Date.now();
  logger.debug(`[getNpmAuthUser] [idle → starting] Checking npm auth with 'whoami'`);

  const result = spawnSync('npm', ['whoami', '--registry', 'https://registry.npmjs.org/'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    logger.error(`[getNpmAuthUser] [starting → failed] Npm auth check failed`, {
      exitCode: result.status,
      stderr: (result.stderr || '').trim(),
      time: Date.now() - startedAt,
    });

    throw new Error(`[getNpmAuthUser] Npm auth check failed`, {
      cause: {
        exitCode: result.status,
        stderr: (result.stderr || '').trim(),
      },
    });
  }

  const npmUser = (result.stdout || '').trim();

  logger.debug(`[getNpmAuthUser] [starting → completed] Npm auth check completed`, {
    npmUser,
    time: Date.now() - startedAt,
  });

  if (!npmUser) {
    throw new Error(`[getNpmAuthUser] Empty npm username from 'whoami'.`);
  }

  return npmUser;
}

function calculatingVersion(): void {
  const args = parseArgs(process.argv, {
    dryRun: ['dry-run', 'dryRun'],
    allowDirty: ['allow-dirty', 'allowDirty'],
  });
  const isDryRun = Boolean(args.dryRun);
  const allowDirty = Boolean(args.allowDirty);

  logger.info(`[main] [idle → starting] Next publish flow started`, { isDryRun, allowDirty });
  logger.debug(`[main] [starting → readingManifests] Reading package manifests`);

  let packageJson: PackageJsonShape;
  let packageLock: PackageLockShape;
  try {
    packageJson = readJson<PackageJsonShape>(packageJsonPath);
    packageLock = readJson<PackageLockShape>(packageLockPath);
  } catch (error) {
    throw new Error('[main] Failed to read package manifests', { cause: error });
  }

  if (!packageJson.version) {
    throw new Error('[main] package.json does not contain a "version" field.');
  }

  if (!packageLock.version) {
    throw new Error('[main] package-lock.json does not contain a "version" field.');
  }

  logger.debug(`[main] [readingManifests → checkingGitState] Checking git working tree`);
  const changedFiles = runCapture('git', ['status', '--porcelain']);

  if (changedFiles.length > 0 && !allowDirty) {
    throw new Error(
      '[main] Working tree is not clean. Commit or stash your changes before publish-next.'
    );
  }

  if (changedFiles.length > 0 && allowDirty) {
    logger.warn(`[main] [checkingGitState → checkingGitState] Dirty tree allowed by flag`, {
      changedFilesCount: changedFiles.split('\n').filter(Boolean).length,
    });
  }

  if (!isDryRun) {
    logger.debug(`[main] [checkingGitState → checkingNpmAuth] Checking npm authorization`);
    const npmUser = getNpmAuthUser();
    logger.info(`[main] [checkingNpmAuth → npmAuthVerified] Npm authorization verified`, {
      npmUser,
    });
    logger.debug(`[main] [npmAuthVerified → calculatingVersion] Calculating next version`);
  } else {
    logger.debug(`[main] [checkingGitState → calculatingVersion] Calculating next version`);
  }

  const newVersion = parseAndBumpNextVersion(packageJson.version);
  const tag = `v${newVersion}`;

  if (tagExists(tag)) {
    throw new Error(`[main] Tag "${tag}" already exists.`);
  }

  if (isDryRun) {
    logger.info(`[main] [calculatingVersion → dryRunCompleted] Dry run completed`, {
      newVersion,
      tag,
    });
    logger.info(`[main] [dryRunCompleted → done] Next publish flow finished`);
    return;
  }

  logger.info(`[main] [calculatingVersion → updatingPackageFiles] Updating package files`, {
    newVersion,
  });
  packageJson.version = newVersion;
  packageLock.version = newVersion;
  if (packageLock.packages?.['']) {
    packageLock.packages[''].version = newVersion;
  }

  try {
    writeJson(packageJsonPath, packageJson);
    writeJson(packageLockPath, packageLock);
  } catch (error) {
    throw new Error('[main] Failed to write package manifests', { cause: error });
  }

  logger.info(`[main] [updatingPackageFiles → packageFilesUpdated] Package versions updated`, {
    newVersion,
  });

  try {
    logger.info(`[main] [packageFilesUpdated → gitCommitTagging] Creating git commit and tag`, {
      tag,
    });
    run('git', ['add', 'package.json', 'package-lock.json']);
    run('git', ['commit', '-m', `chore(release): v${newVersion}`]);
    run('git', ['tag', tag]);

    logger.info(`[main] [gitCommitTagging → gitPushing] Pushing commit and tags`);
    run('git', ['push']);
    run('git', ['push', '--tags']);

    logger.info(`[main] [gitPushing → npmPublishing] Publishing package to npm with next tag`);
    run('npm', ['publish', '--tag', 'next']);

    logger.info(`[main] [npmPublishing → done] Next publish flow finished`, { newVersion, tag });
  } catch (error) {
    throw new Error('[main] Release stopped. You may need to rollback commit/tag manually.', {
      cause: error,
    });
  }
}

try {
  calculatingVersion();
} catch (error) {
  logger.error(`[main] [starting → failed] publish-next failed`, {
    errorMessage: getErrorMessage(error),
    cause: getErrorCause(error),
  });
  process.exit(1);
}
