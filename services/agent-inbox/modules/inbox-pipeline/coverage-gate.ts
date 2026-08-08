// @file: CoverageGate — compares must-read checklist against tool-trace.jsonl, predicate for partial reads, exclusions (deleted/binary), max continue=2
// @consumers: inbox-pipeline
// @tasks: TSK-161

import { existsSync, readFileSync } from 'node:fs';
import { logger } from '#logger';

/** @purpose A single tool invocation trace entry from tool-trace.jsonl */
export type ToolTrace = {
  /** @purpose Tool name — 'read' or 'edit' counted as file interaction */
  tool: string;
  /** @purpose File path this tool operated on */
  file?: string;
  /** @purpose Zero-based byte/line offset for paged reads. */
  offset?: number;
  /** @purpose Requested page length for paged reads. */
  limit?: number;
  /** @purpose Total file length reported by the read tool when known. */
  fileSize?: number;
  /** @purpose ISO timestamp of the invocation */
  ts?: string;
};

/** @purpose Result of coverage gate check */
export type CoverageVerdict = {
  /** @purpose Gate outcome */
  status: 'pass' | 'fail';
  /** @purpose Files present in checklist but not fully read */
  missingFiles: string[];
  /** @purpose Number of continue attempts already made */
  continueCount: number;
  /** @purpose Files excluded from checklist (deleted/binary/generated) */
  excludedFiles: string[];
};

/** @purpose Same-session continuation seam used when coverage asks a worker to read missed files. */
export type CoverageContinue = (missingFiles: string[], attempt: number) => Promise<ToolTrace[]>;

// #region START_EXCLUSION_PATTERNS — files that gate skips as non-reviewable
// purpose: deleted files aren't readable; binary/generated files carry no human-review signal

const EXCLUDED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.mp4',
  '.mov',
  '.webm',
  '.mp3',
  '.wav',
  '.zip',
  '.gz',
  '.tar',
  '.bz2',
  '.xz',
  '.7z',
  '.lock',
  '.sum',
]);

// #endregion END_EXCLUSION_PATTERNS

/**
 * @purpose Determines whether a file should be excluded from the must-read checklist.
 * @param filePath File path relative to repo root.
 * @param [action] Changeset action — deleted files are excluded.
 * @returns true when the file should be excluded from the checklist.
 */
function isExcluded(filePath: string, action?: string): boolean {
  if (action === 'deleted') return true;
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return EXCLUDED_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * @purpose Parse tool-trace.jsonl to extract files that were read.
 * @invariant A file is counted as read when a 'read' tool invocation references it.
 * @param tracePath Path to tool-trace.jsonl.
 * @returns Set of file paths that were read.
 */
function parseReadFiles(tracePath: string | ToolTrace[]): Set<string> {
  if (Array.isArray(tracePath)) return coveredFiles(tracePath);
  if (!existsSync(tracePath)) return new Set();
  try {
    const raw = readFileSync(tracePath, 'utf8');
    const entries: ToolTrace[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as ToolTrace;
        if (entry.tool === 'read' && entry.file) {
          entries.push(entry);
        }
      } catch {
        // skip corrupt lines
      }
    }
    return coveredFiles(entries);
  } catch {
    return new Set();
  }
}

function coveredFiles(entries: ToolTrace[]): Set<string> {
  const reads = new Map<string, ToolTrace[]>();
  for (const entry of entries) {
    if (entry.tool !== 'read' || !entry.file) continue;
    const fileEntries = reads.get(entry.file) ?? [];
    fileEntries.push(entry);
    reads.set(entry.file, fileEntries);
  }
  return new Set(
    [...reads.entries()]
      .filter(([, fileEntries]) => fileEntries.some((entry) => isFullRead(fileEntries, entry)))
      .map(([file]) => file)
  );
}

/**
 * @purpose Determine whether one full read or contiguous offset/limit pages cover a file to EOF.
 * @invariant Bare reads are full; paged reads need fileSize and contiguous pages from zero to EOF.
 */
function isFullRead(entries: ToolTrace[], candidate: ToolTrace): boolean {
  if (candidate.offset == null && candidate.limit == null) return true;
  const fileSize = entries.find((entry) => entry.fileSize != null)?.fileSize;
  if (fileSize == null) return false;
  const ranges = entries
    .filter((entry) => entry.offset != null && entry.limit != null)
    .map((entry) => ({ start: entry.offset!, end: entry.offset! + entry.limit! }))
    .sort((a, b) => a.start - b.start);
  let end = 0;
  for (const range of ranges) {
    if (range.start > end) return false;
    end = Math.max(end, range.end);
  }
  return end >= fileSize;
}

/**
 * @purpose Coverage verifier: compares must-read checklist (file list) against actual tool-trace reads.
 * @invariant Max 2 continue attempts before escalation — gate fails with continueCount ≥ 2.
 * @invariant Deleted, binary, and generated files are excluded from the checklist before comparison.
 * @invariant A file is covered only by one unpaged full read or offset/limit pages through EOF.
 */
