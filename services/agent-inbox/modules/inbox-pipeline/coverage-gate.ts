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
function parseReadFiles(tracePath: string): Set<string> {
  if (!existsSync(tracePath)) return new Set();
  try {
    const raw = readFileSync(tracePath, 'utf8');
    const readFiles = new Set<string>();
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as ToolTrace;
        if ((entry.tool === 'read' || entry.tool === 'edit') && entry.file) {
          readFiles.add(entry.file);
        }
      } catch {
        // skip corrupt lines
      }
    }
    return readFiles;
  } catch {
    return new Set();
  }
}

/**
 * @purpose Coverage verifier: compares must-read checklist (file list) against actual tool-trace reads.
 * @invariant Max 2 continue attempts before escalation — gate fails with continueCount ≥ 2.
 * @invariant Deleted, binary, and generated files are excluded from the checklist before comparison.
 * @invariant A file is covered when the tool-trace shows at least one read interaction.
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
    toolTracePath: string,
    deletedFiles: string[] = []
  ): CoverageVerdict {
    logger.debug('[CoverageGate#check] [idle → checking]', {
      checklistCount: checklist.length,
      tracePath: toolTracePath,
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
    toolTracePath: string,
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
   * @purpose Reset continue count for a new MR review.
   */
  reset(): void {
    this._continueCount = 0;
    logger.debug('[CoverageGate#reset] [any → ready]');
  }
}
