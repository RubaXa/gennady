// @file: One-pass source/spec indexes for YAGNI — one filesystem read and at most one reference AST parse per production file.
// @consumers: yagni.cmd, focused differential tests
// @tasks: N/A

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import {
  isYagniTestTerritory,
  YAGNI_SOURCE_EXTENSIONS,
} from '../../../shared/common/yagni-source-policy.ts';
import {
  parseUsageWaiver,
  stripBarrelReexports,
  type UsageWaiver,
} from '../../../shared/sdd/yagni.ts';
import { selectSymbolIndex } from '../../../services/symbol-index/select-symbol-index.ts';
import type { SymbolIndex } from '../../../services/symbol-index/symbol-index.types.ts';

const SPEC_EXTENSIONS = new Set(['.md']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', '.git', 'coverage']);

/** @purpose Composition-root adapters selected per source extension. */
type YagniAdapters = { exact: SymbolIndex; approximate: SymbolIndex };

/** @purpose One corpus entry whose existence/content could not be proven. */
export type YagniIoIssue = {
  /** @purpose Exact absolute path that could not be listed or read. */
  path: string;
  /** @purpose Filesystem operation that failed. */
  operation: 'list' | 'read';
  /** @purpose Stable human-readable OS/runtime reason. */
  reason: string;
};

/** @purpose Deterministic file listing plus explicit evidence-completeness issues. */
export type YagniFileListing = {
  /** @purpose Sorted regular files that were proven readable at traversal time. */
  files: string[];
  /** @purpose Directories whose entries could not be listed completely. */
  ioIssues: YagniIoIssue[];
};

/** @purpose Text read that cannot conflate an empty file with an unreadable one. */
export type YagniTextRead = { ok: true; content: string } | { ok: false; issue: YagniIoIssue };

/**
 * @purpose Minimal filesystem boundary for deterministic traversal and injected unreadable-file tests.
 * @invariant `listRegularFiles` never returns symlinks; YAGNI does not follow file or directory links.
 */
export type YagniIndexIo = {
  /**
   * @purpose Deterministically list regular files with an allowed extension below root.
   * @param root Directory to traverse.
   * @param extensions Allowed lowercase extensions.
   * @param [missingRootIsEmpty] When true, an absent root is a valid empty optional corpus.
   * @returns Sorted absolute regular-file paths plus every traversal issue; symlinks excluded.
   */
  listRegularFiles: (
    root: string,
    extensions: ReadonlySet<string>,
    missingRootIsEmpty?: boolean
  ) => YagniFileListing;
  /**
   * @purpose Read text without turning an unreadable corpus entry into a command crash.
   * @param path Absolute file path.
   * @returns Text, or a typed issue when the file disappeared or is unreadable.
   */
  readText: (path: string) => YagniTextRead;
};

/** @purpose Single-pass spec evidence consumed by checkYagniUsage. */
type YagniSpecEvidence = {
  /** @purpose Deterministically selected first waiver per symbol, preserving legacy normal-case behavior. */
  waivers: Map<string, UsageWaiver>;
  /** @purpose Cited decision ids that resolve to a live Decision Log heading. */
  liveDecisions: Set<string>;
  /** @purpose Corpus entries whose waiver/decision evidence could not be inspected. */
  ioIssues: YagniIoIssue[];
};

/** @purpose Normalize an unknown filesystem exception without dropping its reason. */
function issue(path: string, operation: YagniIoIssue['operation'], cause: unknown): YagniIoIssue {
  return {
    path,
    operation,
    reason: cause instanceof Error ? cause.message : String(cause),
  };
}

function listRegularFiles(
  root: string,
  extensions: ReadonlySet<string>,
  missingRootIsEmpty = false
): YagniFileListing {
  const files: string[] = [];
  const ioIssues: YagniIoIssue[] = [];
  const visit = (directory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (!(missingRootIsEmpty && directory === root && code === 'ENOENT')) {
        ioIssues.push(issue(directory, 'list', cause));
      }
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
        files.push(absolute);
      }
      // Deliberately ignore symbolic links. This matches `grep -r` (as opposed to `grep -R`) and
      // prevents a repo-local link from widening the corpus outside the checkout.
    }
  };
  visit(root);
  return { files, ioIssues };
}

