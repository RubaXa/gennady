// @file: Config sandboxLinks expansion — single-segment `*` globs against the real tree.
// @consumers: verify.cmd
// @tasks: TSK-96

import fs from 'node:fs';
import path from 'node:path';

/**
 * @purpose Result of expanding config-declared sandbox link patterns.
 * @consumer verify.cmd
 */
export type SandboxLinkExpansion = {
  /** @purpose Existing repo-relative paths to symlink into the replica, deduplicated, sorted. */
  readonly links: readonly string[];
  /**
   * @purpose Entries that matched nothing — surfaced as UNRESOLVED_SANDBOX_LINK: a silent
   *   skip turns the gate's missing input into a phantom FAIL about the code.
   */
  readonly unresolved: readonly string[];
};

/**
 * @purpose Translate one glob segment into a matcher; `*` matches within the segment only.
 * @param segment Pattern segment, possibly containing `*`.
 * @returns Matcher for directory entry names; `*` does not match a leading dot (shell convention).
 */
function segmentMatcher(segment: string): (name: string) => boolean {
  const pattern = new RegExp(
    `^${segment
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`
  );
  return (name) => pattern.test(name) && !(name.startsWith('.') && !segment.startsWith('.'));
}

/**
 * @purpose Expand config sandboxLinks against the real tree; `*` expands within one path
 *   segment (`**` is rejected at validation).
 * @invariant Plugin links skip this path as best-effort defaults; a config entry is author
 *   intent, so matching nothing is reported, never dropped.
 * @param root Absolute repository root.
 * @param patterns Repo-relative entries from `stack.<id>.sandboxLinks`, validated already.
 * @returns Existing matches plus the entries that resolved to nothing.
 */
export function expandSandboxLinks(
  root: string,
  patterns: readonly string[]
): SandboxLinkExpansion {
  const links = new Set<string>();
  const unresolved: string[] = [];

  for (const pattern of patterns) {
    const segments = pattern.split('/').filter((segment) => segment.length > 0);
    let matches: string[];
    if (pattern.includes('*')) {
      matches = walk(root, '', segments);
    } else {
      matches = fs.existsSync(path.join(root, ...segments)) ? [segments.join('/')] : [];
    }
    if (matches.length === 0) {
      unresolved.push(pattern);
    }
    for (const match of matches) {
      links.add(match);
    }
  }

  return { links: [...links].sort(), unresolved };
}

/**
 * @purpose Depth-first expansion of the remaining pattern segments under one prefix.
 * @param root Absolute repository root.
 * @param prefix Repo-relative path matched so far ('' at the top).
 * @param segments Remaining pattern segments.
 * @returns Repo-relative paths that exist and match the whole pattern.
 */
function walk(root: string, prefix: string, segments: readonly string[]): string[] {
  if (segments.length === 0) {
    return [prefix];
  }
  const [head, ...rest] = segments;
  const dir = path.join(root, prefix);

  if (!head!.includes('*')) {
    const next = prefix.length > 0 ? `${prefix}/${head}` : head!;
    return fs.existsSync(path.join(root, next)) ? walk(root, next, rest) : [];
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const matches = segmentMatcher(head!);
  return entries
    .filter((name) => matches(name))
    .flatMap((name) => walk(root, prefix.length > 0 ? `${prefix}/${name}` : name, rest));
}
