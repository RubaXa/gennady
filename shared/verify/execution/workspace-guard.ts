// @file: Dirty-safe checkpoint and write-boundary guard for the target verify executor.
// @spec: CLI-VERIFY
// @consumers: target local executor (UV-09), repair loop (UV-10)

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import type { VerifyMutation } from '../model/verify-report.type.ts';
import type {
  PlannedVerifyStep,
  QualifiedStepId,
  WriteBoundary,
} from '../model/verify-step.type.ts';

type WorkspaceProblemCode =
  | 'VERIFY_WORKSPACE_NOT_GIT'
  | 'VERIFY_WORKSPACE_LOCKED'
  | 'VERIFY_WORKSPACE_CHECKPOINT_FAILED'
  | 'VERIFY_WORKSPACE_RESTORE_FAILED'
  | 'VERIFY_WORKSPACE_REPOSITORY_MUTATION'
  | 'VERIFY_WORKSPACE_STEP_STATE'
  | 'VERIFY_WRITE_BOUNDARY_REQUIRED'
  | 'VERIFY_WRITE_BOUNDARY_UNSAFE'
  | 'VERIFY_WORKSPACE_WRITE_VIOLATION';

type WorkspaceProblem = {
  readonly code: WorkspaceProblemCode;
  readonly message: string;
  readonly paths?: readonly string[];
};

type StepOutcome =
  | { readonly kind: 'accepted'; readonly mutations: readonly VerifyMutation[] }
  | { readonly kind: 'rolled-back'; readonly mutations: readonly VerifyMutation[] }
  | {
      readonly kind: 'violation';
      readonly mutations: readonly VerifyMutation[];
      readonly error: WorkspaceProblem;
      readonly restored: true;
    }
  | {
      readonly kind: 'error';
      readonly mutations: readonly VerifyMutation[];
      readonly error: WorkspaceProblem;
      readonly restored: boolean;
    };

/** @purpose Own one exact dirty-worktree checkpoint and enforce every target step's effects. */
export type WorkspaceGuard = {
  /** @purpose Canonical Git toplevel owned by this transaction. */
  readonly toplevel: string;
  /**
   * @purpose Arm one step after validating its effect and repair write boundary.
   * @param step Validated selected DAG node about to execute.
   * @returns Ready, or a typed fail-closed policy error.
   */
  beginStep(
    step: PlannedVerifyStep
  ): { readonly kind: 'ready' } | { readonly kind: 'error'; readonly error: WorkspaceProblem };
  /**
   * @purpose Attribute mutations, advance an allowed checkpoint, or restore rejected/failed work.
   * @param stepId Qualified identity that must match the armed step.
   * @param result Executor terminal success used to reject partial failed repairs.
   * @returns Deterministic mutation outcome and restoration state.
   */
  finishStep(stepId: QualifiedStepId, result: { readonly succeeded: boolean }): StepOutcome;
  /**
   * @purpose Cooperatively restore the last valid checkpoint and return the POSIX signal code.
   * @param signal Interrupt whose conventional terminal code must be preserved.
   * @returns Cancellation code, or a retryable restore failure with the lock retained.
   */
  cancel(
    signal: 'SIGINT' | 'SIGTERM'
  ):
    | { readonly kind: 'cancelled'; readonly exitCode: 130 | 143 }
    | { readonly kind: 'error'; readonly error: WorkspaceProblem };
  /**
   * @purpose Close a successful run without rewriting user or accepted repair state.
   * @returns Released ownership, or a retryable restore failure for an active step.
   */
  release():
    | { readonly kind: 'released' }
    | { readonly kind: 'error'; readonly error: WorkspaceProblem };
};

type WorkspaceGuardOptions = {
  /** @purpose Install cooperative SIGINT/SIGTERM restoration (default true; false for embedding/tests). */
  readonly signalHandlers?: boolean;
};

type WorkspaceGuardAcquisition =
  | { readonly kind: 'guard'; readonly guard: WorkspaceGuard }
  | { readonly kind: 'error'; readonly error: WorkspaceProblem };

type SnapshotEntry =
  | {
      readonly kind: 'file';
      readonly mode: number;
      readonly hash: string;
      readonly blob: string;
    }
  | {
      readonly kind: 'symlink';
      readonly mode: number;
      readonly target: string;
      readonly hash: string;
    };

type SnapshotManifest = {
  readonly version: 1;
  readonly root: string;
  readonly indexPath: string;
  readonly indexMode: number;
  readonly indexHash: string;
  readonly indexIdentity: string;
  readonly repository: RepositoryIdentity;
  readonly entries: Readonly<Record<string, SnapshotEntry>>;
};

