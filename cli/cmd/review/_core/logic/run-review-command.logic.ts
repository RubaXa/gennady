// @file: Execute common review command pipeline and return the final output.
// @consumers: review-issues.cmd, review-verify.cmd
// @tasks: N/A, TSK-70

import { style } from '../../../../../shared/common/style.ts';
import { VcsGitlabClient } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
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
import type { ReviewContextVcs } from '../types/review-context-vcs.type.ts';

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
 * @purpose Execute common review command pipeline and return the final output.
 * @param options Command mode and launch arguments.
 * @returns Exit code and ready output.
 * @consumer review-verify.cmd, review-issues.cmd
 */
export async function runReviewCommand(
  options: ReviewCommandOptions
): Promise<ReviewCommandResult> {
  try {
    const reviewIntent = resolveReviewIntent(options.args);

    // #region START_RESOLVE_CONTEXT
    let host: string;
    let project: string;
    let reviewContextVcs: ReviewContextVcs;
    let reviewContextGit: ReviewContextGit | undefined;

    if (options.vcsContext) {
      // purpose: use pre-resolved VCS context to skip git auto-detection
      host = options.vcsContext.host;
      project = options.vcsContext.project;
      reviewContextGit = options.vcsContext.branch
        ? { branch: options.vcsContext.branch, remote: { host, project, scheme: 'https' } }
        : undefined;

      if (!/gitlab/i.test(host)) {
        throw new Error(`Провайдер "${host}" пока не поддерживается.`);
      }

      const apiPath = process.env.GITLAB_API_PATH ?? '/api/v4';
      const baseUrl = `https://${host}${apiPath}`;
      reviewContextVcs = {
        host,
        project,
        vcs: new VcsGitlabClient({ token: options.vcsContext.token, baseUrl }),
      };
    } else {
      const shouldLoadGitContext = reviewIntent.source !== 'url';
      reviewContextGit = shouldLoadGitContext
        ? buildReviewContextGit(options.args.branch)
        : undefined;

      host = resolveReviewHost(reviewIntent, reviewContextGit);
      project = resolveReviewProject(reviewIntent, reviewContextGit);

      reviewContextVcs = buildReviewContextVcs(host, project);
    }
    // #endregion END_RESOLVE_CONTEXT

    const reviewContextMr = await loadReviewContextMr(
      reviewIntent,
      reviewContextVcs,
      reviewContextGit,
      options.args.draft
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
      options.args.all,
      options.args.since
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
