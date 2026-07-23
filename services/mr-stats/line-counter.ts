// @file: Line counter — cloc for realCode category, git diff --numstat for other categories.
// @consumers: mr-stats.cmd
// @tasks: TSK-139

import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { logger } from '#logger';
import type { LineDiff, MrStatsCategorySimple } from './mr-stats.types.ts';

const execFileAsync = promisify(execFile);

/**
 * @purpose Check whether a CLI tool is available in PATH.
 * @param cmd Command name to check.
 * @returns True when the command is executable.
 * @sideEffect Process: spawns which.
 */
export async function isToolAvailable(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

// #region START_CLOC_BASE_EXTRACT
// purpose: extract base revision files for cloc comparison
// failure mode: git archive / tar failure falls back to per-file git show
/**
 * @purpose Extract base (target branch) versions of files via git archive for cloc --diff.
 * @param clonePath Local clone path.
 * @param baseSha Base commit SHA.
 * @param files Repository-relative file paths.
 * @returns Temp directory path or null on failure.
 * @sideEffect FS: creates temp dir with base file copies.
 */
function extractBaseFiles(clonePath: string, baseSha: string, files: string[]): string | null {
  if (files.length === 0) return null;

  let tmpDir: string;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), 'mr-stats-base-'));
  } catch {
    return null;
  }

  try {
    const stdout = execFileSync('git', ['-C', clonePath, 'archive', baseSha, '--', ...files], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    execFileSync('tar', ['xf', '-', '-C', tmpDir], {
      input: stdout,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
  } catch {
    try {
      for (const file of files) {
        try {
          const content = execFileSync('git', ['-C', clonePath, 'show', `${baseSha}:${file}`], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }) as string;
          const destPath = join(tmpDir, file);
          mkdirSync(dirname(destPath), { recursive: true });
          writeFileSync(destPath, content, 'utf8');
        } catch {
          // file absent at baseSha
        }
      }
    } catch {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  return tmpDir;
}

/**
 * @purpose Parse cloc --diff --csv output into LineDiff components.
 * @param csvOutput Raw stdout from cloc --diff --csv.
 * @returns Aggregated line diffs for code, comment, and blank.
 */
function parseClocDiffCsv(csvOutput: string): {
  codeLines: LineDiff;
  commentLines: LineDiff;
  blankLines: LineDiff;
} {
  const zero = {
    codeLines: { added: 0, removed: 0 },
    commentLines: { added: 0, removed: 0 },
    blankLines: { added: 0, removed: 0 },
  };
  const lines = csvOutput.trim().split('\n');
  if (lines.length < 2) return zero;

  for (let i = lines.length - 1; i > 0; i -= 1) {
    const cols = lines[i].split(',');
    if (cols[0] === 'SUM:' && cols.length >= 8) {
      const blank1 = parseInt(cols[2] ?? '0', 10) || 0;
      const comment1 = parseInt(cols[3] ?? '0', 10) || 0;
      const code1 = parseInt(cols[4] ?? '0', 10) || 0;
      const blank2 = parseInt(cols[5] ?? '0', 10) || 0;
      const comment2 = parseInt(cols[6] ?? '0', 10) || 0;
      const code2 = parseInt(cols[7] ?? '0', 10) || 0;

      return {
        codeLines: { added: Math.max(0, code2 - code1), removed: Math.max(0, code1 - code2) },
        commentLines: {
          added: Math.max(0, comment2 - comment1),
          removed: Math.max(0, comment1 - comment2),
        },
        blankLines: { added: Math.max(0, blank2 - blank1), removed: Math.max(0, blank1 - blank2) },
      };
    }
  }

  return zero;
}
// #endregion END_CLOC_BASE_EXTRACT

// #region START_CLOC_RUN
// purpose: invoke cloc --diff on base and MR directories, parse result
// failure mode: cloc absent → exit 3; extraction failed → exit 3; cloc crash → exit 3
/**
 * @purpose Count code/comment/blank lines for realCode files using cloc --diff.
 * @param clonePath Local clone path with git history.
 * @param baseSha Base commit SHA.
 * @param mrDir MR worktree directory.
 * @param files RealCode file paths.
 * @returns Line diffs or tool-not-found error.
 * @sideEffect Process: spawns cloc; FS: creates temp dir for base files.
 */
export async function countRealCodeLines(
  clonePath: string,
  baseSha: string,
  mrDir: string,
  files: string[]
): Promise<
  | { ok: true; codeLines: LineDiff; commentLines: LineDiff; blankLines: LineDiff }
  | { ok: false; exitCode: number; message: string }
> {
  if (!(await isToolAvailable('cloc'))) {
    return { ok: false, exitCode: 3, message: 'cloc: command not found' };
  }

  if (files.length === 0) {
    return {
      ok: true,
      codeLines: { added: 0, removed: 0 },
      commentLines: { added: 0, removed: 0 },
      blankLines: { added: 0, removed: 0 },
    };
  }

  let baseDir: string | null = null;

  try {
    baseDir = extractBaseFiles(clonePath, baseSha, files);
    if (!baseDir) {
      return { ok: false, exitCode: 3, message: 'cloc: failed to extract base files' };
    }

    const { stdout } = await execFileAsync(
      'cloc',
      [
        '--diff',
        baseDir,
        mrDir,
        '--csv',
        '--quiet',
        '--include-lang=TypeScript',
        '--timeout',
        '25',
      ],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 25_000,
      }
    );

    const { codeLines, commentLines, blankLines } = parseClocDiffCsv(stdout as string);
    return { ok: true, codeLines, commentLines, blankLines };
  } catch (cause) {
    const error = new Error('[countRealCodeLines] cloc invocation failed', { cause });
    logger.error(`[countRealCodeLines] [running → failed]`, { error });
    return { ok: false, exitCode: 3, message: `cloc: ${(cause as Error).message}` };
  } finally {
    if (baseDir) {
      try {
        rmSync(baseDir, { recursive: true, force: true });
      } catch {
        /* cleanup */
      }
    }
  }
}
// #endregion END_CLOC_RUN

// #region START_NUMSTAT_AGGREGATION
// purpose: aggregate per-file added/removed from git numstat into category totals
/**
 * @purpose Aggregate git diff --numstat entries into a simple category stat.
 * @param filesInCategory Files in this category.
 * @param numstatEntries Per-file added/removed from git diff --numstat.
 * @returns Aggregated category with files, added, removed counts.
 */
export function aggregateSimpleCategory(
  filesInCategory: string[],
  numstatEntries: Array<{ file: string; added: number; removed: number }>
): MrStatsCategorySimple {
  if (filesInCategory.length === 0) {
    return { files: 0, added: 0, removed: 0 };
  }

  const fileSet = new Set(filesInCategory);
  let added = 0;
  let removed = 0;
  let matched = 0;

  for (const entry of numstatEntries) {
    if (fileSet.has(entry.file)) {
      added += entry.added;
      removed += entry.removed;
      matched += 1;
    }
  }

  return { files: matched, added, removed };
}
// #endregion END_NUMSTAT_AGGREGATION