function readText(path: string): YagniTextRead {
  try {
    return { ok: true, content: readFileSync(path, 'utf8') };
  } catch (cause) {
    return { ok: false, issue: issue(path, 'read', cause) };
  }
}

const NODE_IO: YagniIndexIo = { listRegularFiles, readText };

/**
 * @purpose Count every candidate across the production corpus with one read and one batch adapter
 *   call per file, then subtract the declaration occurrence once as the legacy command did.
 * @param repoRoot Absolute repository root.
 * @param names Unique changed symbol names.
 * @param adapters Exact/approximate adapters selected per file.
 * @param [io] Filesystem boundary; injected only by focused edge tests.
 * @returns Counts plus explicit evidence-completeness issues; callers must reject any issue.
 */
export async function indexUsageCounts(
  repoRoot: string,
  names: ReadonlySet<string>,
  adapters: YagniAdapters,
  io: YagniIndexIo = NODE_IO
): Promise<{ counts: Map<string, number>; ioIssues: YagniIoIssue[] }> {
  const totals = new Map<string, number>([...names].map((name) => [name, 0]));
  if (names.size === 0) return { counts: totals, ioIssues: [] };
  const listing = io.listRegularFiles(repoRoot, YAGNI_SOURCE_EXTENSIONS);
  const ioIssues = [...listing.ioIssues];
  for (const absolute of listing.files) {
    const path = relative(repoRoot, absolute);
    if (isYagniTestTerritory(path)) continue;
    const read = io.readText(absolute);
    if (!read.ok) {
      ioIssues.push(read.issue);
      continue;
    }
    const content = stripBarrelReexports(read.content);
    const adapter = selectSymbolIndex(path, adapters);
    const counts = await adapter.countReferencesMany(names, path, content);
    for (const [name, reference] of counts) {
      if (!totals.has(name)) continue;
      totals.set(name, (totals.get(name) ?? 0) + reference.count);
    }
  }
  for (const name of names) totals.set(name, Math.max(0, (totals.get(name) ?? 0) - 1));
  return { counts: totals, ioIssues };
}

/**
 * @purpose Build waiver and Decision Log evidence in one deterministic pass over markdown specs.
 * @param specsRoot Absolute specs root.
 * @param candidateNames Only low-use names that can need a waiver.
 * @param [io] Filesystem boundary; injected only by focused edge tests.
 * @returns First-by-path waivers and the cited live decisions.
 */
export function indexSpecEvidence(
  specsRoot: string,
  candidateNames: ReadonlySet<string>,
  io: YagniIndexIo = NODE_IO
): YagniSpecEvidence {
  const waivers = new Map<string, UsageWaiver>();
  const allDecisions = new Set<string>();
  if (candidateNames.size === 0) {
    return { waivers, liveDecisions: new Set(), ioIssues: [] };
  }

  const listing = io.listRegularFiles(specsRoot, SPEC_EXTENSIONS, true);
  const ioIssues = [...listing.ioIssues];
  for (const file of listing.files) {
    const read = io.readText(file);
    if (!read.ok) {
      ioIssues.push(read.issue);
      continue;
    }
    const content = read.content;
    const namesInFile = new Set<string>();
    for (const heading of content.matchAll(/^#{2,6}[ \t]+.*$/gm)) {
      for (const token of heading[0].matchAll(/`([^`]+)`/g)) {
        const name = token[1];
        if (name && candidateNames.has(name)) namesInFile.add(name);
      }
    }
    for (const name of [...namesInFile].sort()) {
      if (waivers.has(name)) continue;
      const waiver = parseUsageWaiver(content, name);
      if (waiver) waivers.set(name, waiver);
    }
    for (const decision of content.matchAll(/^###\s*(D-[A-Za-z0-9]+)\b/gm)) {
      if (decision[1]) allDecisions.add(decision[1]);
    }
  }

  const liveDecisions = new Set<string>();
  for (const waiver of waivers.values()) {
    if (waiver.decision && allDecisions.has(waiver.decision)) liveDecisions.add(waiver.decision);
  }
  return { waivers, liveDecisions, ioIssues };
}
