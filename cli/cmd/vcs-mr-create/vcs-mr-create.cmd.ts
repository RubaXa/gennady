#!/usr/bin/env node
// @file: Create a GitLab merge request from the current branch.
// @consumers: gennady.ts
// @tasks: TSK-91

import {
  resolveVcsContext,
  VcsResolveError,
  type VcsCliArgs,
  type VcsCliContext,
} from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { VcsMergeRequestCreateQuery } from '../../../services/vcs-client/entities/vcs-merge-request-create-query.type.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';

const execFileAsync = promisify(execFile);

type Deps = {
  resolveVcsContext: typeof resolveVcsContext;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  exit: (code: number) => never;
  git(args: string[]): Promise<string>;
};

function defaultDeps(): Deps {
  return {
    resolveVcsContext,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
    git: async (args: string[]) => {
      const { stdout } = await execFileAsync('git', args, { encoding: 'utf-8' });
      return String(stdout ?? '').trim();
    },
  };
}

/**
 * @purpose Create a GitLab MR from the current branch. Uses vcs-context-resolver for auto-detection.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: POST /projects/:id/merge_requests
 * @sideEffect Process: runs git rev-parse, git remote show
 */
export async function run(rawArgs: string[], deps: Deps = defaultDeps()): Promise<void> {
  const args = parseArgs(rawArgs, {
    title: { aliases: ['title'], takesValue: true },
    description: { aliases: ['description'], takesValue: true },
    'target-branch': { aliases: ['target-branch'], takesValue: true },
    project: { aliases: ['project'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    label: { aliases: ['label'], takesValue: true },
    assignee: { aliases: ['assignee'], takesValue: true },
    reviewer: { aliases: ['reviewer'], takesValue: true },
    milestone: { aliases: ['milestone'], takesValue: true },
    draft: ['draft'],
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const title = (args.title as string) || undefined;
  if (!title) {
    deps.stderr.write('✖ --title is required\n');
    deps.exit(1);
  }

  const dryRun = !!args['dry-run'];
  const draft = !!args.draft;
  const description = args.description as string | undefined;
  const targetBranch = args['target-branch'] as string | undefined;
  const labels = [args.label].flat().filter((l): l is string => typeof l === 'string');
  const assigneeId = args.assignee as string | undefined;
  const reviewerId = args.reviewer as string | undefined;
  const milestoneId = args.milestone as string | undefined;
  const host = args.host as string | undefined;

  const vcsArgs: VcsCliArgs = { host, project: args.project as string | undefined };
  let context: VcsCliContext;

  try {
    context = await deps.resolveVcsContext(vcsArgs);
  } catch (cause) {
    if (cause instanceof VcsResolveError) {
      deps.stderr.write(`✖ Ошибка: ${cause.message}\n`);
      deps.exit(1);
    }
    throw cause;
  }

  let sourceBranch: string;
  try {
    sourceBranch = await deps.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (sourceBranch === 'HEAD') {
      deps.stderr.write(
        '✖ HEAD не указывает на ветку (detached HEAD). Укажите source branch явно.\n'
      );
      deps.exit(1);
    }
  } catch {
    deps.stderr.write('✖ Не удалось определить текущую ветку: не найден git-репозиторий.\n');
    deps.exit(1);
  }

  let resolvedTarget = targetBranch;
  if (!resolvedTarget) {
    try {
      const headOutput = await deps.git(['remote', 'show', 'origin']);
      const headMatch = headOutput.match(/HEAD branch:\s*(\S+)/);
      if (headMatch) resolvedTarget = headMatch[1];
    } catch {
      // fallback to main
    }
    if (!resolvedTarget) resolvedTarget = 'main';
  }

  const createQuery: VcsMergeRequestCreateQuery = {
    project: context.project,
    title,
    sourceBranch,
    targetBranch: resolvedTarget,
    description,
    draft: draft || undefined,
    labels: labels.length > 0 ? labels : undefined,
    assigneeIds: assigneeId ? [assigneeId] : undefined,
    reviewerIds: reviewerId ? [reviewerId] : undefined,
    milestoneId,
  };

  if (dryRun) {
    deps.stdout.write(
      `Would create MR: ${context.project} ← ${sourceBranch} → ${resolvedTarget}  host=${context.host}  [DRY-RUN] no request sent\n`
    );
    deps.exit(0);
  }

  try {
    const client: VcsClient =
      context.provider === 'github'
        ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
        : new VcsGitlabClient({
            baseUrl: `https://${context.host}/api/v4`,
            token: context.token,
          });
    const result = (await client.MergeRequests.create(createQuery)) as {
      webUrl: string;
      iid: string | number;
      title: string;
    };
    deps.stdout.write(`✓ MR !${result.iid} created: ${result.webUrl}\n`);
  } catch (cause) {
    const msg = (cause as Error).message ?? 'неизвестная ошибка';
    logger.error('[vcs-mr-create] API error', { cause });
    if (msg.includes('NetworkError') || msg.includes('fetch')) {
      deps.stderr.write(`✖ Network error: ${msg}\n`);
    } else if (msg.includes('401') || msg.includes('403')) {
      deps.stderr.write(`✖ API error [403]: ${msg}\n`);
    } else if (msg.includes('404')) {
      deps.stderr.write(`✖ Not found: ${context.project}\n`);
    } else {
      deps.stderr.write(`✖ API error: ${msg}\n`);
    }
    deps.exit(1);
  }

  deps.exit(0);
}