type RepositoryIdentity = {
  readonly headPath: string;
  readonly headMode: number;
  readonly headHash: string;
  readonly resolvedHead: string;
  readonly refs: Readonly<Record<string, string>>;
};

type Checkpoint = {
  readonly id: string;
  readonly directory: string;
  readonly manifest: SnapshotManifest;
};

type WorkspaceLock = {
  readonly kind: 'workspace-guard-v1';
  readonly pid: number;
  readonly root: string;
  readonly checkpointId: string;
  readonly phase: 'capturing' | 'ready' | 'restoring';
  readonly startedAt: string;
};

type ActiveStep = {
  readonly step: PlannedVerifyStep;
  readonly boundary: NormalizedBoundary | null;
};

type NormalizedBoundary = {
  readonly root: string;
  readonly include: readonly {
    readonly source: string;
    readonly matches: (value: string) => boolean;
    readonly matchesPrefix: (value: string) => boolean;
  }[];
  readonly exclude: readonly {
    readonly source: string;
    readonly matches: (value: string) => boolean;
    readonly matchesPrefix: (value: string) => boolean;
  }[];
};

function problem(
  code: WorkspaceProblemCode,
  message: string,
  paths?: readonly string[]
): WorkspaceProblem {
  return { code, message, ...(paths === undefined ? {} : { paths }) };
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function normalizedRelativePath(value: string, label: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(value) ||
    normalized.startsWith('/') ||
    normalized.endsWith('/') ||
    normalized.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`${label} must be a non-empty repository-relative file pattern: ${value}`);
  }
  return normalized;
}

function firstDynamicCharacter(pattern: string): number {
  const positions = ['*', '?', '[', '{', '(']
    .map((character) => pattern.indexOf(character))
    .filter((position) => position !== -1);
  return positions.length === 0 ? -1 : Math.min(...positions);
}

function canAddressGitMetadata(pattern: string): boolean {
  const firstSlash = pattern.indexOf('/');
  const firstSegment = firstSlash === -1 ? pattern : pattern.slice(0, firstSlash);
  if (minimatch('.git', firstSegment, { dot: true, nonegate: true })) return true;
  if (firstSlash === -1) return false;
  const firstDynamic = firstDynamicCharacter(pattern);
  return firstDynamic !== -1 && firstDynamic < firstSlash;
}

function assertNoSymlinkComponents(root: string, relative: string): void {
  let current = root;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`write boundary traverses symlink ${path.relative(root, current)}`);
    }
    if (!stat.isDirectory() && current !== path.join(root, relative)) return;
  }
}

function normalizeBoundary(repoRoot: string, boundary: WriteBoundary): NormalizedBoundary {
  const lexicalRoot = path.resolve(boundary.root);
  if (!fs.existsSync(lexicalRoot) || !fs.statSync(lexicalRoot).isDirectory()) {
    throw new Error(`write boundary root must be an existing directory: ${boundary.root}`);
  }
  const realRoot = fs.realpathSync(lexicalRoot);
  if (!isInside(repoRoot, realRoot)) {
    throw new Error(`write boundary root escapes repository: ${boundary.root}`);
  }
  const relativeRoot = path.relative(repoRoot, realRoot).replaceAll(path.sep, '/');
  if (relativeRoot === '.git' || relativeRoot.startsWith('.git/')) {
    throw new Error('write boundary cannot target Git metadata');
  }
  if (relativeRoot !== '') assertNoSymlinkComponents(repoRoot, relativeRoot);
  if (boundary.include.length === 0)
    throw new Error('repair write boundary include must not be empty');

  const compile = (value: string, label: string, include: boolean) => {
    const source = normalizedRelativePath(value, label);
    const dynamic = firstDynamicCharacter(source);
    const staticPart = dynamic === -1 ? source : source.slice(0, dynamic).replace(/\/$/, '');
    if (include && staticPart !== '') assertNoSymlinkComponents(realRoot, staticPart);
    return {
      source,
      matches: (candidate: string) => minimatch(candidate, source, { dot: true, nonegate: true }),
      matchesPrefix: (candidate: string) =>
        minimatch(candidate, source, { dot: true, nonegate: true, partial: true }),
    };
  };
  const exclude = (boundary.exclude ?? []).map((value) => compile(value, 'writes.exclude', false));
  const include = boundary.include.map((value) => compile(value, 'writes.include', true));
  if (
    realRoot === repoRoot &&
    include.some(({ source }) => canAddressGitMetadata(source)) &&
    !exclude.some(({ source }) => source === '.git/**')
  ) {
    throw new Error('write boundary capable of matching Git metadata must exclude .git/**');
  }
  const normalized: NormalizedBoundary = {
    root: realRoot,
    include,
    exclude,
  };
  const subtreeExcluded = (relative: string) =>
    normalized.exclude.some(({ source }) => {
      if (!source.endsWith('/**')) return false;
      return minimatch(relative, source.slice(0, -3), { dot: true, nonegate: true });
    });
  const pending: { readonly absolute: string; readonly relative: string }[] = [
    { absolute: realRoot, relative: '' },
  ];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = fs
      .readdirSync(directory.absolute, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const relative =
        directory.relative === '' ? entry.name : `${directory.relative}/${entry.name}`;
      if (subtreeExcluded(relative)) continue;
      const absolute = path.join(directory.absolute, entry.name);
      const stat = fs.lstatSync(absolute);
      const intersects = normalized.include.some(({ matchesPrefix }) => matchesPrefix(relative));
      if (stat.isSymbolicLink()) {
        if (intersects) throw new Error(`write boundary can traverse symlink ${relative}`);
        continue;
      }
      if (stat.isDirectory() && intersects) pending.push({ absolute, relative });
    }
  }
  return normalized;
}

