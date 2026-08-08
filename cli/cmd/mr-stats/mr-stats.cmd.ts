// @file: CLI command mr-stats — structured MR statistics pipeline (URL → metadata → worktree → classify → cloc → tree-sitter → jscpd → JSON).
// @consumers: GennadyCli
// @tasks: TSK-138, TSK-139

import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { logger } from '#logger';
import {
  parseMrUrl,
  resolveMrContext,
  retrieveMrMetadata,
  resolveWorktreePath,
  removeWorktree,
} from '../../../services/mr-stats/mr-resolver.ts';
import { loadClassifierRules, classify } from '../../../services/mr-stats/classifier.ts';
import {
  isToolAvailable,
  aggregateSimpleCategory,
} from '../../../services/mr-stats/line-counter.ts';
import { computeEntityDelta } from '../../../services/mr-stats/entity-counter.ts';
import { detectDuplicates } from '../../../services/mr-stats/duplicate-detector.ts';
import { composeReport, buildRealCodeCategory } from '../../../services/mr-stats/reporter.ts';
import { createVcsClient } from '../_shared/create-vcs-client.ts';
import type { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import type {
  MrStatsOutcome,
  MrStatsReport,
  MrStatsCategorySimple,
  MrStatsCategoryRealCode,
  LineDiff,
  EntityDelta,
  DuplicateReport,
} from '../../../services/mr-stats/mr-stats.types.ts';
import {
  CANONICAL_CATEGORY_ORDER,
  MR_STATS_TIMEOUT_MS,
} from '../../../services/mr-stats/mr-stats.types.ts';

/**
 * @purpose Execute gennady mr-stats — full pipeline from URL to JSON report.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns MrStatsOutcome with either an ok:true report or ok:false error.
 */
export async function run(rawArgs: string[]): Promise<MrStatsOutcome> {
  const args = rawArgs.slice(3);
  const helpFlags = new Set(['--help', '-h']);
  const hasHelp = args.some((a) => helpFlags.has(a));
  const url = args.find((a) => !a.startsWith('-')) ?? '';

  logger.debug(`[mr-stats#run] [idle → parsing] hasHelp=${hasHelp} url=${url || '<none>'}`);

  // #region START_HELP
  if (hasHelp) {
    const lines = [
      'gennady mr-stats — Получить структурированную статистику по GitLab MR.',
      '',
      'Usage:',
      '  gennady mr-stats <url>',
      '',
      'Аргументы:',
      '  <url>   URL GitLab Merge Request',
      '',
      'Пример:',
      '  gennady mr-stats https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/14',
    ];
    return { ok: false, exitCode: 0, message: lines.join('\n') };
  }
  // #endregion END_HELP

  // #region START_VALIDATE_URL
  if (!url) {
    logger.warn('[mr-stats#run] [parsing → missing_url] no URL provided');
    return {
      ok: false,
      exitCode: 1,
      message: 'Usage: gennady mr-stats <url>\n  Try gennady mr-stats --help for details.',
    };
  }

  const vcsUrl = parseMrUrl(url);
  if (!vcsUrl) {
    const msg = `mr-stats: invalid URL — expected GitLab MR URL, got "${url}"`;
    logger.warn(`[mr-stats#run] [parsing → invalid_url] ${msg}`);
    return { ok: false, exitCode: 1, message: msg };
  }
  // #endregion END_VALIDATE_URL

  // #region START_RESOLVE_CONTEXT
  let context: Awaited<ReturnType<typeof resolveMrContext>>;
  try {
    context = await resolveMrContext(url);
  } catch (cause) {
    const msg = (cause as Error).message ?? 'VCS context resolution failed';
    logger.error(`[mr-stats#run] [resolving-context → failed] ${msg}`, { cause });
    return { ok: false, exitCode: 2, message: msg };
  }
  // #endregion END_RESOLVE_CONTEXT

  const { project, iid, token, host } = context;
  if (!iid) {
    return { ok: false, exitCode: 1, message: 'mr-stats: unable to extract MR IID from URL' };
  }

  const client = createVcsClient(context) as VcsGitlabClient;

  // #region START_GLAB_CHECK
  if (!(await isToolAvailable('glab'))) {
    return { ok: false, exitCode: 2, message: 'glab: command not found' };
  }
  // #endregion END_GLAB_CHECK

  // #region START_RETRIEVE_METADATA
  const metadata = await retrieveMrMetadata(client, project, iid);
  if (!metadata) {
    return {
      ok: false,
      exitCode: 5,
      message: `MR !${iid}: source branch deleted or MR not merged`,
    };
  }
  logger.info(`[mr-stats#run] [resolved → metadata] !${iid} "${metadata.title}"`);
  // #endregion END_RETRIEVE_METADATA

  // #region START_PREPARE_WORKTREE
  let clonePath = '';
  let worktreePath = '';
  let headSha = '';

  // Quick check: try ls-remote to see if MR ref still exists. Timeout 5s.
  let hasRef = false;
  try {
    const check = execFileSync('git', ['ls-remote', 'origin', `merge-requests/${iid}/head`], {
      encoding: 'utf8',
      timeout: 5_000,
    } as any);
    hasRef = check.trim().length > 0;
  } catch {
    hasRef = false;
  }

  if (hasRef) {
    try {
      const resolved = await resolveWorktreePath(project, host, token, iid);
      clonePath = resolved.clonePath;
      worktreePath = resolved.worktreePath;
      headSha = resolved.headSha;
    } catch (cause) {
      logger.warn(`[mr-stats#run] [worktree → skipped] ${(cause as Error).message}`);
    }
  }
  // #endregion END_PREPARE_WORKTREE

  // #region START_FETCH_CHANGES — use git diff with pinned MR base for authoritative diff
  let changes: Array<{
    path: string;
    added: number;
    removed: number;
    codeAdded: number;
    commentAdded: number;
    blankAdded: number;
    codeRemoved: number;
    commentRemoved: number;
    blankRemoved: number;
  }> = [];
  const diffBase = metadata.diffRefsBaseSha;
  try {
    const diffArgs =
      diffBase && headSha
        ? ['-C', clonePath, 'diff', `${diffBase}..${headSha}`]
        : ['mr', 'diff', String(iid), '--repo', project];
    const diffTool = diffBase && headSha ? 'git' : 'glab';
    const diffOutput = execFileSync(diffTool, diffArgs, {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
      timeout: 30_000,
      ...(clonePath && diffTool === 'git' ? { cwd: clonePath } : {}),
    } as any);

    const isComment = (l: string) =>
      /^\s*(\/\/|#|\/\*|\*|REM\s|--)/.test(l) || /^\s*\/\*\*/.test(l);
    const isBlank = (l: string) => /^\s*$/.test(l);

    const fileChanges = new Map<string, any>();
    let currentFile = '';
    for (const line of diffOutput.split('\n')) {
      if (line.startsWith('--- ') && !line.startsWith('--- /dev/null')) {
        currentFile = line.slice(4).trim();
      } else if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) {
        const path = line.slice(4).trim();
        currentFile = path;
        if (!fileChanges.has(currentFile)) {
          fileChanges.set(currentFile, {
            added: 0,
            removed: 0,
            codeA: 0,
            cmtA: 0,
            blkA: 0,
            codeR: 0,
            cmtR: 0,
            blkR: 0,
          });
        }
      } else if (currentFile && line.startsWith('+') && !line.startsWith('+++')) {
        const fc = fileChanges.get(currentFile)!;
        fc.added++;
        if (isBlank(line.slice(1))) fc.blkA++;
        else if (isComment(line.slice(1))) fc.cmtA++;
        else fc.codeA++;
      } else if (currentFile && line.startsWith('-') && !line.startsWith('---')) {
        const fc = fileChanges.get(currentFile)!;
        fc.removed++;
        if (isBlank(line.slice(1))) fc.blkR++;
        else if (isComment(line.slice(1))) fc.cmtR++;
        else fc.codeR++;
      }
    }

    changes = Array.from(fileChanges.entries()).map(([path, fc]) => ({
      path,
      added: fc.added,
      removed: fc.removed,
      codeAdded: fc.codeA,
      commentAdded: fc.cmtA,
      blankAdded: fc.blkA,
      codeRemoved: fc.codeR,
      commentRemoved: fc.cmtR,
      blankRemoved: fc.blkR,
    }));

    logger.info(`[mr-stats#run] [diff → parsed] ${changes.length} file(s) from glab mr diff`);
  } catch (cause) {
    const msg = `glab mr diff: ${(cause as Error).message}`;
    logger.error(`[mr-stats#run] [diff → failed] ${msg}`);
    return { ok: false, exitCode: 2, message: msg };
  }
  // #endregion END_FETCH_CHANGES

  try {
    const pipelineStart = performance.now();
    const changedFiles = changes.map((c) => c.path);

    // --- Empty MR ---
    if (changedFiles.length === 0) {
      const emptyCategories: Record<string, MrStatsCategorySimple> = {};
      for (const name of CANONICAL_CATEGORY_ORDER) {
        emptyCategories[name] = { files: 0, added: 0, removed: 0 };
      }
      const emptyReport: MrStatsReport = {
        mr: metadata,
        categories: emptyCategories,
      };
      return { ok: true, report: emptyReport };
    }

    // --- Load classifier rules ---
    let rules;
    try {
      rules = loadClassifierRules();
    } catch (cause) {
      const msg = `classifier-rules.yaml: ${(cause as Error).message}`;
      logger.error(`[mr-stats#run] [classifier → failed] ${msg}`, { cause });
      return { ok: false, exitCode: 7, message: msg };
    }

    // --- Classify files ---
    const classified = classify(changedFiles, rules);

    // --- Build numstat from API changes ---
    const numstat = changes.map((c) => ({ file: c.path, added: c.added, removed: c.removed }));

    // --- Process categories in canonical order ---
    const categories: Record<string, MrStatsCategorySimple | MrStatsCategoryRealCode> = {};

    for (const catName of CANONICAL_CATEGORY_ORDER) {
      if (performance.now() - pipelineStart > MR_STATS_TIMEOUT_MS) {
        logger.warn(
          `[mr-stats#run] [processing → timeout] mr-stats: timeout exceeded (${MR_STATS_TIMEOUT_MS / 1000}s), result may be incomplete`
        );
        break;
      }

      const filesInCategory = classified[catName] ?? [];

      if (catName === 'realCode') {
        // --- realCode: extended metrics ---
        const simple = aggregateSimpleCategory(filesInCategory, numstat);

        // Aggregate code/comment/blank from diff output directly
        let codeLines: LineDiff = { added: 0, removed: 0 };
        let commentLines: LineDiff = { added: 0, removed: 0 };
        let blankLines: LineDiff = { added: 0, removed: 0 };
        const rcFileSet = new Set(filesInCategory);
        if (rcFileSet.size > 0 && clonePath && diffBase && headSha) {
          const diffForRc = execFileSync(
            'git',
            ['-C', clonePath, 'diff', `${diffBase}..${headSha}`],
            {
              encoding: 'utf8',
              maxBuffer: 100 * 1024 * 1024,
              timeout: 30_000,
            } as any
          );
          const isCmt = (l: string) => /^\s*(\/\/|\/\*|\*|#)/.test(l);
          const isBlk = (l: string) => /^\s*$/.test(l);
          let cf = '';
          for (const line of diffForRc.split('\n')) {
            if (line.startsWith('+++ ') && !line.includes('/dev/null')) cf = line.slice(4).trim();
            else if (rcFileSet.has(cf) && line.startsWith('+') && !line.startsWith('+++')) {
              const c = line.slice(1);
              isBlk(c) ? blankLines.added++ : isCmt(c) ? commentLines.added++ : codeLines.added++;
            } else if (rcFileSet.has(cf) && line.startsWith('-') && !line.startsWith('---')) {
              const c = line.slice(1);
              isBlk(c)
                ? blankLines.removed++
                : isCmt(c)
                  ? commentLines.removed++
                  : codeLines.removed++;
            }
          }
        }

        let entityDelta: EntityDelta = { introduced: [], modified: [], removed: [] };
        let duplicates: DuplicateReport = { clonesFound: 0, clonedLines: 0, percentage: 0 };

        if (filesInCategory.length > 0) {
          if (headSha && worktreePath) {
            entityDelta = await computeEntityDelta(
              clonePath,
              diffBase,
              worktreePath,
              filesInCategory
            );
          }

          const dupResult = await detectDuplicates(worktreePath, filesInCategory);
          if (dupResult.ok) {
            duplicates = dupResult.report;
          } else {
            logger.warn(`[mr-stats#run] [jscpd → skipped] ${dupResult.message}`);
          }
        }

        categories[catName] = buildRealCodeCategory(
          simple.files,
          simple.added,
          simple.removed,
          codeLines,
          commentLines,
          blankLines,
          entityDelta,
          duplicates
        );
      } else {
        // --- Simple category ---
        categories[catName] = aggregateSimpleCategory(filesInCategory, numstat);
      }
    }

    const report = composeReport(metadata, categories, CANONICAL_CATEGORY_ORDER);

    const elapsed = performance.now() - pipelineStart;
    logger.info(`[mr-stats#run] [processing → completed] ${elapsed.toFixed(2)}ms`);

    return { ok: true, report };
  } finally {
    if (worktreePath) {
      try {
        await removeWorktree(worktreePath);
      } catch {
        logger.warn('[mr-stats#run] [cleanup → failed]');
      }
    }
  }
}

const outcome = await run(process.argv);
if (outcome.ok) {
  process.stdout.write(JSON.stringify(outcome.report, null, 2) + '\n');
  process.exit(0);
} else {
  process.stderr.write(outcome.message + '\n');
  process.exit(outcome.exitCode);
}
