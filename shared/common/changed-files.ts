// @file: Argv-safe, fail-closed git evidence for changed-file and HEAD-baseline consumers.
// @spec: SHARED
// @consumers: sdd-check.cmd, sdd-task.cmd, yagni.cmd

import { spawnSync } from 'node:child_process';
import { isSddSourceFile } from '../sdd/source-extensions.ts';

/** @purpose Stable diagnostic from one failed git subprocess. */
export type GitCommandError = {
  /** @purpose Human-readable operation that could not be proven. */
  operation: string;
  /** @purpose Git process exit status; null means spawn/termination failure. */
  exitCode: number | null;
  /** @purpose Git stderr (or the spawn error), preserved for the caller's teaching error. */
  stderr: string;
};

/** @purpose Changed-file evidence with unborn HEAD distinguished from a broken repository. */
export type ChangedFilesResult =
  | { status: 'ok'; files: string[] }
  | { status: 'no-head'; files: string[] }
  | ({ status: 'error' } & GitCommandError);

type GitResult = { ok: true; stdout: string; stderr: string } | ({ ok: false } & GitCommandError);

function git(root: string, operation: string, args: string[]): GitResult {
  const child = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const stderr = child.error?.message || child.stderr || '';
  if (child.status !== 0 || child.error) {
    return {
      ok: false,
      operation,
      exitCode: child.status,
      stderr: stderr.trim(),
    };
  }
  return { ok: true, stdout: child.stdout ?? '', stderr: stderr.trim() };
}

type HeadState = { status: 'ok' | 'no-head' } | ({ status: 'error' } & GitCommandError);