function indexPath(root: string): string {
  const raw = git(root, ['rev-parse', '--git-path', 'index']).trim();
  return path.isAbsolute(raw) ? raw : path.resolve(root, raw);
}

function repositoryIdentity(root: string): RepositoryIdentity {
  const rawHeadPath = git(root, ['rev-parse', '--git-path', 'HEAD']).trim();
  const headPath = path.isAbsolute(rawHeadPath) ? rawHeadPath : path.resolve(root, rawHeadPath);
  const headStat = fs.lstatSync(headPath);
  if (!headStat.isFile() || headStat.isSymbolicLink()) {
    throw new Error(`git HEAD must be a regular non-symlink file: ${headPath}`);
  }
  const refs: Record<string, string> = {};
  for (const line of git(root, ['for-each-ref', '--format=%(refname)%09%(objectname)'])
    .split('\n')
    .filter(Boolean)) {
    const separator = line.indexOf('\t');
    if (separator <= 0) throw new Error(`cannot parse git ref identity: ${line}`);
    refs[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return {
    headPath,
    headMode: headStat.mode & 0o777,
    headHash: sha256(fs.readFileSync(headPath)),
    resolvedHead: git(root, ['rev-parse', '--verify', 'HEAD']).trim(),
    refs,
  };
}

function listedWorkspacePaths(root: string): readonly string[] {
  return git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0')
    .filter(Boolean)
    .map((value) => normalizedRelativePath(value, 'git path'))
    .sort(compareText);
}

function safeEntry(root: string, relative: string): fs.Stats | null {
  let current = root;
  const components = relative.split('/');
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (index < components.length - 1 && !stat.isDirectory()) return null;
    if (index === components.length - 1) return stat;
  }
  return null;
}

function captureCheckpoint(root: string, directory: string, id: string): Checkpoint {
  fs.mkdirSync(path.join(directory, 'blobs'), { recursive: true });
  const entries: Record<string, SnapshotEntry> = {};
  for (const relative of listedWorkspacePaths(root)) {
    const absolute = path.join(root, ...relative.split('/'));
    const stat = safeEntry(root, relative);
    if (stat === null) continue;
    const mode = stat.mode & 0o777;
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(absolute);
      entries[relative] = { kind: 'symlink', mode, target, hash: sha256(`symlink\0${target}`) };
      continue;
    }
    if (!stat.isFile()) {
      throw new Error(`workspace checkpoint supports only regular files and symlinks: ${relative}`);
    }
    const contents = fs.readFileSync(absolute);
    const hash = sha256(contents);
    const blob = path.join('blobs', sha256(relative));
    fs.writeFileSync(path.join(directory, blob), contents, { flag: 'wx', mode });
    entries[relative] = { kind: 'file', mode, hash, blob };
  }

  const sourceIndex = indexPath(root);
  const sourceIndexStat = fs.lstatSync(sourceIndex);
  if (!sourceIndexStat.isFile() || sourceIndexStat.isSymbolicLink()) {
    throw new Error(`git index must be a regular non-symlink file: ${sourceIndex}`);
  }
  const checkpointIndex = path.join(directory, 'index');
  fs.copyFileSync(sourceIndex, checkpointIndex, fs.constants.COPYFILE_EXCL);
  const checkpointIndexContents = fs.readFileSync(checkpointIndex);
  const repository = repositoryIdentity(root);
  fs.copyFileSync(repository.headPath, path.join(directory, 'head'), fs.constants.COPYFILE_EXCL);
  const manifest: SnapshotManifest = {
    version: 1,
    root,
    indexPath: sourceIndex,
    indexMode: sourceIndexStat.mode & 0o777,
    indexHash: sha256(checkpointIndexContents),
    indexIdentity: sha256(git(root, ['ls-files', '--stage', '-z'])),
    repository,
    entries,
  };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx' });
  return { id, directory, manifest };
}

