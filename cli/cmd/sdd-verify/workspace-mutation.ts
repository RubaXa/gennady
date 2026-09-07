// @file: Runtime write-zone boundary for exact-target phase repair.
// @consumers: phase-run.ts, sdd-verify.cmd.ts
// @tasks: N/A

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { inspectRepoPath } from '../../../shared/common/repo-path.ts';

type WorkspaceEntry = {
  state: string;
  canonical?: string;
  symlink: boolean;
};

type WorkspaceSnapshot = Map<string, WorkspaceEntry>;

/** @purpose Opaque pre-repair state used only by the matching workspace boundary. */
type RepairMutationSnapshot = {
  /** @purpose File/symlink state captured immediately before repair. */
  entries: WorkspaceSnapshot;
  /** @purpose Repo-relative Target File spellings accepted as direct writes. */
  allowedLexical: Set<string>;
  /** @purpose Canonical in-repo destinations accepted through symlink aliases. */
  allowedCanonical: Set<string>;
  /** @purpose Repo-relative directory roots whose descendants are explicit generated artifacts. */
  allowedLexicalTrees: Set<string>;
  /** @purpose Canonical directory roots whose descendants are explicit generated artifacts. */
  allowedCanonicalTrees: Set<string>;
};

type MutationResult = { ok: true } | { ok: false; issue: string; paths: string[] };

/** @purpose Runtime proof that repair changed only the phase's canonical Target Files. */
export type RepairMutationBoundary = {
  /**
   * @purpose Capture workspace state and the canonical write-zone before repair starts.
   * @param targets Structurally parsed phase Target Files.
   * @param [artifactDirectories] Explicit repo-local generated-artifact directory roots.
   * @returns Opaque pre-repair state and allowed destinations.
   */
  before: (
    targets: readonly string[],
    artifactDirectories?: readonly string[]
  ) => RepairMutationSnapshot;
  /**
   * @purpose Compare final state with the snapshot and name every outside-target mutation.
   * @param snapshot State captured immediately before the repair commands.
   * @param targets Same structurally parsed phase Target Files.
   * @param [artifactDirectories] Same explicit generated-artifact directory roots.
   * @returns Success only when every final mutation stayed inside the canonical write-zone.
   */
  after: (
    snapshot: RepairMutationSnapshot,
    targets: readonly string[],
    artifactDirectories?: readonly string[]
  ) => MutationResult;
  /**
   * @purpose Close one write-set segment and reuse that exact filesystem observation as the next
   *   segment's baseline, avoiding two identical full-tree hashes at a gate boundary.
   * @param snapshot Previous segment baseline.
   * @param targets Previous segment exact file write-set.
   * @param artifactDirectories Previous segment generated-artifact write-set.
   * @param nextTargets Next segment exact file write-set.
   * @param nextArtifactDirectories Next segment generated-artifact write-set.
   * @returns Previous segment result plus the already-observed next baseline.
   */
  checkpoint: (
    snapshot: RepairMutationSnapshot,
    targets: readonly string[],
    artifactDirectories: readonly string[],
    nextTargets: readonly string[],
    nextArtifactDirectories: readonly string[]
  ) => { result: MutationResult; snapshot: RepairMutationSnapshot };
};

/** @purpose Canonical identity of every phase target before commands start. */
export type TargetContainmentSnapshot = {
  /** @purpose Canonical project root used for every containment comparison. */
  root: string;
  /** @purpose Exact lexical target and its initial canonical destination. */
  targets: readonly { path: string; canonical: string }[];
};

/** @purpose Stable lexical/canonical identity of the receipt-owning ticket. */
export type TicketContainmentSnapshot = {
  /** @purpose Canonical project root used for containment comparisons. */
  root: string;
  /** @purpose Repo-relative lexical ticket path; it must remain a regular path. */
  path: string;
  /** @purpose Canonical destination captured before any receipt mutation. */
  canonical: string;
  /** @purpose Expected mode+bytes, advanced only by this transaction's own atomic write. */
  state: string;
  /** @purpose Expected filesystem device, advanced only by this transaction's own rename. */
  dev: number;
  /** @purpose Expected filesystem inode, advanced only by this transaction's own rename. */
  ino: number;
};

