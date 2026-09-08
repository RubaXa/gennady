// @file: SyncSkills core — scanSkills, collectAndCompareSkills
// @consumers: SyncSkillsCmd, sync-skills-core.test.ts
// @tasks: TSK-57

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { compareBytes } from '../../../shared/common/sync/sync-core.shared.ts';
import { normalize, SYNC_SKILLS_PATH_RULES } from '../../../shared/common/sync/path-normalizer.ts';
import type { SyncCmdDeps } from '../../../shared/common/sync/sync-deps.type.ts';
import {
  SyncSkillsResult,
  ERR_SKILLS_SOURCE_NOT_FOUND,
  ERR_SKILLS_SKILL_NOT_FOUND,
} from './sync-skills.types.ts';
import type {
  SyncSkillsFileEntry,
  SyncSkillsFileStatus,
  SyncSkillsOptions,
} from './sync-skills.types.ts';

/** @purpose Filenames excluded from scan: hidden files and system artifacts. */
const EXCLUDED_NAMES = new Set(['.DS_Store']);

/**
 * @purpose Name of the file recording which skills — and which files inside them — this sync installed.
 * @invariant Dot-prefixed on purpose: every readdir filter here already skips `.`-names,
 *   so the manifest can never be mistaken for a skill directory.
 */
const MANIFEST_NAME = '.gennady-synced';

/**
 * @purpose List directory names directly under sourceDir that look like skill directories.
 * @invariant Shared by scanSkills (per-request filter) and collectAndCompareSkills (unfiltered
 *   "what does the package ship right now", needed for first-run manifest adoption) so both read
 *   the exact same set of names.
 * @param sourceDir Source directory (ai/skills/).
 * @returns Directory names, in readdir order.
 */
