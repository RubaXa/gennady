// @file: Canonical repository-file identity for fail-closed reads and mutations.
// @consumers: ticket-resolve, sdd-log, sdd-sync, sdd-session
// @tasks: N/A

import {
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectRepoPath, type RepoPathExpectation, type RepoPathResult } from './repo-path.ts';

/** @purpose Stable identity of one exact regular non-symlink file below a canonical repository root. */
export type RepoFileIdentity = {
  /** @purpose Canonical repository root used to revalidate the path. */
  root: string;
  /** @purpose Canonical absolute path proven below root. */
  absolute: string;
  /** @purpose Slash-normalized repository-relative path. */
  relative: string;
  /** @purpose Filesystem device captured at proof time. */
  dev: number;
  /** @purpose Filesystem inode captured at proof time. */
  ino: number;
};

/** @purpose Typed success/failure for repository-file identity operations. */
export type RepoFileIdentityResult =
  | { ok: true; identity: RepoFileIdentity }
  | { ok: false; detail: string };

/**
 * @purpose Prove one exact repository-relative regular file and capture its device/inode identity.
 * @param root Repository root.
 * @param raw Exact repository-relative file path.
 * @returns Stable file evidence or one rejection reason.
 */
export function proveRepoFile(root: string, raw: string): RepoFileIdentityResult {
  const inspected = inspectRepoPath(root, raw, 'file');
  if (!inspected.ok) return inspected;
  try {
    const stat = lstatSync(inspected.absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { ok: false, detail: 'path is not a regular non-symlink file' };
    }
    return {
      ok: true,
      identity: {
        root: realpathSync(resolve(root)),
        absolute: inspected.absolute,
        relative: inspected.relative,
        dev: stat.dev,
        ino: stat.ino,
      },
    };
  } catch (cause) {
    return {
      ok: false,
      detail: `file identity cannot be inspected: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`,
    };
  }
}

/**
 * @purpose Prove a repository-relative path and all existing parents before creation.
 * @param root Repository root.
 * @param raw Exact repository-relative destination.
 * @param [expectation] Required destination state.
 * @returns Normalized destination evidence or one rejection reason.
 */
export function proveRepoDestination(
  root: string,
  raw: string,
  expectation: RepoPathExpectation = 'potential'
): RepoPathResult {
  return inspectRepoPath(root, raw, expectation);
}

/**
 * @purpose Revalidate that a proven path still names the same regular file and no parent became a symlink.
 * @param identity Previously captured file identity.
 * @returns Success only while path, device, and inode still match.
 */
export function revalidateRepoFile(
  identity: RepoFileIdentity
): { ok: true } | { ok: false; detail: string } {
  const current = proveRepoFile(identity.root, identity.relative);
  if (!current.ok) return current;
  if (current.identity.dev !== identity.dev || current.identity.ino !== identity.ino) {
    return { ok: false, detail: 'file identity changed after it was read' };
  }
  return { ok: true };
}

/**
 * @purpose Read a proven file through O_NOFOLLOW and verify the opened descriptor is the captured file.
 * @param identity Previously captured file identity.
 * @returns UTF-8 content or one fail-closed reason.
 */
export function readProvenRepoFile(
  identity: RepoFileIdentity
): { ok: true; content: string } | { ok: false; detail: string } {
  let fd: number | undefined;
  try {
    const current = revalidateRepoFile(identity);
    if (!current.ok) return current;
    fd = openSync(identity.absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== identity.dev || stat.ino !== identity.ino) {
      return { ok: false, detail: 'opened file identity does not match the proven file' };
    }
    return { ok: true, content: readFileSync(fd, 'utf-8') };
  } catch (cause) {
    return {
      ok: false,
      detail: `file cannot be read safely: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`,
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * @purpose Replace the bytes of the same proven regular file, revalidating immediately before write.
 * @param identity Previously captured file identity.
 * @param content Replacement UTF-8 content.
 * @returns Success only when the same descriptor was written.
 */
export function writeProvenRepoFile(
  identity: RepoFileIdentity,
  content: string
): { ok: true } | { ok: false; detail: string } {
  let fd: number | undefined;
  try {
    const current = revalidateRepoFile(identity);
    if (!current.ok) return current;
    fd = openSync(identity.absolute, constants.O_WRONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== identity.dev || stat.ino !== identity.ino) {
      return { ok: false, detail: 'opened file identity does not match the proven file' };
    }
    ftruncateSync(fd, 0);
    writeFileSync(fd, content, 'utf-8');
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      detail: `file cannot be written safely: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`,
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * @purpose Create one exact repository-relative file without following links or replacing an existing path.
 * @param root Repository root.
 * @param raw Exact repository-relative destination.
 * @param content Initial UTF-8 content.
 * @returns Identity of the created file or one fail-closed reason.
 */
export function createRepoFileExclusive(
  root: string,
  raw: string,
  content: string
): RepoFileIdentityResult {
  const destination = proveRepoDestination(root, raw, 'missing');
  if (!destination.ok) return destination;
  let fd: number | undefined;
  try {
    fd = openSync(
      destination.absolute,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600
    );
    writeFileSync(fd, content, 'utf-8');
  } catch (cause) {
    return {
      ok: false,
      detail: `file cannot be created safely: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`,
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return proveRepoFile(root, raw);
}

/**
 * @purpose Remove exactly the proven file, after same-identity revalidation.
 * @param identity Previously captured file identity.
 * @returns Success only when the proven path still had the same identity.
 */
export function removeProvenRepoFile(
  identity: RepoFileIdentity
): { ok: true } | { ok: false; detail: string } {
  try {
    const current = revalidateRepoFile(identity);
    if (!current.ok) return current;
    unlinkSync(identity.absolute);
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      detail: `file cannot be removed safely: ${(cause as NodeJS.ErrnoException).code ?? 'I/O error'}`,
    };
  }
}
