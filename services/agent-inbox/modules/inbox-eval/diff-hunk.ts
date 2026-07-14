// @file: Parses `git diff --unified=0` output into a per-file map of newLine numbers that are
//   actually part of a diff hunk — the ground truth G8 (line-in-diff-hunk) checks proposed line
//   comments against. Git access happens through an injected runner (no direct spawn), so the
//   parser and its callers stay unit-testable without a real git repository.
// @consumers: EvalHarness (TSK-119), gates.ts (G8)
// @tasks: TSK-118

/** @purpose One `@@ -oldStart,oldCount +newStart,newCount @@` hunk boundary, in new-file coordinates. */
export type HunkRange = {
  /** @purpose First new-file line number covered by this hunk | @invariant 1-based, per unified diff convention */
  newStart: number;
  /** @purpose Count of new-file lines the hunk header claims | @invariant May be 0 for a pure deletion hunk */
  newCount: number;
};

/** @purpose Per-file diff-hunk ground truth: exact new-file lines added/changed, plus raw hunk ranges for evidence. */
export type FileHunks = {
  /** @purpose Exact new-file line numbers introduced by a `+` line in some hunk | @invariant Membership, not numeric-range containment — a context line inside a hunk's numeric span is NOT a member unless it was itself added */
  newLines: Set<number>;
  /** @purpose Hunk boundaries for this file, in appearance order | @invariant Surfaced as evidence when a gate rejects a line outside them */
  ranges: HunkRange[];
};

/** @purpose File path → diff-hunk ground truth, for every file touched by one `git diff` invocation. */
export type DiffHunkMap = Map<string, FileHunks>;

/** @purpose Injected git-invocation seam — this module never spawns a process itself. */
export type GitDiffRunner = (args: string[]) => Promise<string>;

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;

/**
 * @purpose Retrieve (or lazily create) the accumulator for one file's hunk data.
 * @param map Map being built.
 * @param file File path key.
 * @returns The file's `FileHunks` entry, created empty on first access.
 */
function fileEntry(map: DiffHunkMap, file: string): FileHunks {
  let entry = map.get(file);
  if (!entry) {
    entry = { newLines: new Set(), ranges: [] };
    map.set(file, entry);
  }
  return entry;
}

/**
 * @purpose Parse raw `git diff --unified=0` text into a per-file newLine ground truth.
 * @invariant Pure-insertion hunks (oldCount 0) read from newStart/newCount alone, so lines added
 *   past the old file's end still land in newLines (GitLab C6 case).
 * @param diffText Raw stdout of `git diff --unified=0 <base>..<head> [-- <paths>]`.
 * @returns Map of file path → `{ newLines, ranges }`.
 */
export function parseUnifiedDiff(diffText: string): DiffHunkMap {
  const map: DiffHunkMap = new Map();
  let currentFile: string | null = null;
  let cursor = 0;
  let inHunk = false;

  for (const line of diffText.split('\n')) {
    const fileMatch = FILE_HEADER.exec(line);
    if (fileMatch) {
      currentFile = fileMatch[2];
      fileEntry(map, currentFile);
      inHunk = false;
      continue;
    }
    if (!currentFile) continue;

    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch) {
      const newStart = Number(hunkMatch[3]);
      const newCount = hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]);
      fileEntry(map, currentFile).ranges.push({ newStart, newCount });
      cursor = newStart;
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    // #region START_CLASSIFY_HUNK_BODY_LINE — invariant: + lines join newLines and advance; - lines advance neither; context/no-newline-marker lines advance without joining
    if (line.startsWith('+') && !line.startsWith('+++')) {
      fileEntry(map, currentFile).newLines.add(cursor);
      cursor++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // no-op
    } else if (line.startsWith('\\')) {
      // no-op
    } else if (line !== '') {
      cursor++;
    }
    // #endregion END_CLASSIFY_HUNK_BODY_LINE
  }

  return map;
}

/**
 * @purpose Retrieve diff-hunk ground truth for a base..head range via the injected git runner.
 * @param runner Executes `git <args>` and resolves with stdout — the sole git-access seam.
 * @param baseSha Base revision — MUST be `diff_refs.base_sha` from `inbox-context`, never a
 *   locally-recomputed `git merge-base` (see G1).
 * @param headRef Head revision or ref.
 * @param [paths] Optional path filter (`git diff ... -- <paths>`).
 * @returns Diff-hunk ground truth for every file in the range.
 * @sideEffect Invokes `runner` — actual git process execution is the caller's responsibility.
 */
export async function retrieveDiffHunks(
  runner: GitDiffRunner,
  baseSha: string,
  headRef: string,
  paths: string[] = []
): Promise<DiffHunkMap> {
  const args = [
    'diff',
    '--unified=0',
    `${baseSha}..${headRef}`,
    ...(paths.length ? ['--', ...paths] : []),
  ];
  const diffText = await runner(args);
  return parseUnifiedDiff(diffText);
}
