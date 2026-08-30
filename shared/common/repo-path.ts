// @file: Fail-closed lexical path policy for SDD-owned repository files and tombstones.
// @consumers: sdd-new, sdd-task, sdd-check, sdd-verify
// @tasks: N/A

import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** @purpose Filesystem state required at the final path component. */
export type RepoPathExpectation = 'file' | 'missing' | 'potential';

/** @purpose A normalized, proven repo-local path or one actionable rejection reason. */
export type RepoPathResult =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; detail: string };

const GLOB_META = /[*?\[\]{}]/;

function slash(path: string): string {
  return path.split(sep).join('/');
}

/**
 * @purpose Prove an exact repository path without dereferencing any symlink component.
 * @invariant Absolute paths, traversal, globs, the repository root, and every symlink component
 *   fail closed. A missing suffix is accepted only for `missing`/`potential` expectations.
 * @param root Repository root; it must already exist.
 * @param raw Operator- or ticket-supplied repo-relative path.
 * @param expectation Required final filesystem state.
 * @returns Normalized path evidence, or a teaching rejection.
 */
export function inspectRepoPath(
  root: string,
  raw: string,
  expectation: RepoPathExpectation
): RepoPathResult {
  if (!raw || raw === 'none') return { ok: false, detail: 'path is empty or a placeholder' };
  if (raw !== raw.trim() || /[\0\r\n]/.test(raw)) {
    return { ok: false, detail: 'path contains surrounding whitespace or control bytes' };
  }
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    return { ok: false, detail: 'absolute paths are forbidden' };
  }
  if (GLOB_META.test(raw)) return { ok: false, detail: 'path must be exact, not a glob' };
  const rawSegments = raw.split(/[\\/]/);
  if (rawSegments.includes('..')) return { ok: false, detail: '`..` path segments are forbidden' };

  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(resolve(root));
  } catch {
    return { ok: false, detail: 'repository root is missing or unreadable' };
  }
  const absolute = resolve(canonicalRoot, raw);
  const rel = relative(canonicalRoot, absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { ok: false, detail: 'path escapes or equals the repository root' };
  }

  const segments = rel.split(sep);
  let cursor = canonicalRoot;
  let missing = false;
  for (let index = 0; index < segments.length; index++) {
    cursor = resolve(cursor, segments[index] as string);
    if (missing) continue;
    let stat;
    try {
      stat = lstatSync(cursor);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          ok: false,
          detail: `path component cannot be inspected: ${slash(relative(canonicalRoot, cursor))}`,
        };
      }
      missing = true;
      continue;
    }
    if (stat.isSymbolicLink()) {
      return {
        ok: false,
        detail: `path contains a symlink component: ${slash(relative(canonicalRoot, cursor))}`,
      };
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      return {
        ok: false,
        detail: `path parent is not a directory: ${slash(relative(canonicalRoot, cursor))}`,
      };
    }
    if (index === segments.length - 1) {
      if (expectation === 'file' && !stat.isFile()) {
        return { ok: false, detail: 'path is not a regular file' };
      }
      if (expectation === 'missing') return { ok: false, detail: 'path still exists' };
    }
  }

  if (expectation === 'file' && missing) return { ok: false, detail: 'path is missing' };
  if (expectation === 'missing' && !missing) return { ok: false, detail: 'path still exists' };
  return { ok: true, absolute, relative: slash(rel) };
}