/** @purpose Prove a usable HEAD, or prove the one accepted exception: an unborn symbolic branch. */
function headState(root: string): HeadState {
  const repository = git(root, 'discover repository', ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok) return { status: 'error', ...repository };
  if (repository.stdout.trim() !== 'true') {
    return {
      status: 'error',
      operation: 'discover repository',
      exitCode: null,
      stderr: 'git did not identify the target as a working tree',
    };
  }

  const head = git(root, 'resolve HEAD commit', ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (head.ok) return { status: 'ok' };

  // `rev-parse` exit 128 is not enough: corrupt/detached HEAD can fail the same way. An unborn
  // repository is exactly a symbolic branch whose ref is absent from the ref database.
  const symbolic = git(root, 'resolve symbolic HEAD', ['symbolic-ref', '-q', 'HEAD']);
  if (!symbolic.ok) return { status: 'error', ...head };
  const branch = symbolic.stdout.trim();
  if (!branch.startsWith('refs/heads/')) return { status: 'error', ...head };
  const branchRef = git(root, 'inspect symbolic HEAD branch', [
    'show-ref',
    '--verify',
    '--quiet',
    branch,
  ]);
  if (!branchRef.ok && branchRef.exitCode === 1) return { status: 'no-head' };
  return { status: 'error', ...(branchRef.ok ? head : branchRef) };
}

function nulPaths(stdout: string): string[] {
  return stdout.split('\0').filter(Boolean);
}

/** @purpose Deterministic union of NUL-decoded repository paths, excluding dependency territory. */
function changedPathUnion(...groups: string[][]): string[] {
  return [...new Set(groups.flat())]
    .filter((path) => !path.includes('node_modules/'))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * @purpose Every changed file under root, preserving a proven no-HEAD state and every git error.
 * @param root Repository root passed to git as one argv value.
 * @returns Changed paths or the exact no-head/error state.
 */
export function getChangedFiles(root: string): ChangedFilesResult {
  const head = headState(root);
  if (head.status === 'error') return head;

  const untracked = git(root, 'list untracked files', [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  if (!untracked.ok) return { status: 'error', ...untracked };
  const untrackedFiles = nulPaths(untracked.stdout);
  if (head.status === 'no-head') {
    // An unborn branch has no deletion baseline. Its complete observable change set is therefore
    // every cached/index entry (including intent-to-add and an indexed addition deleted only from
    // the worktree) plus every untracked path. A path removed from both index and worktree is not a
    // staged deletion here: without a parent tree, Git has no prior path to delete.
    const indexed = git(root, 'list files in unborn index', ['ls-files', '--cached', '-z']);
    if (!indexed.ok) return { status: 'error', ...indexed };
    return {
      status: 'no-head',
      files: changedPathUnion(nulPaths(indexed.stdout), untrackedFiles),
    };
  }

  const diff = git(root, 'list files changed from HEAD', [
    'diff',
    '--name-only',
    '-z',
    'HEAD',
    '--',
  ]);
  if (!diff.ok) return { status: 'error', ...diff };
  return {
    status: 'ok',
    // `git diff HEAD` includes cached/unstaged modifications and deletions against the parent tree.
    files: changedPathUnion(nulPaths(diff.stdout), untrackedFiles),
  };
}

/**
 * @purpose Changed files in the shared SDD source registry, including test sources.
 * @param root Repository root passed to getChangedFiles.
 * @returns The typed parent result with its file list source-filtered.
 */
export function getChangedSourceFiles(root: string): ChangedFilesResult {
  const result = getChangedFiles(root);
  if (result.status === 'error') return result;
  return {
    ...result,
    files: result.files.filter((path) => isSddSourceFile(path) && !path.includes('node_modules/')),
  };
}

/**
 * @purpose Strictly read one path's HEAD bytes without confusing absence with git failure.
 * @param root Repository root.
 * @param relPath Exact repository-relative path.
 * @returns Content, proven absence/no-head, or the git failure.
 */
export function readHeadContent(
  root: string,
  relPath: string
):
  | { status: 'ok'; content: string }
  | { status: 'missing' | 'no-head' }
  | ({ status: 'error' } & GitCommandError) {
  const head = headState(root);
  if (head.status === 'error') return head;
  if (head.status === 'no-head') return { status: 'no-head' };

  const listed = git(root, 'locate path in HEAD', [
    'ls-tree',
    '-z',
    '--name-only',
    'HEAD',
    '--',
    relPath,
  ]);
  if (!listed.ok) return { status: 'error', ...listed };
  if (!nulPaths(listed.stdout).includes(relPath)) return { status: 'missing' };

  const shown = git(root, 'read path from HEAD', ['show', `HEAD:${relPath}`]);
  if (!shown.ok) return { status: 'error', ...shown };
  return { status: 'ok', content: shown.stdout };
}

/**
 * @purpose Compatibility reader for yagni while that command owns its own changed-file diagnostics.
 * @param root Repository root.
 * @param relPath Exact repository-relative path.
 * @returns HEAD content when proven; null for absent/no-HEAD/error (strict SDD consumers use readHeadContent).
 */
export function getHeadContent(root: string, relPath: string): string | null {
  const result = readHeadContent(root, relPath);
  return result.status === 'ok' ? result.content : null;
}

const HEAD_CONTENT_LIMIT_BYTES = 64 * 1024 * 1024;
const HEAD_BATCH_OBJECT_LIMIT = 512;
const HEAD_BATCH_HEADER_BYTES = 128;
type HeadBlob = { oid: string; size: number; paths: string[] };

function headPathBatches(paths: readonly string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let bytes = 0;
  for (const file of paths) {
    const size = Buffer.byteLength(file) + 1;
    if (batch.length > 0 && (batch.length === 128 || bytes + size > 32 * 1024)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    // A single exact name remains intact; an OS-level rejection affects only its own chunk.
    batch.push(file);
    bytes += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function exactHeadPath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..') &&
    Buffer.from(value).toString('utf8') === value
  );
}

function headBuffer(
  root: string,
  args: string[],
  input?: string,
  maxBuffer = HEAD_CONTENT_LIMIT_BYTES
): Buffer | null {
  const child = spawnSync('git', ['-C', root, ...args], { input, maxBuffer });
  return child.status === 0 && !child.error ? child.stdout : null;
}

function headBlobBatch(root: string, blobs: readonly HeadBlob[]): Map<string, string> | null {
  const output = headBuffer(
    root,
    ['cat-file', '--batch'],
    blobs.map((blob) => blob.oid).join('\n') + '\n',
    HEAD_CONTENT_LIMIT_BYTES + HEAD_BATCH_HEADER_BYTES * blobs.length
  );
  if (output === null) return null;
  const contents = new Map<string, string>();
  let offset = 0;
  for (const blob of blobs) {
    const end = output.indexOf(10, offset);
    if (end < offset || end - offset >= HEAD_BATCH_HEADER_BYTES) return null;
    const header = output.subarray(offset, end).toString('ascii');
    offset = end + 1;
    if (header === `${blob.oid} missing`) continue;
    const match = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(header);
    if (!match || match[1] !== blob.oid || Number(match[2]) !== blob.size) return null;
    const next = offset + blob.size;
    if (next >= output.length || output[next] !== 10) return null;
    contents.set(blob.oid, output.subarray(offset, next).toString('utf8'));
    offset = next + 1;
  }
  return offset === output.length ? contents : null;
}

/**
 * @purpose Read exact files from one pinned HEAD without repeating repository discovery per file.
 * @invariant Literal NUL-delimited paths select immutable OIDs; failures never fall back to another path or live source.
 * @param root Repository root, passed as one Git argv value.
 * @param relPaths Exact repository-relative file names, including literal brackets, tabs and newlines.
 * @returns Every unique requested key maps to its unchanged UTF8 content or null for absence/no-HEAD/error, matching getHeadContent compatibility.
 */
export function getHeadContents(
  root: string,
  relPaths: readonly string[]
): ReadonlyMap<string, string | null> {
  const contents = new Map<string, string | null>(relPaths.map((file) => [file, null]));
  const paths = [...contents.keys()].filter(exactHeadPath);
  if (paths.length === 0) return contents;
  try {
    const head = git(root, 'pin HEAD baseline', [
      'rev-parse',
      '--is-inside-work-tree',
      '--verify',
      'HEAD^{commit}',
    ]);
    if (!head.ok) return contents;
    const match = /^true\r?\n([a-f0-9]{40,64})\r?\n?$/.exec(head.stdout);
    if (!match) return contents;
    const blobs = new Map<string, HeadBlob>();
    for (const pathBatch of headPathBatches(paths)) {
      const tree = headBuffer(root, [
        '--literal-pathspecs',
        'ls-tree',
        '-r',
        '-z',
        '--long',
        '--full-tree',
        match[1],
        '--',
        ...pathBatch,
      ]);
      if (tree === null) continue;
      const requested = new Set(pathBatch);
      let offset = 0;
      while (offset < tree.length) {
        const end = tree.indexOf(0, offset);
        const tab = tree.indexOf(9, offset);
        if (end < 0 || tab < offset || tab >= end) return contents;
        const entry = /^[0-7]{6} blob ([a-f0-9]{40,64}) +(\d+)$/.exec(
          tree.subarray(offset, tab).toString('ascii')
        );
        const nameBytes = tree.subarray(tab + 1, end);
        const name = nameBytes.toString('utf8');
        offset = end + 1;
        if (!entry || !requested.has(name) || !Buffer.from(name).equals(nameBytes)) continue;
        const size = Number(entry[2]);
        if (!Number.isSafeInteger(size) || size < 0 || size > HEAD_CONTENT_LIMIT_BYTES) continue;
        const known = blobs.get(entry[1]);
        if (known && known.size !== size) return contents;
        if (known) known.paths.push(name);
        else blobs.set(entry[1], { oid: entry[1], size, paths: [name] });
      }
    }
    let batch: HeadBlob[] = [];
    let bytes = 0;
    const readBatch = () => {
      const values = headBlobBatch(root, batch);
      if (values)
        for (const blob of batch) {
          const value = values.get(blob.oid);
          if (value !== undefined) for (const file of blob.paths) contents.set(file, value);
        }
      batch = [];
      bytes = 0;
    };
    for (const blob of blobs.values()) {
      if (
        batch.length > 0 &&
        (batch.length === HEAD_BATCH_OBJECT_LIMIT || bytes + blob.size > HEAD_CONTENT_LIMIT_BYTES)
      )
        readBatch();
      batch.push(blob);
      bytes += blob.size;
    }
    if (batch.length > 0) readBatch();
  } catch {
    // Compatibility matches getHeadContent: an unprovable baseline is null, never current source.
  }
  return contents;
}

/**
 * @purpose Compatibility boolean for callers/tests that do not make a safety decision from failure.
 * @param root Repository root.
 * @returns True only for a proven HEAD commit.
 */
export function hasGitHead(root: string): boolean {
  return headState(root).status === 'ok';
}

/**
 * @purpose The current HEAD commit id — the durable git ref a group-completion receipt is bound to.
 * @invariant Never throws: an unborn branch, a non-repository, or any git failure all collapse to
 *   the literal `'no-head'` so a receipt still records provenance without a spurious commit id.
 * @param root Repository root passed to git as one argv value.
 * @returns The 40-char HEAD sha, or `'no-head'` when no commit can be proven.
 */
export function getHeadRef(root: string): string {
  const state = headState(root);
  if (state.status !== 'ok') return 'no-head';
  const head = git(root, 'resolve HEAD commit id', ['rev-parse', 'HEAD']);
  return head.ok ? head.stdout.trim() : 'no-head';
}
