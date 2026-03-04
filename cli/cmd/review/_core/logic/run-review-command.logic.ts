import { style } from '../../../../../shared/common/style.ts';
import { buildReviewContextGit } from './build-review-context-git.logic.ts';
import { buildReviewContextVcs } from './build-review-context-vcs.logic.ts';
import { loadReviewContextMr } from './load-review-context-mr.logic.ts';
import { resolveReviewIntent } from './resolve-review-intent.logic.ts';
import { buildReviewArtifactXml } from '../xml/build-review-artifact.xml.ts';
import { renderReviewIssuesXml } from '../xml/render-review-issues.xml.ts';
import { renderReviewVerifyXml } from '../xml/render-review-verify.xml.ts';
import type { ReviewCommandOptions } from '../types/review-command-options.type.ts';
import type { ReviewCommandResult } from '../types/review-command-result.type.ts';
import type { ReviewIntent } from '../types/review-intent.type.ts';
import type { ReviewContextGit } from '../types/review-context-git.type.ts';

function resolveReviewHost(
  reviewIntent: ReviewIntent,
  reviewContextGit?: ReviewContextGit
): string {
  if (reviewIntent.source === 'url') {
    return reviewIntent.host;
  }

  if (reviewContextGit?.remote.host) {
    return reviewContextGit.remote.host;
  }

  throw new Error('Не удалось определить GitLab host. Укажите --url или настройте origin remote.');
}

function resolveReviewProject(
  reviewIntent: ReviewIntent,
  reviewContextGit?: ReviewContextGit
): string {
  if (reviewIntent.source === 'branch') {
    if (!reviewContextGit?.remote.project) {
      throw new Error('Не удалось определить проект из origin remote.');
    }

    return reviewContextGit.remote.project;
  }

  return reviewIntent.project;
}

/**
 * @purpose Выполнить общий pipeline review-команд и вернуть финальный output.
 * @consumer review-verify.cmd, review-issues.cmd
 * @param options Режим команды и аргументы запуска.
 * @returns Код выполнения и готовый output.
 */
export async function runReviewCommand(
  options: ReviewCommandOptions
): Promise<ReviewCommandResult> {
  try {
    const reviewIntent = resolveReviewIntent(options.args);
    const shouldLoadGitContext = reviewIntent.source !== 'url';
    const reviewContextGit = shouldLoadGitContext
      ? buildReviewContextGit(options.args.branch)
      : undefined;

    const host = resolveReviewHost(reviewIntent, reviewContextGit);
    const project = resolveReviewProject(reviewIntent, reviewContextGit);

    const reviewContextVcs = buildReviewContextVcs(host, project);
    const reviewContextMr = await loadReviewContextMr(
      reviewIntent,
      reviewContextVcs,
      reviewContextGit
    );

    if (!reviewContextMr) {
      if (reviewIntent.source === 'branch') {
        console.info(
          style.yellow('ℹ Merge Request не найден для ветки:'),
          style.cyan(reviewContextGit?.branch ?? '')
        );
      } else {
        console.info(style.yellow('ℹ Merge Request не найден:'));
        console.info(`- project: ${style.cyan(project)}`);
        console.info(`- iid: ${style.cyan(reviewIntent.iid)}`);
      }

      return {
        ok: true,
        code: 0,
      };
    }

    const reviewArtifactXml = buildReviewArtifactXml(
      reviewContextMr.mergeRequest,
      reviewContextMr.discussions,
      options.args.all
    );

    const output =
      options.mode === 'verify'
        ? await renderReviewVerifyXml(reviewArtifactXml)
        : renderReviewIssuesXml(reviewArtifactXml);

    return {
      ok: true,
      code: 0,
      output,
      artifact: {
        mergeRequest: reviewContextMr.mergeRequest,
        discussions: reviewContextMr.discussions,
        reviewArtifactXml,
      },
    };
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    console.error(style.redBright.bold('✖ Ошибка:'), message);
    return {
      ok: false,
      code: 1,
    };
  }
}
