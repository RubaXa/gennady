// @file: SyncCommand — CLI entry point for gennady sync: parseArgs, resolve package, compare + copy directives.
// @consumers: gennady.ts
// @tasks: TSK-53, TSK-54

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { collectAndCompare, resolvePackageDir } from './sync-core.ts';
import { formatEntries } from './sync-formatter.ts';
import type { SyncFileEntry, SyncOptions } from './sync.types.ts';
import { ERR_SYNC_SUBDIR_NOT_FOUND } from './sync.types.ts';
import type { SyncCoreDeps } from './sync-core.ts';

// #region START_DEPS — invariant: DI allows mocking filesystem and output for testability
/** @purpose Injectable dependencies for the sync CLI command — enables testing without real FS. */
export type SyncCmdDeps = {
  readFile?: typeof readFileSync;
  writeFile?: typeof writeFileSync;
  mkdir?: typeof mkdirSync;
  stat?: typeof statSync;
  readdir?: typeof readdirSync;
  resolvePackageDir?: typeof resolvePackageDir;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
};
// #endregion START_DEPS

// #region START_FORMAT_AND_WRITE — invariant: formatter produces lines; stdout writes them
function formatAndWrite(
  entries: SyncFileEntry[],
  dryRun: boolean,
  stdout: NodeJS.WriteStream,
  projectDir: string
): void {
  stdout.write(`Sync${dryRun ? ' (dry-run)' : ''}: ${projectDir}\n`);
  const lines = formatEntries(entries, { dryRun });
  for (const line of lines) {
    stdout.write(line + '\n');
  }
}
// #endregion END_FORMAT_AND_WRITE

/**
 * @purpose CLI entry point for the sync command.
 * *
 * Parses CLI arguments, resolves the package source directory,
 * compares source with target, and outputs the result.
 * *
 * @param rawArgs Raw CLI arguments (typically process.argv).
 * @param [deps] Optional injectable dependencies for testing.
 * @throws {Error} On package not found or invalid subdirectory.
 * @returns Exit code (0 success, 1 error).
 */
export function run(rawArgs: string[], deps?: SyncCmdDeps): number {
  const _readFile = deps?.readFile ?? readFileSync;
  const _writeFile = deps?.writeFile ?? writeFileSync;
  const _mkdir = deps?.mkdir ?? mkdirSync;
  const _stat = deps?.stat ?? statSync;
  const _readdir = deps?.readdir ?? readdirSync;
  const _resolvePackageDir = deps?.resolvePackageDir ?? resolvePackageDir;
  const _stdout = deps?.stdout ?? process.stdout;
  const _stderr = deps?.stderr ?? process.stderr;

  // #region START_PARSE — invariant: dryRun flag + positional subdirs
  const args = parseArgs(rawArgs, {
    dryRun: ['dry-run'],
  });

  const dryRun = args.dryRun === true || args.dryRun === 'true';
  const positional = (args._ as string[]).filter(
    (f: string) => typeof f === 'string' && f !== 'sync'
  );
  // #endregion END_PARSE

  const cwd = process.cwd();

  // #region START_RESOLVE_PACKAGE — invariant: local node_modules > import.meta.resolve
  const packageDir = _resolvePackageDir(cwd);
  if (!packageDir) {
    _stderr.write('Error: gennady package not found. Install it locally: npm i -D gennady\n');
    return 1;
  }
  // #endregion END_RESOLVE_PACKAGE

  const targetDir = join(cwd, 'ai', 'directives');

  const opts: SyncOptions = {
    sourceDir: packageDir,
    targetDir,
    subdirs: positional.length > 0 ? positional : undefined,
    dryRun,
  };

  // #region START_COLLECT_AND_COMPARE — invariant: core handles read/compare/write; dryRun skips write
  try {
    const coreDeps: SyncCoreDeps = {
      readFile: _readFile,
      writeFile: _writeFile,
      mkdir: _mkdir as (p: string, opts?: { recursive: boolean }) => void,
      stat: (p: string) => _stat(p),
      readdir: _readdir,
      cwd,
    };

    const result = collectAndCompare(coreDeps, opts);
    formatAndWrite(result.entries, dryRun, _stdout, cwd);
    return 0;
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === ERR_SYNC_SUBDIR_NOT_FOUND) {
      _stderr.write(`Error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
  // #endregion END_COLLECT_AND_COMPARE
}

// #region START_SELF_EXECUTING — invariant: self-executes only when file matches process.argv[1] (direct invocation)
if (process.argv[1]) {
  const selfPath = fileURLToPath(import.meta.url);
  if (selfPath === process.argv[1] || selfPath.endsWith(process.argv[1])) {
    try {
      const exitCode = run(process.argv);
      process.exit(exitCode);
    } catch (cause) {
      const error = new Error('[syncCmd] Self-execution failed', { cause });
      logger.error('[syncCmd#run] [self-executing → failed]', { error });
      process.exit(1);
    }
  }
}
// #endregion END_SELF_EXECUTING