function loadCheckpoint(directory: string, id: string, expectedRoot: string): Checkpoint {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'manifest.json'), 'utf-8')
  ) as SnapshotManifest;
  if (
    manifest.version !== 1 ||
    manifest.root !== expectedRoot ||
    manifest.indexPath !== indexPath(expectedRoot) ||
    !Number.isInteger(manifest.indexMode) ||
    typeof manifest.indexHash !== 'string' ||
    manifest.repository === null ||
    typeof manifest.repository !== 'object' ||
    manifest.entries === null ||
    typeof manifest.entries !== 'object'
  ) {
    throw new Error('checkpoint metadata does not belong to this repository');
  }
  const checkpoint = { id, directory, manifest };
  verifyCheckpointIntegrity(checkpoint);
  return checkpoint;
}

function verifyCheckpointIntegrity(checkpoint: Checkpoint): void {
  const { directory, manifest } = checkpoint;
  const expectedHeadPath = (() => {
    const raw = git(manifest.root, ['rev-parse', '--git-path', 'HEAD']).trim();
    return path.isAbsolute(raw) ? raw : path.resolve(manifest.root, raw);
  })();
  if (
    manifest.repository.headPath !== expectedHeadPath ||
    !Number.isInteger(manifest.repository.headMode) ||
    typeof manifest.repository.headHash !== 'string' ||
    typeof manifest.repository.resolvedHead !== 'string' ||
    manifest.repository.refs === null ||
    typeof manifest.repository.refs !== 'object'
  ) {
    throw new Error('checkpoint repository identity is invalid');
  }
  for (const [relative, entry] of Object.entries(manifest.entries)) {
    if (normalizedRelativePath(relative, 'checkpoint path') !== relative) {
      throw new Error(`checkpoint contains an unsafe path: ${relative}`);
    }
    if (entry.kind === 'file') {
      if (entry.blob !== path.join('blobs', sha256(relative))) {
        throw new Error(`checkpoint contains an unsafe blob reference: ${relative}`);
      }
      const blob = path.join(directory, entry.blob);
      const stat = fs.lstatSync(blob);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`checkpoint blob is not a regular file: ${relative}`);
      }
      if (sha256(fs.readFileSync(blob)) !== entry.hash) {
        throw new Error(`checkpoint blob hash mismatch: ${relative}`);
      }
    } else if (entry.kind === 'symlink' && typeof entry.target === 'string') {
      if (sha256(`symlink\0${entry.target}`) !== entry.hash) {
        throw new Error(`checkpoint symlink hash mismatch: ${relative}`);
      }
    } else {
      throw new Error(`checkpoint contains an unsupported entry: ${relative}`);
    }
  }
  const checkpointIndex = path.join(directory, 'index');
  const indexStat = fs.lstatSync(checkpointIndex);
  if (!indexStat.isFile() || indexStat.isSymbolicLink()) {
    throw new Error('checkpoint index is not a regular file');
  }
  if (sha256(fs.readFileSync(checkpointIndex)) !== manifest.indexHash) {
    throw new Error('checkpoint index hash mismatch');
  }
  const checkpointHead = path.join(directory, 'head');
  const headStat = fs.lstatSync(checkpointHead);
  if (!headStat.isFile() || headStat.isSymbolicLink()) {
    throw new Error('checkpoint HEAD is not a regular file');
  }
  if (sha256(fs.readFileSync(checkpointHead)) !== manifest.repository.headHash) {
    throw new Error('checkpoint HEAD hash mismatch');
  }
  for (const [ref, oid] of Object.entries(manifest.repository.refs)) {
    if (!ref.startsWith('refs/') || !/^[0-9a-f]{40,64}$/.test(oid)) {
      throw new Error(`checkpoint contains invalid ref identity: ${ref}`);
    }
    git(manifest.root, ['check-ref-format', ref]);
  }
}

function repositoryMutationPaths(
  expected: RepositoryIdentity,
  current: RepositoryIdentity
): readonly string[] {
  const changed = new Set<string>();
  if (expected.headHash !== current.headHash || expected.resolvedHead !== current.resolvedHead) {
    changed.add('.git/HEAD');
  }
  for (const ref of [...new Set([...Object.keys(expected.refs), ...Object.keys(current.refs)])]) {
    if (expected.refs[ref] !== current.refs[ref]) changed.add(`.git/${ref}`);
  }
  return [...changed].sort(compareText);
}

