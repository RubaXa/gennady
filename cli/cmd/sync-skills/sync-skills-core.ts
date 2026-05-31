// @file: SyncSkills core — scanSkills, collectAndCompareSkills
// @consumers: SyncSkillsCmd, sync-skills-core.test.ts
// @tasks: TSK-57

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { compareBytes } from '../../../shared/common/sync/sync-core.shared.ts';
import type { SyncCmdDeps } from '../../../shared/common/sync/sync-deps.type.ts';
import {
  SyncSkillsResult,
  ERR_SKILLS_SOURCE_NOT_FOUND,
  ERR_SKILLS_SKILL_NOT_FOUND,
} from './sync-skills.types.ts';
import type { SyncSkillsFileEntry, SyncSkillsFileStatus, SyncSkillsOptions } from './sync-skills.types.ts';

/** @purpose Filenames excluded from scan: hidden files and system artifacts. */
const EXCLUDED_NAMES = new Set(['.DS_Store']);

/**
 * @purpose Recursively scan sourceDir for skill directories and return a map of skillName → {relativePath → Buffer}.
 * @param sourceDir Source directory (ai/skills/).
 * @param [skillNames] Optional filter: only scan these skill names.
 * @throws If a requested skillName does not exist in sourceDir.
 * @returns Map of skill names to their file contents.
 */
export function scanSkills(
  sourceDir: string,
  skillNames?: string[]
): Map<string, Map<string, Buffer>> {
  const available = readdirSync(sourceDir).filter((name) => {
    if (name.startsWith('.') || EXCLUDED_NAMES.has(name)) return false;
    try {
      return statSync(join(sourceDir, name)).isDirectory();
    } catch {
      return false;
    }
  });

  const targetNames = skillNames && skillNames.length > 0 ? skillNames : available;

  for (const name of targetNames) {
    if (!available.includes(name)) {
      const msg = `[scanSkills] Skill "${name}" not found in source.\nAvailable: ${available.join(', ')}`;
      const error = new Error(msg);
      (error as Error & { code: string }).code = ERR_SKILLS_SKILL_NOT_FOUND;
      throw error;
    }
  }

  const result = new Map<string, Map<string, Buffer>>();

  for (const name of targetNames) {
    const skillDir = join(sourceDir, name);
    const files = new Map<string, Buffer>();
    collectSkillFiles(skillDir, '', undefined, files);
    result.set(name, files);
  }

  return result;
}

