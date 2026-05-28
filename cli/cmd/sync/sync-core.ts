// @file: Sync core — resolvePackageDir, scanDirectives, collectAndCompare
// @consumers: sync.cmd.ts, sync-core.test.ts
// @tasks: TSK-53, TSK-54

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERR_SYNC_SUBDIR_NOT_FOUND, ERR_SYNC_SOURCE_NOT_FOUND, SyncResult } from './sync.types.ts';
import type { SyncFileEntry, SyncOptions, SyncFileStatus } from './sync.types.ts';

const DIRECTIVES_SUBDIR = 'ai/directives';

/** @purpose Entries excluded from sync: empty architecture dir, deprecated/domain-specific directives. @invariant Must be kept in sync with cli spec §3.4 exclusion list. */
export const EXCLUDED_ENTRIES = new Set([
  'architecture',
  'dbc-audit.directive.xml',
  'dev-review.directive.xml',
  'semantic-change-extractor.directive.xml',
]);

/** @purpose DI port for SyncCore — abstracts filesystem access for testability. @invariant All deps must be provided; no optional fields. */
export interface SyncCoreDeps {
  readFile: (path: string) => Buffer;
  writeFile: (path: string, data: Buffer) => void;
  mkdir: (path: string, opts?: { recursive: boolean }) => void;
  stat: (path: string) => { isDirectory(): boolean; isFile(): boolean };
  readdir: (path: string) => string[];
  cwd: string;
}

/**
 * @purpose Найти директорию ai/directives/ в установленном npm-пакете gennady.
 * Приоритет: локальная установка (node_modules) > резолв запущенного процесса.
 * @returns абсолютный путь к ai/directives/ или null если пакет не найден
 */
export function resolvePackageDir(cwd: string): string | null {
  const localPath = join(cwd, 'node_modules', 'gennady', DIRECTIVES_SUBDIR);
  if (existsSync(localPath)) return localPath;

  try {
    const resolved = import.meta.resolve('gennady');
    const pkgFile = fileURLToPath(resolved);
    // resolved points to .../gennady/dist/gennady.js
    // navigate up to package root: strip /dist/... suffix
    const pkgRoot = pkgFile.replace(/[/\\]dist[/\\].*$/, '');
    const directivesPath = join(pkgRoot, DIRECTIVES_SUBDIR);
    if (existsSync(directivesPath)) return directivesPath;
  } catch {
    // import.meta.resolve may fail
  }

  return null;
}

/**
 * @purpose Рекурсивно собрать список файлов в sourceDir с учётом фильтров и исключений.
 * @throws если subdir не существует в sourceDir
 */
export function scanDirectives(sourceDir: string, subdirs?: string[]): string[] {
  if (subdirs && subdirs.length > 0) {
    const available = readdirSync(sourceDir).filter(
      (name) => !EXCLUDED_ENTRIES.has(name) && statSync(join(sourceDir, name)).isDirectory()
    );

    for (const subdir of subdirs) {
      if (!available.includes(subdir)) {
        const msg = `ai/directives/${subdir}/ not found in package.\nAvailable: ${available.join(', ')}`;
        const error = new Error(msg);
        (error as Error & { code: string }).code = ERR_SYNC_SUBDIR_NOT_FOUND;
        throw error;
      }
    }

    const files: string[] = [];
    for (const subdir of subdirs) {
      collectRecursive(join(sourceDir, subdir), subdir, files);
    }
    return files.sort();
  }

  const files: string[] = [];
  collectRecursive(sourceDir, '', files);
  return files.sort();
}

function collectRecursive(dir: string, relativePrefix: string, result: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (name.startsWith('.') || EXCLUDED_ENTRIES.has(name)) continue;

    const fullPath = join(dir, name);
    const relativePath = relativePrefix ? join(relativePrefix, name) : name;
    const st = statSync(fullPath, { throwIfNoEntry: false });

    if (!st) continue;

    if (st.isDirectory()) {
      collectRecursive(fullPath, relativePath, result);
    } else if (st.isFile()) {
      result.push(relativePath.split(sep).join('/'));
    }
  }
}

/**
 * @purpose Главная точка входа: сравнить source и target, вернуть SyncResult.
 * При dryRun — только сравнение, без записи.
 */
export function collectAndCompare(deps: SyncCoreDeps, opts: SyncOptions): SyncResult {
  try {
    deps.stat(opts.sourceDir);
  } catch {
    const msg = `Source directory not found: ${opts.sourceDir}`;
    const error = new Error(msg);
    (error as Error & { code: string }).code = ERR_SYNC_SOURCE_NOT_FOUND;
    throw error;
  }

  const relativePaths = scanDirectives(opts.sourceDir, opts.subdirs);
  const entries: SyncFileEntry[] = [];

  for (const relativePath of relativePaths) {
    const sourcePath = join(opts.sourceDir, relativePath);
    const targetPath = join(opts.targetDir, relativePath);
    const sourceData = deps.readFile(sourcePath);
    const sourceSize = sourceData.length;

    let targetData: Buffer | null = null;
    try {
      targetData = deps.readFile(targetPath);
    } catch {
      // file doesn't exist in target
    }

    let status: SyncFileStatus;
    if (targetData === null) {
      status = 'added';
    } else if (Buffer.compare(sourceData, targetData) === 0) {
      status = 'unchanged';
    } else {
      status = 'updated';
    }

    entries.push({
      relativePath,
      status,
      sourceSize,
      targetSize: targetData?.length,
    });

    if (!opts.dryRun && status !== 'unchanged') {
      deps.mkdir(join(opts.targetDir, relativePath, '..'), { recursive: true });
      deps.writeFile(targetPath, sourceData);
    }
  }

  return new SyncResult(entries);
}