function entryIdentity(entry: SnapshotEntry): string {
  return `${entry.kind}\0${entry.mode}\0${entry.hash}`;
}

function sameEntry(left: SnapshotEntry, right: SnapshotEntry): boolean {
  return entryIdentity(left) === entryIdentity(right);
}

function matchesBoundary(
  repoRoot: string,
  boundary: NormalizedBoundary,
  relative: string
): boolean {
  const absolute = path.join(repoRoot, ...relative.split('/'));
  if (!isInside(boundary.root, absolute)) return false;
  const scoped = path.relative(boundary.root, absolute).replaceAll(path.sep, '/');
  if (scoped === '.git' || scoped.startsWith('.git/')) return false;
  return (
    boundary.include.some(({ matches }) => matches(scoped)) &&
    !boundary.exclude.some(({ matches }) => matches(scoped))
  );
}

function mutationsBetween(
  before: SnapshotManifest,
  after: SnapshotManifest,
  step: PlannedVerifyStep,
  boundary: NormalizedBoundary | null
): readonly VerifyMutation[] {
  const removed = Object.keys(before.entries).filter((name) => after.entries[name] === undefined);
  const added = Object.keys(after.entries).filter((name) => before.entries[name] === undefined);
  const renamedFrom = new Set<string>();
  const renamedTo = new Map<string, string>();
  for (const destination of [...added].sort(compareText)) {
    const destinationEntry = after.entries[destination];
    const source = [...removed]
      .filter((candidate) => !renamedFrom.has(candidate))
      .sort(compareText)
      .find((candidate) => sameEntry(before.entries[candidate], destinationEntry));
    if (source !== undefined) {
      renamedFrom.add(source);
      renamedTo.set(destination, source);
    }
  }

  const allowedPath = (relative: string, entry: SnapshotEntry | undefined): boolean =>
    step.effect === 'repair' &&
    boundary !== null &&
    entry?.kind !== 'symlink' &&
    matchesBoundary(before.root, boundary, relative);

  const mutations: VerifyMutation[] = [];
  for (const destination of added) {
    const source = renamedTo.get(destination);
    if (source !== undefined) {
      mutations.push({
        path: destination,
        previousPath: source,
        stepId: step.id,
        kind: 'renamed',
        allowed:
          allowedPath(source, before.entries[source]) &&
          allowedPath(destination, after.entries[destination]),
      });
    } else {
      mutations.push({
        path: destination,
        stepId: step.id,
        kind: 'created',
        allowed: allowedPath(destination, after.entries[destination]),
      });
    }
  }
  for (const source of removed) {
    if (renamedFrom.has(source)) continue;
    mutations.push({
      path: source,
      stepId: step.id,
      kind: 'deleted',
      allowed: allowedPath(source, before.entries[source]),
    });
  }
  for (const relative of Object.keys(before.entries)) {
    const current = after.entries[relative];
    if (current !== undefined && !sameEntry(before.entries[relative], current)) {
      mutations.push({
        path: relative,
        stepId: step.id,
        kind: 'modified',
        allowed: allowedPath(relative, current),
      });
    }
  }
  if (before.indexIdentity !== after.indexIdentity) {
    mutations.push({
      path: '.git/index',
      stepId: step.id,
      kind: 'modified',
      allowed: false,
    });
  }
  if (
    before.repository.headHash !== after.repository.headHash ||
    before.repository.resolvedHead !== after.repository.resolvedHead
  ) {
    mutations.push({
      path: '.git/HEAD',
      stepId: step.id,
      kind: 'modified',
      allowed: false,
    });
  }
  for (const ref of [
    ...new Set([...Object.keys(before.repository.refs), ...Object.keys(after.repository.refs)]),
  ].sort(compareText)) {
    const previous = before.repository.refs[ref];
    const current = after.repository.refs[ref];
    if (previous === current) continue;
    mutations.push({
      path: `.git/${ref}`,
      stepId: step.id,
      kind: previous === undefined ? 'created' : current === undefined ? 'deleted' : 'modified',
      allowed: false,
    });
  }
  return mutations.sort((left, right) => compareText(left.path, right.path));
}

function ensureParent(root: string, relative: string): string {
  const components = relative.split('/');
  const filename = components.pop();
  if (filename === undefined) throw new Error(`invalid checkpoint path: ${relative}`);
  let current = root;
  for (const component of components) {
    current = path.join(current, component);
    if (fs.existsSync(current) || fs.lstatSync(path.dirname(current)).isDirectory()) {
      try {
        const stat = fs.lstatSync(current);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          fs.rmSync(current, { recursive: true, force: true });
          fs.mkdirSync(current);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        fs.mkdirSync(current);
      }
    }
  }
  return path.join(current, filename);
}