function collectSkillFiles(
  dir: string,
  relativePrefix: string,
  depsOrFs: SyncCmdDeps | undefined,
  result: Map<string, Buffer>
): void {
  const _readdir = depsOrFs ? depsOrFs.readdir! : readdirSync;
  const _stat = depsOrFs ? depsOrFs.stat! : statSync;
  const _readFile = depsOrFs ? depsOrFs.readFile! : readFileSync;
  let entries: string[];
  try {
    entries = _readdir(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (name.startsWith('.') || EXCLUDED_NAMES.has(name)) continue;

    const fullPath = join(dir, name);
    const relativePath = relativePrefix ? join(relativePrefix, name) : name;

    let st;
    try {
      st = _stat(fullPath);
    } catch {
      continue;
    }
    if (!st) continue;

    if (st.isDirectory()) {
      collectSkillFiles(fullPath, relativePath, depsOrFs, result);
    } else if (st.isFile()) {
      const rawPath = relativePath.split(sep).join('/');
      result.set(rawPath, _readFile(fullPath));
    }
  }
}

/**
 * @purpose Compare a single source file with its target counterpart and produce a file entry.
 * @param skillName Skill directory name.
 * @param relativePath File path relative to skill root.
 * @param sourceData Source file contents.
 * @param targetData Target file contents (undefined if absent).
 * @param targetSkillDir Absolute path to target skill directory.
 * @param dryRun When true, skips actual file writes.
 * @param writeFile Injectable file writer.
 * @returns SyncSkillsFileEntry with comparison result.
 */
export function syncFile(
  skillName: string,
  relativePath: string,
  sourceData: Buffer,
  targetData: Buffer | undefined,
  targetSkillDir: string,
  dryRun: boolean,
  writeFile: (path: string, data: Buffer) => void,
  mkdir: (path: string, opts?: { recursive: boolean }) => void
): SyncSkillsFileEntry {
  let status: SyncSkillsFileStatus;
  if (!targetData) {
    status = 'added';
  } else if (!compareBytes(sourceData, targetData)) {
    status = 'unchanged';
  } else {
    status = 'updated';
  }

  if (!dryRun && status !== 'unchanged') {
    const filePath = join(targetSkillDir, relativePath);
    mkdir(join(filePath, '..'), { recursive: true });
    writeFile(filePath, sourceData);
  }

  return {
    skillName,
    relativePath,
    status,
    sourceSize: sourceData.length,
    targetSize: targetData?.length,
  };
}

/**
 * @purpose Recursively collect file paths in an orphan skill directory for deletion reporting.
 * @param dir Orphan skill directory path.
 * @param deps Injectable filesystem dependencies.
 * @returns Array of relative file paths inside the orphan directory.
 */
export function collectOrphanFiles(dir: string, deps: SyncCmdDeps): string[] {
  const result: string[] = [];
  let entries: string[];
  try {
    entries = deps.readdir!(dir);
  } catch {
    return result;
  }

  for (const name of entries) {
    if (name.startsWith('.') || EXCLUDED_NAMES.has(name)) continue;
    const fullPath = join(dir, name);
    try {
      const st = deps.stat!(fullPath);
      if (st.isDirectory()) {
        result.push(...collectOrphanFiles(fullPath, deps).map((f) => join(name, f)));
      } else if (st.isFile()) {
        result.push(name);
      }
    } catch {
      // can't stat
    }
  }
  return result;
}

/**
 * @purpose Delete a single orphan skill from the target directory.
 * @param skillName Orphan skill name.
 * @param targetDir Absolute path to the target skills directory.
 * @param dryRun When true, only produces preview entries.
 * @param deps Injectable filesystem dependencies.
 * @returns Array of SyncSkillsFileEntry for the deleted (or deleteFailed) skill.
 */
export function deleteOrphan(
  skillName: string,
  targetDir: string,
  dryRun: boolean,
  deps: SyncCmdDeps
): SyncSkillsFileEntry[] {
  const orphanDir = join(targetDir, skillName);

  let orphanFiles: string[] = [];
  try {
    orphanFiles = collectOrphanFiles(orphanDir, deps);
  } catch {
    // can't read orphan dir
  }

  if (dryRun) {
    const entries: SyncSkillsFileEntry[] = [
      {
        skillName,
        relativePath: '',
        status: 'deleted',
        sourceSize: undefined,
        targetSize: undefined,
      },
    ];
    for (const file of orphanFiles.sort()) {
      entries.push({
        skillName,
        relativePath: file,
        status: 'deleted',
        sourceSize: undefined,
        targetSize: undefined,
      });
    }
    return entries;
  }

  const _unlink = deps.unlink ?? (() => {});
  const _rmdir = deps.rmdir ?? (() => {});

  let deleteFailed = false;
  let deleteErrorCode: string | undefined;

  for (const file of orphanFiles) {
    const filePath = join(orphanDir, file);
    try {
      _unlink(filePath);
    } catch (err) {
      deleteFailed = true;
      deleteErrorCode = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    }
  }

  try {
    _rmdir(orphanDir, { recursive: true });
  } catch (err) {
    deleteFailed = true;
    deleteErrorCode = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
  }

  if (deleteFailed) {
    return [
      {
        skillName,
        relativePath: '',
        status: 'deleteFailed',
        errorCode: deleteErrorCode,
      },
    ];
  }

  return [
    {
      skillName,
      relativePath: '',
      status: 'deleted',
    },
  ];
}

/**
 * @purpose Main entry point: compare source skills with target, handle orphan deletion.
 * @param deps Injectable filesystem dependencies (SyncCmdDeps).
 * @param opts Sync-skills options.
 * @throws On invalid sourceDir, unwritable target, or write failures.
 * @returns SyncSkillsResult with entries and computed summaries.
 */
export function collectAndCompareSkills(
  deps: SyncCmdDeps,
  opts: SyncSkillsOptions
): SyncSkillsResult {
  // #region START_VALIDATE_INPUTS — invariants: sourceDir exists & is dir; target parent is dir or absent; target is writable
  let sourceStat;
  try {
    sourceStat = deps.stat!(opts.sourceDir);
  } catch {
    const msg = `[collectAndCompareSkills] Source directory not found: ${opts.sourceDir}`;
    const error = new Error(msg);
    (error as Error & { code: string }).code = ERR_SKILLS_SOURCE_NOT_FOUND;
    throw error;
  }

  if (!sourceStat.isDirectory()) {
    throw new Error(`[collectAndCompareSkills] sourceDir is not a directory: ${opts.sourceDir}`);
  }

  const parentDir = join(opts.targetDir, '..');

  try {
    const parentStat = deps.stat!(parentDir);
    if (parentStat.isFile()) {
      throw new Error('[collectAndCompareSkills] .claude exists but is not a directory');
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') throw err;
  }

  try {
    deps.mkdir!(opts.targetDir, { recursive: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EACCES') {
      throw new Error(`[collectAndCompareSkills] cannot write to ${opts.targetDir}: ${e.code}`, { cause: err });
    }
    if (e.code === 'ENOTDIR') {
      throw new Error('[collectAndCompareSkills] .claude exists but is not a directory', { cause: err });
    }
    throw err;
  }
  // #endregion END_VALIDATE_INPUTS

  const _writeFile = deps.writeFile!;
  const _mkdir = deps.mkdir!;

  // #region START_SCAN_SKILLS — invariants: scan source returns skill→files map; list target skills for orphan detection
  const sourceSkills = scanSkills(opts.sourceDir, opts.skillNames);

  let targetSkillNames: string[] = [];
  try {
    targetSkillNames = deps.readdir!(opts.targetDir).filter((name) => {
      if (name.startsWith('.') || EXCLUDED_NAMES.has(name)) return false;
      try {
        return deps.stat!(join(opts.targetDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    // targetDir doesn't exist yet (created above), or readdir failed
  }
  // #endregion END_SCAN_SKILLS

  const entries: SyncSkillsFileEntry[] = [];

  // #region START_SYNC_AND_CLEAN — invariants: iterate source skills, compare with target; delete target orphans
  for (const skillName of [...sourceSkills.keys()].sort()) {
    const skillFiles = sourceSkills.get(skillName)!;
    const targetSkillDir = join(opts.targetDir, skillName);

    let targetFiles = new Map<string, Buffer>();
    collectSkillFiles(targetSkillDir, '', deps, targetFiles);

    for (const [relativePath, sourceData] of [...skillFiles.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const targetData = targetFiles.get(relativePath);
      entries.push(
        syncFile(skillName, relativePath, sourceData, targetData, targetSkillDir, opts.dryRun ?? false, _writeFile, _mkdir)
      );
    }

    // Remove processed skill from targetSkillNames so remainder = orphans
    targetSkillNames = targetSkillNames.filter((n) => n !== skillName);
  }
  const filterSkillNames = opts.skillNames;
  const orphansToDelete = filterSkillNames
    ? targetSkillNames.filter((n) => filterSkillNames.includes(n))
    : targetSkillNames;

  for (const skillName of orphansToDelete.sort()) {
    entries.push(...deleteOrphan(skillName, opts.targetDir, opts.dryRun ?? false, deps));
  }
  // #endregion END_SYNC_AND_CLEAN

  return new SyncSkillsResult(entries);
}
