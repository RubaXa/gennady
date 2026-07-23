// @file: Duplicate detector — jscpd wrapper for finding code clones in realCode files.
// @consumers: mr-stats.cmd
// @tasks: TSK-139

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '#logger';
import { isToolAvailable } from './line-counter.ts';
import type { DuplicateReport } from './mr-stats.types.ts';

const execFileAsync = promisify(execFile);

/**
 * @purpose Detect code clones in changed realCode files via jscpd.
 * @param mrDir MR worktree directory.
 * @param files RealCode file paths.
 * @returns Duplicate report or tool-not-found error.
 * @sideEffect Process: spawns jscpd; FS: creates temp file list.
 */
export async function detectDuplicates(
  mrDir: string,
  files: string[]
): Promise<
  { ok: true; report: DuplicateReport } | { ok: false; exitCode: number; message: string }
> {
  if (!(await isToolAvailable('jscpd'))) {
    return { ok: false, exitCode: 4, message: 'jscpd: command not found' };
  }

  if (files.length === 0) {
    return { ok: true, report: { clonesFound: 0, clonedLines: 0, percentage: 0 } };
  }

  // #region START_JSCPD_RUN — write file list, run jscpd, parse JSON output
  let tmpDir: string;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), 'mr-stats-jscpd-'));
  } catch (cause) {
    const error = new Error('[detectDuplicates] Failed to create temp dir for jscpd', { cause });
    logger.error(`[detectDuplicates] [idle → failed]`, { error });
    return { ok: false, exitCode: 4, message: 'jscpd: failed to create temp directory' };
  }

  const listPath = join(tmpDir, 'files.txt');
  const reportPath = join(tmpDir, 'report');

  try {
    writeFileSync(listPath, files.map((f) => join(mrDir, f)).join('\n'), 'utf8');

    await execFileAsync(
      'jscpd',
      [
        '--mode',
        'strict',
        '--format',
        'json',
        '--output',
        reportPath,
        '--files',
        listPath,
        '--silent',
      ],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 25_000,
      }
    );

    let reportJson: string;
    try {
      reportJson = readFileSync(join(reportPath, 'jscpd-report.json'), 'utf8');
    } catch {
      try {
        reportJson = readFileSync(join(reportPath, 'report.json'), 'utf8');
      } catch {
        return { ok: true, report: { clonesFound: 0, clonedLines: 0, percentage: 0 } };
      }
    }

    const report = JSON.parse(reportJson) as {
      statistics?: {
        total?: {
          clones?: number;
          duplicatedLines?: number;
          percentage?: number;
        };
      };
    };

    const stats = report.statistics?.total;
    return {
      ok: true,
      report: {
        clonesFound: stats?.clones ?? 0,
        clonedLines: stats?.duplicatedLines ?? 0,
        percentage: stats?.percentage ?? 0,
      },
    };
  } catch (cause) {
    const error = new Error('[detectDuplicates] jscpd invocation failed', { cause });
    logger.warn(`[detectDuplicates] [running → failed]`, { error });
    return { ok: true, report: { clonesFound: 0, clonedLines: 0, percentage: 0 } };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  // #endregion END_JSCPD_RUN
}