export class CoverageGate {
  /** @purpose Number of continue attempts already made for this MR */
  protected _continueCount: number;

  /**
   * @purpose Create a CoverageGate with zero continue attempts.
   */
  constructor() {
    this._continueCount = 0;
    logger.debug('[CoverageGate#constructor] [init → ready]');
  }

  /**
   * @purpose Check whether all must-read files in the checklist have been read per tool-trace.
   * @param checklist File paths that must be read (from PLAN.md tracks).
   * @param toolTracePath Path to tool-trace.jsonl.
   * @param [deletedFiles] Files marked as deleted in changeset — excluded from checklist.
   * @returns CoverageVerdict — pass when all files covered, fail with missing file list.
   */
  check(
    checklist: string[],
    toolTracePath: string | ToolTrace[],
    deletedFiles: string[] = []
  ): CoverageVerdict {
    logger.debug('[CoverageGate#check] [idle → checking]', {
      checklistCount: checklist.length,
      tracePath: Array.isArray(toolTracePath) ? 'in-memory trace' : toolTracePath,
    });

    // #region START_EXCLUSION — remove deleted/binary/generated files from checklist
    const deletedSet = new Set(deletedFiles);
    const excludedFiles: string[] = [];
    const mustRead: string[] = [];
    for (const file of checklist) {
      if (deletedSet.has(file) || isExcluded(file)) {
        excludedFiles.push(file);
      } else {
        mustRead.push(file);
      }
    }
    // #endregion END_EXCLUSION

    // #region START_TOOL_TRACE_COMPARISON — cross-reference checklist against actual reads
    const readFiles = parseReadFiles(toolTracePath);
    const missingFiles = mustRead.filter((file) => !readFiles.has(file));
    // #endregion END_TOOL_TRACE_COMPARISON

    const status = missingFiles.length === 0 ? 'pass' : 'fail';

    logger.info(`[CoverageGate#check] [checking → ${status}]`, {
      mustRead: mustRead.length,
      read: readFiles.size,
      missing: missingFiles.length,
      excluded: excludedFiles.length,
    });

    return { status, missingFiles, continueCount: this._continueCount, excludedFiles };
  }

  /**
   * @purpose Record a continue attempt and check again with updated tool-trace.
   * @param checklist File paths that must be read.
   * @param toolTracePath Path to updated tool-trace.jsonl.
   * @param [deletedFiles] Files marked as deleted in changeset.
   * @throws {Error} When continueCount exceeds max (2).
   * @returns CoverageVerdict — escalates after 2 continue attempts.
   */
  continueCheck(
    checklist: string[],
    toolTracePath: string | ToolTrace[],
    deletedFiles: string[] = []
  ): CoverageVerdict {
    this._continueCount += 1;
    logger.debug('[CoverageGate#continueCheck] [idle → continuing]', {
      attempt: this._continueCount,
    });

    if (this._continueCount > 2) {
      const error = new Error(
        `[CoverageGate#continueCheck] Max continue attempts (2) exceeded — escalate to operator`
      );
      logger.error('[CoverageGate#continueCheck] [continuing → escalation_limit]', { error });
      throw error;
    }

    return this.check(checklist, toolTracePath, deletedFiles);
  }

  /**
   * @purpose Drive coverage recovery through the same worker session for at most two continuations.
   * @invariant The caller owns one live session; this gate never starts a replacement session,
   * because a replacement loses the agent's already-read context and violates D-316.
   * @param checklist Files that must be read.
   * @param trace Initial factual worker trace.
   * @param continueSameSession Callback that returns the updated trace after one same-session turn.
   * @param [deletedFiles] Deleted files excluded from coverage.
   * @returns Passing verdict or throws after the second failed continuation to escalate.
   */
  async recoverWithContinue(
    checklist: string[],
    trace: ToolTrace[],
    continueSameSession: CoverageContinue,
    deletedFiles: string[] = []
  ): Promise<CoverageVerdict> {
    let currentTrace = trace;
    let verdict = this.check(checklist, currentTrace, deletedFiles);
    while (verdict.status === 'fail' && this._continueCount < 2) {
      currentTrace = await continueSameSession(verdict.missingFiles, this._continueCount + 1);
      verdict = this.continueCheck(checklist, currentTrace, deletedFiles);
    }
    if (verdict.status === 'fail') {
      const error = new Error(
        `[CoverageGate#recoverWithContinue] Coverage remains incomplete after 2 same-session continues: ${verdict.missingFiles.join(', ')}`
      );
      logger.error('[CoverageGate#recoverWithContinue] [continuing → escalation_limit]', { error });
      throw error;
    }
    return verdict;
  }

  /**
   * @purpose Reset continue count for a new MR review.
   */
  reset(): void {
    this._continueCount = 0;
    logger.debug('[CoverageGate#reset] [any → ready]');
  }
}