function atomicWrite(destination: string, contents: Buffer, mode: number): void {
  const temporary = path.join(path.dirname(destination), `.gennady-restore-${randomUUID()}`);
  try {
    fs.writeFileSync(temporary, contents, { flag: 'wx', mode });
    fs.renameSync(temporary, destination);
    fs.chmodSync(destination, mode);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function restoreCheckpoint(checkpoint: Checkpoint): void {
  verifyCheckpointIntegrity(checkpoint);
  const { root, entries, indexPath: destinationIndex } = checkpoint.manifest;
  const repositoryChanges = repositoryMutationPaths(
    checkpoint.manifest.repository,
    repositoryIdentity(root)
  );
  if (repositoryChanges.length > 0) {
    throw new Error(`repository identity changed: ${repositoryChanges.join(', ')}`);
  }
  // Restore the index first: a cancelled command may have made it unreadable, while the workspace
  // enumeration below deliberately uses the checkpoint's exact tracked-path identity.
  atomicWrite(
    destinationIndex,
    fs.readFileSync(path.join(checkpoint.directory, 'index')),
    checkpoint.manifest.indexMode
  );
  const current = listedWorkspacePaths(root);
  for (const relative of [...current].sort((left, right) => right.length - left.length)) {
    if (entries[relative] === undefined) {
      fs.rmSync(path.join(root, ...relative.split('/')), { recursive: true, force: true });
    }
  }
  for (const relative of Object.keys(entries).sort(compareText)) {
    const entry = entries[relative];
    const destination = ensureParent(root, relative);
    if (entry.kind === 'file') {
      const existing = (() => {
        try {
          return fs.lstatSync(destination);
        } catch {
          return null;
        }
      })();
      if (existing?.isDirectory() || existing?.isSymbolicLink()) {
        fs.rmSync(destination, { recursive: true, force: true });
      }
      atomicWrite(
        destination,
        fs.readFileSync(path.join(checkpoint.directory, entry.blob)),
        entry.mode
      );
    } else {
      fs.rmSync(destination, { recursive: true, force: true });
      fs.symlinkSync(entry.target, destination);
    }
  }
}

function removeCheckpoint(checkpoint: Checkpoint): void {
  fs.rmSync(checkpoint.directory, { recursive: true, force: true });
}

function parseLock(lockPath: string): WorkspaceLock | null {
  try {
    const value = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as Partial<WorkspaceLock>;
    if (
      value.kind !== 'workspace-guard-v1' ||
      typeof value.pid !== 'number' ||
      typeof value.root !== 'string' ||
      typeof value.checkpointId !== 'string' ||
      (value.phase !== 'capturing' && value.phase !== 'ready' && value.phase !== 'restoring')
    ) {
      return null;
    }
    return value as WorkspaceLock;
  } catch {
    return null;
  }
}

/**
 * @purpose Acquire the target executor's dirty-safe workspace transaction.
 * @invariant No stash/ref/reset/clean operation is used; ignored untracked output is preserved,
 * while every tracked path remains observable even when a later ignore rule matches it.
 * @param requestedRoot Repository path whose canonical Git toplevel is guarded.
 * @param [options] Embedding policy; production installs signal handlers by default.
 * @returns Live exclusive guard, or a typed acquisition/recovery failure.
 * @sideEffect IO: owns a gitdir lock and durable checkpoint until release/cancellation.
 */
export function acquireWorkspaceGuard(
  requestedRoot: string,
  options: WorkspaceGuardOptions = {}
): WorkspaceGuardAcquisition {
  let root: string;
  let gitDirectory: string;
  try {
    root = fs.realpathSync(git(requestedRoot, ['rev-parse', '--show-toplevel']).trim());
    gitDirectory = fs.realpathSync(git(root, ['rev-parse', '--absolute-git-dir']).trim());
  } catch (error) {
    return {
      kind: 'error',
      error: problem(
        'VERIFY_WORKSPACE_NOT_GIT',
        `workspace guard requires a git repository: ${String(error)}`
      ),
    };
  }
  const lockPath = path.join(gitDirectory, 'gennady-workspace-guard.lock');
  const checkpointsRoot = path.join(gitDirectory, 'gennady-workspace-checkpoints');
  fs.mkdirSync(checkpointsRoot, { recursive: true });

  const checkpointId = randomUUID();
  const checkpointDirectory = path.join(checkpointsRoot, checkpointId);
  let lock: WorkspaceLock = {
    kind: 'workspace-guard-v1',
    pid: process.pid,
    root,
    checkpointId,
    phase: 'capturing',
    startedAt: new Date().toISOString(),
  };
  const writeLock = (flag?: 'wx') => {
    if (flag === 'wx') {
      fs.writeFileSync(lockPath, JSON.stringify(lock), { flag });
      return;
    }
    const temporary = path.join(gitDirectory, `.gennady-workspace-lock-${randomUUID()}`);
    try {
      fs.writeFileSync(temporary, JSON.stringify(lock), { flag: 'wx' });
      fs.renameSync(temporary, lockPath);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  };

  try {
    writeLock('wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      return {
        kind: 'error',
        error: problem('VERIFY_WORKSPACE_LOCKED', `cannot create workspace lock: ${String(error)}`),
      };
    }
    const stale = parseLock(lockPath);
    if (stale === null || pidAlive(stale.pid)) {
      return {
        kind: 'error',
        error: problem(
          'VERIFY_WORKSPACE_LOCKED',
          `another verify run holds the workspace lock${stale === null ? '' : ` (pid ${stale.pid})`}`
        ),
      };
    }
    try {
      if (stale.root !== root) throw new Error('stale lock belongs to another repository root');
      const staleDirectory = path.join(checkpointsRoot, stale.checkpointId);
      if (path.dirname(staleDirectory) !== checkpointsRoot)
        throw new Error('invalid stale checkpoint id');
      if (stale.phase === 'ready' || stale.phase === 'restoring') {
        const staleCheckpoint = loadCheckpoint(staleDirectory, stale.checkpointId, root);
        restoreCheckpoint(staleCheckpoint);
        removeCheckpoint(staleCheckpoint);
      } else {
        fs.rmSync(staleDirectory, { recursive: true, force: true });
      }
      fs.rmSync(lockPath);
      writeLock('wx');
    } catch (recoveryError) {
      return {
        kind: 'error',
        error: problem(
          'VERIFY_WORKSPACE_RESTORE_FAILED',
          `cannot recover the previous workspace checkpoint; lock retained: ${String(recoveryError)}`
        ),
      };
    }
  }

  let checkpoint: Checkpoint;
  let active: ActiveStep | null = null;
  let closed = false;
  const temporaryCheckpointDirectories = new Set<string>();
  const signalHandlers = new Map<'SIGINT' | 'SIGTERM', () => void>();
  const removeSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    signalHandlers.clear();
  };
  const updateLock = (phase: WorkspaceLock['phase'], next: Checkpoint = checkpoint) => {
    lock = { ...lock, checkpointId: next.id, phase };
    writeLock();
  };
  const cleanup = () => {
    removeCheckpoint(checkpoint);
    for (const directory of temporaryCheckpointDirectories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    temporaryCheckpointDirectories.clear();
    fs.rmSync(lockPath, { force: true });
    removeSignalHandlers();
    closed = true;
  };
  const restore = (): WorkspaceProblem | null => {
    try {
      verifyCheckpointIntegrity(checkpoint);
    } catch (error) {
      return problem(
        'VERIFY_WORKSPACE_RESTORE_FAILED',
        `checkpoint integrity failed before restore; workspace and index were not touched, lock retained for retry: ${String(error)}`
      );
    }
    try {
      const repositoryChanges = repositoryMutationPaths(
        checkpoint.manifest.repository,
        repositoryIdentity(root)
      );
      if (repositoryChanges.length > 0) {
        return problem(
          'VERIFY_WORKSPACE_REPOSITORY_MUTATION',
          `repository refs/HEAD changed (${repositoryChanges.join(', ')}); automatic ref rollback is forbidden — workspace and index were not touched, lock/checkpoint retained for operator recovery`,
          repositoryChanges
        );
      }
    } catch (error) {
      return problem(
        'VERIFY_WORKSPACE_REPOSITORY_MUTATION',
        `cannot prove repository refs/HEAD identity; workspace and index were not touched, lock/checkpoint retained for operator recovery: ${String(error)}`
      );
    }
    try {
      updateLock('restoring');
      restoreCheckpoint(checkpoint);
      for (const directory of temporaryCheckpointDirectories) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
      temporaryCheckpointDirectories.clear();
      active = null;
      updateLock('ready');
      return null;
    } catch (error) {
      return problem(
        'VERIFY_WORKSPACE_RESTORE_FAILED',
        `failed to restore exact workspace checkpoint; lock retained for retry: ${String(error)}`
      );
    }
  };

  const guard: WorkspaceGuard = {
    toplevel: root,
    beginStep(step) {
      if (closed || active !== null) {
        return {
          kind: 'error',
          error: problem(
            'VERIFY_WORKSPACE_STEP_STATE',
            'workspace guard already has an active step or is closed'
          ),
        };
      }
      let boundary: NormalizedBoundary | null = null;
      if (step.effect === 'repair') {
        if (step.writes === undefined) {
          return {
            kind: 'error',
            error: problem(
              'VERIFY_WRITE_BOUNDARY_REQUIRED',
              `repair step ${step.id} must declare a non-empty write boundary`
            ),
          };
        }
        try {
          boundary = normalizeBoundary(root, step.writes);
        } catch (error) {
          return {
            kind: 'error',
            error: problem(
              'VERIFY_WRITE_BOUNDARY_UNSAFE',
              `unsafe write boundary for ${step.id}: ${String(error)}`
            ),
          };
        }
      } else if (step.writes !== undefined) {
        return {
          kind: 'error',
          error: problem(
            'VERIFY_WRITE_BOUNDARY_UNSAFE',
            `non-repair step ${step.id} cannot declare a write boundary`
          ),
        };
      }
      active = { step, boundary };
      return { kind: 'ready' };
    },
    finishStep(stepId, result) {
      if (closed || active === null || active.step.id !== stepId) {
        return {
          kind: 'error',
          mutations: [],
          error: problem(
            'VERIFY_WORKSPACE_STEP_STATE',
            `step ${stepId} is not the active guarded step`
          ),
          restored: false,
        };
      }
      const candidateId = randomUUID();
      const candidateDirectory = path.join(checkpointsRoot, candidateId);
      temporaryCheckpointDirectories.add(candidateDirectory);
      let candidate: Checkpoint;
      try {
        candidate = captureCheckpoint(root, candidateDirectory, candidateId);
      } catch (error) {
        const restoreError = restore();
        if (restoreError !== null) {
          return { kind: 'error', mutations: [], error: restoreError, restored: false };
        }
        return {
          kind: 'error',
          mutations: [],
          error: problem(
            'VERIFY_WORKSPACE_CHECKPOINT_FAILED',
            `cannot inspect step mutations: ${String(error)}`
          ),
          restored: true,
        };
      }
      const mutations = mutationsBetween(
        checkpoint.manifest,
        candidate.manifest,
        active.step,
        active.boundary
      );
      const unexpected = mutations.filter((mutation) => !mutation.allowed);
      if (!result.succeeded || unexpected.length > 0) {
        const restoreError = restore();
        if (restoreError !== null) {
          return { kind: 'error', mutations, error: restoreError, restored: false };
        }
        removeCheckpoint(candidate);
        temporaryCheckpointDirectories.delete(candidate.directory);
        if (unexpected.length > 0) {
          return {
            kind: 'violation',
            mutations,
            error: problem(
              'VERIFY_WORKSPACE_WRITE_VIOLATION',
              `step ${stepId} mutated paths outside its declared write boundary: ${unexpected
                .map((mutation) => mutation.path)
                .join(', ')}`,
              unexpected.map((mutation) => mutation.path)
            ),
            restored: true,
          };
        }
        return { kind: 'rolled-back', mutations };
      }

      const previous = checkpoint;
      checkpoint = candidate;
      temporaryCheckpointDirectories.delete(candidate.directory);
      active = null;
      updateLock('ready', checkpoint);
      removeCheckpoint(previous);
      return { kind: 'accepted', mutations };
    },
    cancel(signal) {
      if (closed) {
        return {
          kind: 'error',
          error: problem('VERIFY_WORKSPACE_STEP_STATE', 'workspace guard is already closed'),
        };
      }
      const restoreError = restore();
      if (restoreError !== null) return { kind: 'error', error: restoreError };
      cleanup();
      return { kind: 'cancelled', exitCode: signal === 'SIGINT' ? 130 : 143 };
    },
    release() {
      if (closed) return { kind: 'released' };
      if (active !== null) {
        const restoreError = restore();
        if (restoreError !== null) return { kind: 'error', error: restoreError };
      }
      cleanup();
      return { kind: 'released' };
    },
  };

  try {
    fs.mkdirSync(checkpointDirectory, { recursive: false });
    checkpoint = captureCheckpoint(root, checkpointDirectory, checkpointId);
    updateLock('ready', checkpoint);
  } catch (error) {
    fs.rmSync(checkpointDirectory, { recursive: true, force: true });
    fs.rmSync(lockPath, { force: true });
    removeSignalHandlers();
    return {
      kind: 'error',
      error: problem(
        'VERIFY_WORKSPACE_CHECKPOINT_FAILED',
        `cannot capture the initial workspace checkpoint: ${String(error)}`
      ),
    };
  }
  if (options.signalHandlers !== false) {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = () => {
        const result = guard.cancel(signal);
        process.exit(result.kind === 'cancelled' ? result.exitCode : 1);
      };
      signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }
  }
  return { kind: 'guard', guard };
}
