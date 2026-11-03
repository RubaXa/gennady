// @file: `lint.scope: owned` file selection — keep only files an SDD spec or ticket owns.
// @spec: CLI-LINT
// @consumers: LintCommand

import { openSync, closeSync, readSync, fstatSync, constants } from 'node:fs';
import { proveRepoFile, revalidateRepoFile } from '../../../shared/common/repo-file-identity.ts';
import {
  parseSourceOwnershipHeader,
  sourceOwnershipPreludeComplete,
} from '../../../shared/sdd/source-ownership-header.ts';
import { relative, resolve, sep } from 'node:path';
import { readSddCoverage } from '../../../shared/sdd/coverage-repository.ts';

/**
 * @purpose Probe at most 4096 bytes; an incomplete prelude or unsafe read remains in the lint set.
 * @param root Canonical project root.
 * @param path Exact relative source path.
 * @param reads Invocation-local accounting.
 * @returns True for owned or uncertain inputs, false only for a proven unowned prefix.
 */
function ownedPrefix(root: string, path: string, reads: { bytes: number }): boolean {
  const proof = proveRepoFile(root, path, 'literal-brackets');
  if (!proof.ok) return true;
  let fd: number | undefined;
  try {
    fd = openSync(proof.identity.absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== proof.identity.dev || stat.ino !== proof.identity.ino)
      return true;
    const buffer = Buffer.alloc(4096);
    const count = readSync(fd, buffer, 0, buffer.length, 0);
    reads.bytes += count;
    if (!revalidateRepoFile(proof.identity).ok) return true;
    const truncated = stat.size > count;
    let content = buffer.subarray(0, count).toString('utf8');
    if (truncated) content = content.slice(0, content.lastIndexOf('\n') + 1);
    const parsed = parseSourceOwnershipHeader(content.replace(/^\uFEFF/, ''));
    if (parsed.blocks.some((block) => block.tag === 'spec')) return true;
    return truncated && !sourceOwnershipPreludeComplete(content);
  } catch {
    return true;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** @purpose Result of narrowing a lint selection to SDD-owned files. */
export type OwnedLintSelection = {
  /** @purpose Files that stay in the lint run, in input order. */
  readonly files: string[];
  /** @purpose Number of selected files skipped because no spec or ticket owns them. */
  readonly skipped: number;
  /** @purpose Actual bytes consumed by bounded ownership probes. */
  readonly prefixReadBytes: number;
  /** @purpose Set when declarations could not be read completely: nothing is skipped, lint checks everything. */
  readonly degraded?: string;
};

/**
 * @purpose Keep files owned by SDD: an `@spec` header, a File Mapping entry or a ticket Target File.
 * @invariant A header alone keeps a file and removing it cannot hide a mapped file; an unreadable
 *   declaration set disables skipping entirely, so ownership is never guessed from partial rows.
 * @param root Canonical project root.
 * @param files Selected lint files (absolute or root-relative).
 * @returns Owned files and the skipped count.
 */
export function selectOwnedLintFiles(root: string, files: readonly string[]): OwnedLintSelection {
  const document = readSddCoverage(root, { kind: 'project' }, 'audit', { observeSources: false });
  const failures = document.coverage.findings.filter(
    (f) => f.severity === 'error' && f.code !== 'OBSERVATION_MISSING'
  );
  if (failures.length > 0) {
    const first = failures[0]!;
    return {
      files: [...files],
      skipped: 0,
      prefixReadBytes: 0,
      degraded: `${failures.length} SDD declaration error(s), first ${first.code} ${first.path}`,
    };
  }
  const declared = new Set(document.coverage.rows.map((row) => row.path));
  const reads = { bytes: 0 };
  const kept = files.filter((file) => {
    const repoPath = relative(root, resolve(root, file)).split(sep).join('/');
    if (declared.has(repoPath)) return true;
    return ownedPrefix(root, repoPath, reads);
  });
  return { files: kept, skipped: files.length - kept.length, prefixReadBytes: reads.bytes };
}
