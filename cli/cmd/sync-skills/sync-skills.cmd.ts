// @file: SyncSkills command — CLI entry point for gennady sync-skills: parseArgs, resolve package, compare + copy skills.
// @consumers: gennady.ts, sync-skills.cmd.test.ts
// @tasks: TSK-57

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  readdirSync,
  unlinkSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { resolvePackageDir } from '../../../shared/common/sync/sync-core.shared.ts';
import { formatSyncOutput } from '../../../shared/common/sync/sync-formatter.shared.ts';
import type { SyncCmdDeps } from '../../../shared/common/sync/sync-deps.type.ts';
import { collectAndCompare } from '../sync/sync-core.ts';
import type { SyncCoreDeps } from '../sync/sync-core.ts';
import { ERR_SYNC_SOURCE_NOT_FOUND } from '../sync/sync.types.ts';
import type { SyncOptions } from '../sync/sync.types.ts';
import { collectAndCompareSkills } from './sync-skills-core.ts';
import { format } from './sync-skills-formatter.ts';
import { ERR_SKILLS_SKILL_NOT_FOUND, ERR_SKILLS_SOURCE_NOT_FOUND } from './sync-skills.types.ts';
import type { SyncSkillsFileEntry, SyncSkillsOptions } from './sync-skills.types.ts';

export type { SyncCmdDeps } from '../../../shared/common/sync/sync-deps.type.ts';

function getPackageVersion(packageDir: string): string {
  try {
    const pkgRoot = join(packageDir, '..', '..');
    const content = readFileSync(join(pkgRoot, 'package.json'), 'utf-8');
    return (JSON.parse(content) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// #region START_FORMAT_AND_WRITE — invariant: formatter produces lines; stdout writes them
function formatAndWrite(
  entries: SyncSkillsFileEntry[],
  dryRun: boolean,
  stdout: NodeJS.WriteStream,
  projectDir: string,
  version: string
): void {
  stdout.write(`Sync skills (v${version})${dryRun ? ' (dry-run)' : ''}: ${projectDir}\n`);
  const lines = format(entries, { dryRun });
  for (const line of lines) {
    stdout.write(line + '\n');
  }
}
// #endregion END_FORMAT_AND_WRITE

/**
 * @purpose Sync ai/directives/ before skills, in-process, so skills never reference stale/absent directives.
 * @param deps Injectable filesystem dependencies (subset shared with sync-skills).
 * @param cwd Current working directory.
 * @param dryRun Preview without writing.
 * @param stdout Standard output stream.
 * @param stderr Standard error stream.
 * @returns Exit code on failure (1), or null on success (proceed to skills sync).
 */
function syncDirectivesFirst(
  deps: SyncCmdDeps,
  cwd: string,
  dryRun: boolean,
  stdout: NodeJS.WriteStream,
  stderr: NodeJS.WriteStream
): number | null {
  const _resolvePackageDir = deps.resolvePackageDir ?? resolvePackageDir;
  const packageDir = _resolvePackageDir(cwd, 'ai/directives');
  if (!packageDir) {
    stderr.write('Error: gennady package not found. Install it locally: npm i -D gennady\n');
    return 1;
  }

  const version = getPackageVersion(packageDir);
  const targetDir = join(cwd, 'ai', 'directives');

  const opts: SyncOptions = {
    sourceDir: packageDir,
    targetDir,
    dryRun,
  };

  const coreDeps: SyncCoreDeps = {
    readFile: deps.readFile!,
    writeFile: deps.writeFile!,
    mkdir: deps.mkdir! as (p: string, opts?: { recursive: boolean }) => void,
    stat: (p: string) => deps.stat!(p),
    readdir: deps.readdir!,
    unlink: deps.unlink,
    cwd,
  };

  try {
    const result = collectAndCompare(coreDeps, opts);
    stdout.write(`Sync (v${version})${dryRun ? ' (dry-run)' : ''}: ${cwd}\n`);
    for (const line of formatSyncOutput(result.entries, { dryRun })) {
      stdout.write(line + '\n');
    }
    stdout.write('\n');
    return null;
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === ERR_SYNC_SOURCE_NOT_FOUND) {
      stderr.write(`Error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

/**
 * @purpose CLI entry point for sync-skills. Parses args, resolves package source directory, compares source with target, outputs result.
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
  const _unlink = deps?.unlink ?? unlinkSync;
  const _rmdir = deps?.rmdir ?? ((path: string) => rmSync(path, { recursive: true, force: true }));
  const _resolvePackageDir = deps?.resolvePackageDir ?? resolvePackageDir;
  const _stdout = deps?.stdout ?? process.stdout;
  const _stderr = deps?.stderr ?? process.stderr;

  // #region START_PARSE — invariant: dryRun flag + positional skill names
  const args = parseArgs(rawArgs, {
    dryRun: ['dry-run'],
  });

  const dryRun = args.dryRun === true || args.dryRun === 'true';
  const positional = (args._ as string[]).filter(
    (f: string) => typeof f === 'string' && f !== 'sync-skills'
  );
  // #endregion END_PARSE

  const cwd = process.cwd();

  const directivesExitCode = syncDirectivesFirst(
    {
      readFile: _readFile,
      writeFile: _writeFile,
      mkdir: _mkdir,
      stat: _stat,
      readdir: _readdir,
      unlink: _unlink,
      resolvePackageDir: _resolvePackageDir,
    },
    cwd,
    dryRun,
    _stdout,
    _stderr
  );
  if (directivesExitCode !== null) return directivesExitCode;

  // #region START_RESOLVE_PACKAGE — invariant: local node_modules > import.meta.resolve
  const packageDir = _resolvePackageDir(cwd, 'ai/skills');
  if (!packageDir) {
    _stderr.write('Error: gennady package not found. Install it locally: npm i -D gennady\n');
    return 1;
  }

  const version = getPackageVersion(packageDir);
  // #endregion END_RESOLVE_PACKAGE

  const targetDir = join(cwd, '.claude', 'skills');

  const opts: SyncSkillsOptions = {
    sourceDir: packageDir,
    targetDir,
    skillNames: positional.length > 0 ? positional : undefined,
    dryRun,
  };

  // #region START_COLLECT_AND_COMPARE — invariant: core handles read/compare/write/delete; dryRun skips mutations
  try {
    const coreDeps: SyncCmdDeps = {
      readFile: _readFile,
      writeFile: _writeFile,
      mkdir: _mkdir as (p: string, opts?: { recursive: boolean }) => void,
      stat: (p: string) => _stat(p),
      readdir: _readdir,
      unlink: _unlink,
      rmdir: _rmdir as (p: string, opts?: { recursive: boolean }) => void,
      resolvePackageDir: _resolvePackageDir,
    };

    const result = collectAndCompareSkills(coreDeps, opts);
    formatAndWrite(result.entries, dryRun, _stdout, cwd, version);
    return 0;
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === ERR_SKILLS_SKILL_NOT_FOUND || error.code === ERR_SKILLS_SOURCE_NOT_FOUND) {
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
      const error = new Error('[syncSkillsCmd] Self-execution failed', { cause });
      logger.error('[syncSkillsCmd#run] [self-executing → failed]', { error });
      process.exit(1);
    }
  }
}
// #endregion END_SELF_EXECUTING
