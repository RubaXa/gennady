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

// A skill's tests belong to this repository, not to the consumer: they import from the gennady
// checkout (`shared/`, `services/`), so deploying them puts unresolvable imports into someone
// else's tree and breaks the typecheck of a file they never wrote.
/** @purpose Names never deployed into a project: hidden files, system artifacts, skill tests. */
const EXCLUDED_NAMES = new Set(['.DS_Store', '__tests__']);

/**
 * @purpose Name of the file recording which skills this sync installed.
 * @invariant Dot-prefixed on purpose: every readdir filter here already skips `.`-names,
 *   so the manifest can never be mistaken for a skill directory.
 */
const MANIFEST_NAME = '.gennady-synced';

/**
 * @purpose Read the set of skill names a previous sync installed into the target.
 * @invariant null means "no usable manifest": an unreadable one is treated as absent, so
 *   ownership falls back to `adoptPackageInstalled`, which can only under-claim.
 * @param targetDir Skills directory being synced into.
 * @param deps Injectable IO.
 * @returns The recorded names, or null when no manifest exists (never synced by this version).
 */
export function readSyncManifest(targetDir: string, deps: SyncCmdDeps): Set<string> | null {
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
 * @purpose Record which skills this sync owns, so the next run can prune only those.
 * @param targetDir Skills directory being synced into.
 * @param names Owned skill names: the previous manifest merged with this run's, minus pruned.
 * @param dryRun When true, nothing is written.
 * @param deps Injectable IO.
 */
export function writeSyncManifest(
  targetDir: string,
  names: readonly string[],
  dryRun: boolean,
  deps: SyncCmdDeps
): void {
  if (dryRun) return;
  const body =
    '# Skills owned by `gennady sync-skills`. Only these are pruned when they\n' +
    '# disappear from the package. Anything else in this directory is left alone.\n' +
    '# A first sync adopts only the skills the package ships then; leftovers from\n' +
    '# older versions cannot be told apart from your own skills and stay untouched.\n' +
    [...names].sort().join('\n') +
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
export function adoptPackageInstalled(
  targetSkillNames: readonly string[],
  shippedNames: ReadonlySet<string>
): Set<string> {
  return new Set(targetSkillNames.filter((name) => shippedNames.has(name)));
}

/**
 * @purpose Compute the manifest for the next run: previous ownership merged with this run's.
 * @invariant Merge, never replace: a filtered run (`gennady sync-skills sdd-execute`) must not
 *   drop ownership of the skills it did not touch.
 * @invariant A skill whose deletion failed stays owned, so the next run retries it; one whose
 *   deletion succeeded, or whose directory is gone, is dropped.
 * @param owned Ownership going into this run (manifest, or the adopted set on a first run).
 * @param syncedNames Skills installed by this run.
 * @param prunedNames Orphans this run deleted successfully.
 * @param present Target skill directories seen before syncing, or null when unreadable.
 * @returns Names to record.
 */
export function nextManifestNames(
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

/** @purpose True for a test file that must stay in this repo rather than ship with the skill. */
function isTestArtifact(name: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
}

/**
 * @purpose Scan several skill roots into one map, so plugin-owned skills sync like any other.
 * @invariant The name filter applies to the union, not per root; an empty directory never
 *   shadows a root with real files.
 * @invariant An unreadable root is fatal: swallowing EACCES empties `merged`, and the orphan
 *   pass then deletes every synced skill.
 * @param roots Skill roots, base first; plugin roots may be absent, the base must be readable.
 * @param [skillNames] Optional filter, checked against the union.
 * @throws If a requested skill is in no root, or a root exists but cannot be read.
 * @returns Map of skill names to their file contents.
 */
export function scanSkillRoots(
  roots: readonly string[],
  skillNames?: string[]
): Map<string, Map<string, Buffer>> {
  return selectSkills(scanAllSkillRoots(roots), skillNames);
}

/**
 * @purpose Scan every root into one map, keeping all names — the set the package ships.
 * @invariant Ownership is recorded per package, not per run, so a filtered sync still needs
 *   every name; `selectSkills` applies the filter afterwards.
 * @param roots Skill roots, base first; plugin roots may be absent, the base must be readable.
 * @throws If a root exists but cannot be read.
 * @returns Map of skill names to their file contents.
 */
export function scanAllSkillRoots(roots: readonly string[]): Map<string, Map<string, Buffer>> {
  const merged = new Map<string, Map<string, Buffer>>();
  for (const [index, root] of roots.entries()) {
    let scanned: Map<string, Map<string, Buffer>>;
    try {
      scanned = scanSkills(root);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Only a MISSING plugin root is normal (a plugin without skills). The base root, and
      // any other failure (EACCES, EIO), must stay fatal — matching the pre-plugin behavior.
      if (index > 0 && (code === 'ENOENT' || code === 'ENOTDIR')) {
        continue;
      }
      throw error;
    }
    for (const [name, files] of scanned) {
      // An empty directory must never shadow a real skill: a leftover mount point or a
      // half-cleaned staging run would silently drop the skill from every sync.
      const existing = merged.get(name);
      if (existing === undefined || (existing.size === 0 && files.size > 0)) {
        merged.set(name, files);
      }
    }
  }

  return merged;
}

/**
 * @purpose Narrow a scanned union to a requested subset.
 * @param merged Scanned skills, unfiltered.
 * @param [skillNames] Optional filter, checked against the union.
 * @throws If a requested skill is in no root.
 * @returns The subset, or `merged` when no filter was given.
 */
export function selectSkills(
  merged: Map<string, Map<string, Buffer>>,
  skillNames?: string[]
): Map<string, Map<string, Buffer>> {
  if (skillNames === undefined || skillNames.length === 0) {
    return merged;
  }

  const missing = skillNames.filter((name) => !merged.has(name));
  if (missing.length > 0) {
    const error = new Error(
      `[scanSkillRoots] skill(s) not found in source: ${missing.join(', ')}\nAvailable: ${[...merged.keys()].sort().join(', ')}`
    );
    (error as Error & { code: string }).code = ERR_SKILLS_SKILL_NOT_FOUND;
    throw error;
  }
  return new Map([...merged].filter(([name]) => skillNames.includes(name)));
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
    if (name.startsWith('.') || EXCLUDED_NAMES.has(name) || isTestArtifact(name)) continue;

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
  const _rm = deps.rm ?? (() => {});

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
    _rm(orphanDir, { recursive: true, force: true });
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
  const shippedSkills = scanAllSkillRoots([opts.sourceDir, ...(opts.extraSourceDirs ?? [])]);
  const sourceSkills = selectSkills(shippedSkills, opts.skillNames);

  let targetSkillNames: string[] = [];
  // null = the listing is unknown, so it must not be read as "the directory is empty" when
  // deciding which manifest entries are gone.
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
    }

    // Remove processed skill from targetSkillNames so remainder = orphans
    targetSkillNames = targetSkillNames.filter((n) => n !== skillName);
  }
  const filterSkillNames = opts.skillNames;
  const orphanCandidates = filterSkillNames
    ? targetSkillNames.filter((n) => filterSkillNames.includes(n))
    : targetSkillNames;

  // Prune only what this tool owns — the manifest, or the migration policy on a first run.
  const manifest = readSyncManifest(opts.targetDir, deps);
  const owned =
    manifest ?? adoptPackageInstalled(installedNames ?? [], new Set(shippedSkills.keys()));
  const orphansToDelete = orphanCandidates.filter((n) => owned.has(n));

  const pruned = new Set<string>();
  for (const skillName of orphansToDelete.sort()) {
    const orphanEntries = deleteOrphan(skillName, opts.targetDir, opts.dryRun ?? false, deps);
    entries.push(...orphanEntries);
    // A dry run deletes nothing, so it may never drop the name from the manifest.
    if (!(opts.dryRun ?? false) && !orphanEntries.some((e) => e.status === 'deleteFailed')) {
      pruned.add(skillName);
    }
  }

  writeSyncManifest(
    opts.targetDir,
    nextManifestNames(owned, [...sourceSkills.keys()], pruned, installedNames),
    opts.dryRun ?? false,
    deps
  );
  // #endregion END_SYNC_AND_CLEAN

  return new SyncSkillsResult(entries);
}