const EXCLUDED_TOOL_DIRS = new Set(['.git', 'node_modules']);

function repoPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function isInsideOrSame(root: string, path: string): boolean {
  return root === path || isInside(root, path);
}

function pathInsideTree(path: string, tree: string): boolean {
  return path === tree || path.startsWith(`${tree}/`);
}

function canonicalIfPresent(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function regularFileState(path: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular non-symlink file');
  return `file:${stat.mode}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function snapshotWorkspace(root: string): WorkspaceSnapshot {
  const entries: WorkspaceSnapshot = new Map();
  const visit = (directory: string): void => {
    for (const dirent of readdirSync(directory, { withFileTypes: true })) {
      if (dirent.isDirectory() && EXCLUDED_TOOL_DIRS.has(dirent.name)) continue;
      const absolute = resolve(directory, dirent.name);
      const lexical = repoPath(root, absolute);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.set(lexical, {
          state: `directory:${stat.mode}`,
          canonical: canonicalIfPresent(absolute),
          symlink: false,
        });
        visit(absolute);
        continue;
      }
      if (stat.isSymbolicLink()) {
        entries.set(lexical, {
          state: `symlink:${stat.mode}:${readlinkSync(absolute)}`,
          canonical: canonicalIfPresent(absolute),
          symlink: true,
        });
        continue;
      }
      if (!stat.isFile()) continue;
      entries.set(lexical, {
        state: `file:${stat.mode}:${createHash('sha256').update(readFileSync(absolute)).digest('hex')}`,
        canonical: canonicalIfPresent(absolute),
        symlink: false,
      });
    }
  };
  visit(root);
  return entries;
}

/**
 * @purpose Capture the canonical identity and containment of every phase target before execution.
 * @param root Canonical project root.
 * @param targets Exact repo-relative phase Target Files.
 * @returns Stable target identity snapshot; throws when any target is missing or escapes.
 */
export function captureTargetContainment(
  root: string,
  targets: readonly string[]
): TargetContainmentSnapshot {
  const canonicalRoot = realpathSync(root);
  return {
    root: canonicalRoot,
    targets: targets.map((path) => {
      const inspected = inspectRepoPath(canonicalRoot, path, 'file');
      if (!inspected.ok) throw new Error(`Target File ${inspected.detail}: ${path}`);
      return { path: inspected.relative, canonical: inspected.absolute };
    }),
  };
}

/**
 * @purpose Revalidate target containment and canonical identity immediately before receipt creation.
 * @param snapshot Identity captured before the phase ladder.
 * @returns Null when every target still resolves to the same in-project file, otherwise a receipt blocker.
 */
export function targetContainmentIssue(snapshot: TargetContainmentSnapshot): string | null {
  try {
    for (const target of snapshot.targets) {
      const inspected = inspectRepoPath(snapshot.root, target.path, 'file');
      if (!inspected.ok) return `Target File ${inspected.detail}: ${target.path}`;
      if (inspected.absolute !== target.canonical)
        return `Target File canonical destination changed during verification: ${target.path}`;
    }
    return null;
  } catch (cause) {
    return `Target File became missing or unreadable during verification: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

/**
 * @purpose Capture a receipt ticket whose lexical path is safe for atomic replacement.
 * @invariant Neither the file nor an in-project parent component may be a symlink alias.
 * @param root Project root.
 * @param path Repo-relative receipt-owning ticket path.
 * @returns Stable initial destination and byte identity.
 */
export function captureTicketContainment(root: string, path: string): TicketContainmentSnapshot {
  const canonicalRoot = realpathSync(root);
  const lexical = resolve(canonicalRoot, path);
  if (!isInside(canonicalRoot, lexical)) throw new Error(`ticket escapes the project: ${path}`);
  const stat = lstatSync(lexical);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`ticket must be a regular non-symlink file: ${path}`);
  const canonical = realpathSync(lexical);
  if (!isInside(canonicalRoot, canonical))
    throw new Error(`ticket resolves outside the project: ${path}`);
  if (canonical !== lexical) throw new Error(`ticket path contains a symlink alias: ${path}`);
  return {
    root: canonicalRoot,
    path,
    canonical,
    state: regularFileState(lexical),
    dev: stat.dev,
    ino: stat.ino,
  };
}

/** @purpose Fail closed if a command replaced or retargeted the receipt-owning ticket. | @param snapshot Expected ticket identity. | @returns Teaching issue, or null while identity is unchanged. */
export function ticketContainmentIssue(snapshot: TicketContainmentSnapshot): string | null {
  try {
    const lexical = resolve(snapshot.root, snapshot.path);
    const stat = lstatSync(lexical);
    if (!stat.isFile() || stat.isSymbolicLink())
      return `ticket is no longer a regular non-symlink file: ${snapshot.path}`;
    const canonical = realpathSync(lexical);
    if (!isInside(snapshot.root, canonical))
      return `ticket resolves outside the project: ${snapshot.path}`;
    if (canonical !== snapshot.canonical)
      return `ticket canonical destination changed during verification: ${snapshot.path}`;
    if (stat.dev !== snapshot.dev || stat.ino !== snapshot.ino)
      return `ticket file identity changed during verification: ${snapshot.path}`;
    if (regularFileState(lexical) !== snapshot.state)
      return `ticket bytes changed outside the receipt transaction: ${snapshot.path}`;
    return null;
  } catch (cause) {
    return `ticket became missing or unreadable during verification: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

/** @purpose Advance expected ticket bytes to this transaction's exact atomic-write payload, then prove those bytes occupy the canonical path. | @param snapshot Mutable transaction-owned ticket identity. | @param content Exact UTF-8 receipt payload passed to writeFile. | @param mode Regular-file mode of the temporary file. | @param dev Device of the exclusively created temporary file. | @param ino Inode of the exclusively created temporary file. | @returns Teaching issue, or null after the expected owned write is observed. */
export function acceptTicketOwnedWrite(
  snapshot: TicketContainmentSnapshot,
  content: string,
  mode: number,
  dev: number,
  ino: number
): string | null {
  snapshot.state = `file:${mode}:${createHash('sha256').update(content, 'utf-8').digest('hex')}`;
  snapshot.dev = dev;
  snapshot.ino = ino;
  return ticketContainmentIssue(snapshot);
}

function changedPaths(before: WorkspaceSnapshot, after: WorkspaceSnapshot): string[] {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path)?.state !== after.get(path)?.state)
    .sort();
}

/**
 * @purpose Create a before/after filesystem boundary around phase repair.
 * @invariant The only excluded trees are VCS metadata and installed dependencies; generated,
 *   ignored and untracked project files remain observable.
 * @param root Canonical project root.
 * @param [operation] Human-readable transaction stage named by a failure diagnostic.
 * @returns Boundary that fails closed on every final workspace mutation outside canonical targets.
 */
export function createRepairMutationBoundary(
  root: string,
  operation = 'repair'
): RepairMutationBoundary {
  const canonicalRoot = realpathSync(root);
  const boundarySnapshot = (
    entries: WorkspaceSnapshot,
    targets: readonly string[],
    artifactDirectories: readonly string[]
  ): RepairMutationSnapshot => {
    const allowedLexical = new Set<string>();
    const allowedCanonical = new Set<string>();
    const allowedLexicalTrees = new Set<string>();
    const allowedCanonicalTrees = new Set<string>();
    for (const target of targets) {
      const inspected = inspectRepoPath(canonicalRoot, target, 'file');
      if (!inspected.ok) throw new Error(`Target File ${inspected.detail}: ${target}`);
      allowedLexical.add(inspected.relative);
      allowedCanonical.add(inspected.absolute);
    }
    for (const directory of artifactDirectories) {
      const absolute = resolve(canonicalRoot, directory);
      if (!isInside(canonicalRoot, absolute))
        throw new Error(`artifact directory must be a narrow repo-local path: ${directory}`);
      const canonical = canonicalIfPresent(absolute) ?? absolute;
      if (!isInside(canonicalRoot, canonical))
        throw new Error(`artifact directory resolves outside the project: ${directory}`);
      allowedLexicalTrees.add(repoPath(canonicalRoot, absolute));
      allowedCanonicalTrees.add(canonical);
    }
    return {
      entries,
      allowedLexical,
      allowedCanonical,
      allowedLexicalTrees,
      allowedCanonicalTrees,
    };
  };
  const inspect = (
    snapshot: RepairMutationSnapshot,
    current: WorkspaceSnapshot,
    targets: readonly string[],
    artifactDirectories: readonly string[]
  ): MutationResult => {
    const escapedTargets: string[] = [];
    for (const target of targets) {
      const inspected = inspectRepoPath(canonicalRoot, target, 'file');
      if (!inspected.ok) escapedTargets.push(target);
    }
    for (const directory of artifactDirectories) {
      const absolute = resolve(canonicalRoot, directory);
      const canonical = canonicalIfPresent(absolute) ?? absolute;
      if (!isInside(canonicalRoot, absolute) || !isInside(canonicalRoot, canonical))
        escapedTargets.push(directory);
    }

    const outside = changedPaths(snapshot.entries, current).filter((path) => {
      const beforeEntry = snapshot.entries.get(path);
      const afterEntry = current.get(path);
      const candidates = [beforeEntry?.canonical, afterEntry?.canonical].filter(
        (candidate): candidate is string => candidate !== undefined
      );
      if (snapshot.allowedLexical.has(path) && !beforeEntry?.symlink && !afterEntry?.symlink)
        return false;
      const insideArtifactTree = [...snapshot.allowedLexicalTrees].some((tree) =>
        pathInsideTree(path, tree)
      );
      if (
        insideArtifactTree &&
        candidates.length > 0 &&
        candidates.every((candidate) =>
          [...snapshot.allowedCanonicalTrees].some((tree) => isInsideOrSame(tree, candidate))
        )
      )
        return false;
      return (
        candidates.length === 0 ||
        candidates.some((candidate) => !snapshot.allowedCanonical.has(candidate))
      );
    });
    const paths = [...new Set([...escapedTargets, ...outside])].sort();
    if (paths.length === 0) return { ok: true };
    return {
      ok: false,
      issue: `${operation} mutated paths outside its permitted write-set; changes were left intact for operator inspection`,
      paths,
    };
  };
  return {
    before(targets, artifactDirectories = []) {
      return boundarySnapshot(snapshotWorkspace(canonicalRoot), targets, artifactDirectories);
    },
    after(snapshot, targets, artifactDirectories = []) {
      let current: WorkspaceSnapshot;
      try {
        current = snapshotWorkspace(canonicalRoot);
      } catch (cause) {
        return {
          ok: false,
          issue: `cannot inspect workspace after ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
          paths: [],
        };
      }

      return inspect(snapshot, current, targets, artifactDirectories);
    },
    checkpoint(snapshot, targets, artifactDirectories, nextTargets, nextArtifactDirectories) {
      const current = snapshotWorkspace(canonicalRoot);
      return {
        result: inspect(snapshot, current, targets, artifactDirectories),
        snapshot: boundarySnapshot(current, nextTargets, nextArtifactDirectories),
      };
    },
  };
}
