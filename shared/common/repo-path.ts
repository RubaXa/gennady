// @file: Fail-closed lexical path policy for SDD-owned repository files and tombstones.
// @spec: SHARED
// @consumers: sdd-new, sdd-task, sdd-check, sdd-verify

import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** @purpose Filesystem state required at the final path component. */
export type RepoPathExpectation = 'file' | 'missing' | 'potential';

/**
 * @purpose Glob-metacharacter policy for a path that is NOT an existing regular file. An existing
 *   regular file is always literal in both modes; `literal-brackets` also keeps `[`/`]` literal for
 *   an absent/potential path.
 */
export type RepoPathSyntax = 'pattern-free' | 'literal-brackets';

/** @purpose A normalized, proven repo-local path or one actionable rejection reason. */
export type RepoPathResult =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; detail: string };

function slash(path: string): string {
  return path.split(sep).join('/');
}

/**
 * @purpose Inspect an exact repository path and detect component replacement during this inspection.
 * @invariant Reject escapes, symlinks and nonliteral paths. Missing suffixes require missing/potential.
 *   This is point-in-time evidence; readers must pin descriptors separately.
 * @param root Repository root; it must already exist.
 * @param raw Operator- or ticket-supplied repo-relative path.
 * @param expectation Required final filesystem state.
 * @param [syntax] Literal brackets in absent paths are opt-in; no expansion occurs in either mode.
 * @returns Normalized path evidence, or a teaching rejection.
 */
export function inspectRepoPath(
  root: string,
  raw: string,
  expectation: RepoPathExpectation,
  syntax: RepoPathSyntax = 'pattern-free'
): RepoPathResult {
  if (!raw || raw === 'none') return { ok: false, detail: 'path is empty or a placeholder' };
  if (raw !== raw.trim() || /[\0\r\n]/.test(raw)) {
    return { ok: false, detail: 'path contains surrounding whitespace or control bytes' };
  }
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    return { ok: false, detail: 'absolute paths are forbidden' };
  }
  const patterned = (syntax === 'literal-brackets' ? /[*?{}]/ : /[*?\[\]{}]/).test(raw);
  const globRejection = { ok: false, detail: 'path must be exact, not a glob' } as const;
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
  const identities: { absolute: string; dev: number; ino: number }[] = [];
  try {
    const rootStat = lstatSync(canonicalRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
      return { ok: false, detail: 'repository root changed during inspection' };
    identities.push({ absolute: canonicalRoot, dev: rootStat.dev, ino: rootStat.ino });
  } catch {
    return { ok: false, detail: 'repository root changed during inspection' };
  }
  let cursor = canonicalRoot;
  let missing = false;
  let regularFile = false;
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
    identities.push({ absolute: cursor, dev: stat.dev, ino: stat.ino });
    if (index < segments.length - 1 && !stat.isDirectory()) {
      return {
        ok: false,
        detail: `path parent is not a directory: ${slash(relative(canonicalRoot, cursor))}`,
      };
    }
    if (index === segments.length - 1) {
      regularFile = stat.isFile();
      if (patterned && !regularFile) return globRejection;
      if (expectation === 'file' && !stat.isFile()) {
        return { ok: false, detail: 'path is not a regular file' };
      }
      if (expectation === 'missing') return { ok: false, detail: 'path still exists' };
    }
  }

  if (patterned && !regularFile) return globRejection;
  if (expectation === 'file' && missing) return { ok: false, detail: 'path is missing' };
  if (expectation === 'missing' && !missing) return { ok: false, detail: 'path still exists' };
  try {
    for (const identity of identities) {
      const current = lstatSync(identity.absolute);
      if (current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino)
        return { ok: false, detail: 'path component changed during inspection' };
    }
    const physical = realpathSync(identities.at(-1)!.absolute);
    const physicalRelative = relative(canonicalRoot, physical);
    if (
      physicalRelative === '..' ||
      physicalRelative.startsWith(`..${sep}`) ||
      isAbsolute(physicalRelative)
    )
      return { ok: false, detail: 'path resolved outside the repository during inspection' };
  } catch {
    return { ok: false, detail: 'path changed during inspection' };
  }
  return { ok: true, absolute, relative: slash(rel) };
}