function listAvailableSkillNames(sourceDir: string): string[] {
  return readdirSync(sourceDir).filter((name) => {
    if (name.startsWith('.') || EXCLUDED_NAMES.has(name)) return false;
    try {
      return statSync(join(sourceDir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * @purpose Read the set of names a previous sync recorded as its own.
 * @invariant A line without a slash owns a skill directory (SO-2); `<skill>/<relativePath>`
 *   owns one file inside a still-supported skill (SO-2b) — only that exact file may be pruned.
 * @invariant null means "no usable manifest": an unreadable one is treated as absent, so
 *   ownership under-claims, never over-deletes.
 * @param targetDir Skills directory being synced into.
 * @param deps Injectable IO.
 * @returns The recorded entries, or null when no manifest exists (never synced by this version).
 */
function readSyncManifest(targetDir: string, deps: SyncCmdDeps): Set<string> | null {
  try {
    const raw = deps.readFile!(join(targetDir, MANIFEST_NAME)).toString('utf-8');
    const names = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    return new Set(names);
  } catch {
    return null;
  }
}

/**
 * @purpose Record which skills — and which files inside them — this sync owns, so the next run
 *   can prune only those.
 * @param targetDir Skills directory being synced into.
 * @param entries Owned entries: bare skill names plus `<skill>/<relativePath>` file entries.
 * @param dryRun When true, nothing is written.
 * @param deps Injectable IO.
 */
function writeSyncManifest(
  targetDir: string,
  entries: readonly string[],
  dryRun: boolean,
  deps: SyncCmdDeps
): void {
  if (dryRun) return;
  const body =
    '# Skills and files owned by `gennady sync-skills`. Only these are pruned when they\n' +
    '# disappear from the package. Anything else in this directory is left alone.\n' +
    '# A line without a slash is an owned skill directory. `<skill>/<path>` is a single\n' +
    '# file this tool wrote inside a still-supported skill — only listed files are ever\n' +
    '# removed from inside a supported skill; everything else there is left alone.\n' +
    '# A first sync adopts only the skills the package ships then; leftovers from\n' +
    '# older versions cannot be told apart from your own skills and stay untouched.\n' +
    [...entries].sort().join('\n') +
    '\n';
  try {
    deps.writeFile!(join(targetDir, MANIFEST_NAME), Buffer.from(body, 'utf-8'));
  } catch {
    // A missing manifest only means the next run prunes nothing — never fail the sync over it.
  }
}

/**
 * @purpose Migration policy for a target that has no manifest yet: which existing skill
 *   directories this tool claims ownership of.
 * @invariant Only names the package ships *now* are adopted: the sync writes skill files
 *   verbatim, so nothing marks a directory as package-installed.
 * @invariant A leftover from an older package version is indistinguishable from a
 *   project-authored skill, so it is deliberately never claimed, never pruned.
 * @invariant A same-named directory is overwritten by the sync anyway; recording the name only
 *   makes pruning it possible later.
 * @param targetSkillNames Skill directories currently in the target.
 * @param shippedNames Every skill name the package ships this run (ignoring any name filter).
 * @returns The adopted names.
 */
function adoptPackageInstalled(
  targetSkillNames: readonly string[],
  shippedNames: ReadonlySet<string>
): Set<string> {
  return new Set(targetSkillNames.filter((name) => shippedNames.has(name)));
}

/**
 * @purpose Compute the skill-name portion of the manifest for the next run: previous ownership
 *   merged with this run's.
 * @invariant Merge, never replace: a filtered run (`gennady sync-skills sdd-execute`) must not
 *   drop ownership of the skills it did not touch.
 * @invariant A skill whose deletion failed stays owned, so the next run retries it; one whose
 *   deletion succeeded, or whose directory is gone, is dropped.
 * @invariant A slash entry (SO-2b file ownership) never matches `present` — skill directory
 *   names only — so it is dropped here and re-added by the caller's file-level computation.
 * @param owned Ownership going into this run (manifest, or the adopted set on a first run).
 * @param syncedNames Skills installed by this run.
 * @param prunedNames Orphans this run deleted successfully.
 * @param present Target skill directories seen before syncing, or null when unreadable.
 * @returns Names to record.
 */
function nextManifestNames(
  owned: ReadonlySet<string>,
  syncedNames: readonly string[],
  prunedNames: ReadonlySet<string>,
  present: readonly string[] | null
): string[] {
  const retained = [...owned].filter(
    (name) => !prunedNames.has(name) && (present === null || present.includes(name))
  );
  return [...new Set([...retained, ...syncedNames])];
}

/**
 * @purpose Whether a file inside a supported skill was placed by a previous sync (SO-2b).
 * @invariant Only a file already named `<skill>/<relativePath>` may be pruned from a supported
 *   skill; a project-authored file, such as a local helper script, is always left alone.
 * @param previousManifest Manifest read before this run, or null when none exists.
 * @param skillName Skill directory name.
 * @param relativePath File path relative to the skill root.
 * @returns True when this tool manifested the file before this run.
 */
function isFileOwned(
  previousManifest: Set<string> | null,
  skillName: string,
  relativePath: string
): boolean {
  return previousManifest?.has(`${skillName}/${relativePath}`) ?? false;
}

/**
 * @purpose Compute the full manifest — skill names and file entries — to write after this run.
 * @invariant A touched skill's file list is replaced with exactly what the package ships now,
 *   so a dropped file becomes prunable only next run (`isFileOwned` reads the prior manifest).
 * @invariant An untouched skill keeps its prior file entries, minus any skill pruned this run.
 * @param previousManifest Manifest read before this run, or null when none exists.
 * @param owned Skill-level ownership going into this run.
 * @param sourceSkills Skills this run compared against the target.
 * @param prunedSkills Orphan skills this run deleted successfully.
 * @param installedNames Target skill directories seen before syncing, or null when unreadable.
 * @returns Entries to record in the manifest.
 */
function computeNextManifestEntries(
  previousManifest: Set<string> | null,
  owned: ReadonlySet<string>,
  sourceSkills: ReadonlyMap<string, ReadonlyMap<string, Buffer>>,
  prunedSkills: ReadonlySet<string>,
  installedNames: readonly string[] | null
): string[] {
  const skillLevelEntries = nextManifestNames(
    owned,
    [...sourceSkills.keys()],
    prunedSkills,
    installedNames
  );

  const touchedSkillNames = new Set(sourceSkills.keys());
  const previousFileEntries = previousManifest
    ? [...previousManifest].filter((entry) => entry.includes('/'))
    : [];
  const retainedFileEntries = previousFileEntries.filter((entry) => {
    const ownerSkill = entry.slice(0, entry.indexOf('/'));
    return !prunedSkills.has(ownerSkill) && !touchedSkillNames.has(ownerSkill);
  });
  const freshFileEntries: string[] = [];
  for (const skillName of touchedSkillNames) {
    for (const relativePath of sourceSkills.get(skillName)!.keys()) {
      freshFileEntries.push(`${skillName}/${relativePath}`);
    }
  }

  return [...new Set([...skillLevelEntries, ...retainedFileEntries, ...freshFileEntries])];
}

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
  return scanSkillsChecked(sourceDir, skillNames).skills;
}

/**
 * @purpose Like scanSkills, but also reports which skills a read error cut short (SO-7) — never
 *   to be mistaken for a skill whose files the source genuinely dropped.
 * @param sourceDir Source directory (ai/skills/).
 * @param [skillNames] Optional filter: only scan these skill names.
 * @throws If a requested skillName does not exist in sourceDir.
 * @returns Skill file map, plus the names of skills a read error cut short.
 */
function scanSkillsChecked(
  sourceDir: string,
  skillNames?: string[]
): { skills: Map<string, Map<string, Buffer>>; incompleteSkills: Set<string> } {
  const available = listAvailableSkillNames(sourceDir);

  const targetNames = skillNames && skillNames.length > 0 ? skillNames : available;

  for (const name of targetNames) {
    if (!available.includes(name)) {
      const msg = `[scanSkills] Skill "${name}" not found in source.\nAvailable: ${available.join(', ')}`;
      const error = new Error(msg);
      (error as Error & { code: string }).code = ERR_SKILLS_SKILL_NOT_FOUND;
      throw error;
    }
  }

  const skills = new Map<string, Map<string, Buffer>>();
  const incompleteSkills = new Set<string>();

  for (const name of targetNames) {
    const skillDir = join(sourceDir, name);
    const files = new Map<string, Buffer>();
    const incomplete = { value: false };
    collectSkillFiles(skillDir, '', undefined, files, incomplete);
    if (incomplete.value) incompleteSkills.add(name);
    skills.set(name, files);
  }

  return { skills, incompleteSkills };
}

/**
 * @purpose Recursively collect a skill directory's files into `result`.
 * @invariant SO-7: a `readdir` failure marks `incomplete.value` (when given) instead of silently
 *   returning as if this subtree were empty — read-failed and genuinely-empty must stay distinct.
 * @param dir Directory to scan.
 * @param relativePrefix Path prefix relative to the skill root, `/`-separated.
 * @param depsOrFs Injectable IO, or undefined to use real fs (scanSkills' source-side reads).
 * @param result Accumulator for discovered file paths → contents.
 * @param [incomplete] Set to `{ value: true }` if any read under `dir` failed.
 */
function collectSkillFiles(
  dir: string,
  relativePrefix: string,
  depsOrFs: SyncCmdDeps | undefined,
  result: Map<string, Buffer>,
  incomplete?: { value: boolean }
): void {
  const _readdir = depsOrFs ? depsOrFs.readdir! : readdirSync;
  const _stat = depsOrFs ? depsOrFs.stat! : statSync;
  const _readFile = depsOrFs ? depsOrFs.readFile! : readFileSync;
  let entries: string[];
  try {
    entries = _readdir(dir);
  } catch {
    if (incomplete) incomplete.value = true;
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
      collectSkillFiles(fullPath, relativePath, depsOrFs, result, incomplete);
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
 * @param mkdir Injectable directory creator.
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
      throw new Error(`[collectAndCompareSkills] cannot write to ${opts.targetDir}: ${e.code}`, {
        cause: err,
      });
    }
    if (e.code === 'ENOTDIR') {
      throw new Error('[collectAndCompareSkills] .claude exists but is not a directory', {
        cause: err,
      });
    }
    throw err;
  }
  // #endregion END_VALIDATE_INPUTS

  const _writeFile = deps.writeFile!;
  const _mkdir = deps.mkdir!;

  // #region START_SCAN_SKILLS — invariants: scan source returns skill→files map; list target skills for orphan detection
  const shippedNames = new Set(listAvailableSkillNames(opts.sourceDir));
  const { skills: sourceSkills, incompleteSkills } = scanSkillsChecked(
    opts.sourceDir,
    opts.skillNames
  );

  let targetSkillNames: string[] = [];
  // null = the listing is unknown, so it must not be read as "the directory is empty" when
  // deciding which manifest entries are gone (main-derived invariant, ported for SO-2).
  let installedNames: string[] | null = null;
  try {
    targetSkillNames = deps.readdir!(opts.targetDir).filter((name) => {
      if (name.startsWith('.') || EXCLUDED_NAMES.has(name)) return false;
      try {
        return deps.stat!(join(opts.targetDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
    installedNames = [...targetSkillNames];
  } catch {
    // targetDir doesn't exist yet (created above), or readdir failed
  }
  // #endregion END_SCAN_SKILLS

  // The manifest from *before* this run — every internal-mirror deletion below is gated against
  // this snapshot, never against the manifest this run is about to write (SO-2b).
  const previousManifest = readSyncManifest(opts.targetDir, deps);

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
      const normalizedContent = normalize(sourceData.toString('utf-8'), SYNC_SKILLS_PATH_RULES);
      const normalizedData = Buffer.from(normalizedContent, 'utf-8');
      const targetData = targetFiles.get(relativePath);
      entries.push(
        syncFile(
          skillName,
          relativePath,
          normalizedData,
          targetData,
          targetSkillDir,
          opts.dryRun ?? false,
          _writeFile,
          _mkdir
        )
      );
      targetFiles.delete(relativePath);
    }

    // SO-2b/SO-7: delete only manifested files (isFileOwned) of a fully-read skill — a cut-short
    // read (incompleteSkills) looks exactly like a dropped file otherwise, so it is skipped too.
    for (const relativePath of [...targetFiles.keys()].sort()) {
      if (incompleteSkills.has(skillName)) continue;
      if (!isFileOwned(previousManifest, skillName, relativePath)) continue;
      entries.push({
        skillName,
        relativePath,
        status: 'deleted',
      });
      if (!opts.dryRun) {
        deps.unlink!(join(targetSkillDir, relativePath));
      }
    }

    targetSkillNames = targetSkillNames.filter((n) => n !== skillName);
  }
  const filterSkillNames = opts.skillNames;
  const orphanCandidates = filterSkillNames
    ? targetSkillNames.filter((n) => filterSkillNames.includes(n))
    : targetSkillNames;

  // SO-2: prune only what this tool owns — manifest, or first-run adoption policy.
  const owned = previousManifest ?? adoptPackageInstalled(installedNames ?? [], shippedNames);
  const orphansToDelete = orphanCandidates.filter((n) => owned.has(n));

  const prunedSkills = new Set<string>();
  for (const skillName of orphansToDelete.sort()) {
    const orphanEntries = deleteOrphan(skillName, opts.targetDir, opts.dryRun ?? false, deps);
    entries.push(...orphanEntries);
    if (!(opts.dryRun ?? false) && !orphanEntries.some((e) => e.status === 'deleteFailed')) {
      prunedSkills.add(skillName);
    }
  }
  // #endregion END_SYNC_AND_CLEAN

  // #region START_WRITE_MANIFEST — invariant: manifest reflects post-run ownership (SO-2/SO-2b)
  writeSyncManifest(
    opts.targetDir,
    computeNextManifestEntries(previousManifest, owned, sourceSkills, prunedSkills, installedNames),
    opts.dryRun ?? false,
    deps
  );
  // #endregion END_WRITE_MANIFEST

  return new SyncSkillsResult(entries);
}
