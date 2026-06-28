#!/usr/bin/env node
// @file: Edit a GitLab merge request — title, description, draft/ready, labels, assignee, reviewer.
// @consumers: gennady.ts
// @tasks: TSK-92

import {
  resolveVcsContext,
  VcsResolveError,
  type VcsCliArgs,
  type VcsCliContext,
} from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { VcsMergeRequestUpdateQuery } from '../../../services/vcs-client/entities/vcs-merge-request-update-query.type.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';

type Deps = {
  resolveVcsContext: typeof resolveVcsContext;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  exit: (code: number) => never;
};

function defaultDeps(): Deps {
  return {
    resolveVcsContext,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
  };
}

function createClient(ctx: VcsCliContext): VcsClient {
  return ctx.provider === 'github'
    ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: ctx.token })
    : new VcsGitlabClient({ baseUrl: `https://${ctx.host}/api/v4`, token: ctx.token });
}

/**
 * @purpose Edit a GitLab MR — title, description, draft/ready, labels, assignee, reviewer.
 *   Uses vcs-context-resolver for auto-detection.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: PUT /projects/:id/merge_requests/:iid
 */
export async function run(rawArgs: string[], deps: Deps = defaultDeps()): Promise<void> {
  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    project: { aliases: ['project'], takesValue: true },
    iid: { aliases: ['iid'], takesValue: true },
    title: { aliases: ['title'], takesValue: true },
    description: { aliases: ['description'], takesValue: true },
    'target-branch': { aliases: ['target-branch'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    label: { aliases: ['label'], takesValue: true },
    unlabel: { aliases: ['unlabel'], takesValue: true },
    assignee: { aliases: ['assignee'], takesValue: true },
    reviewer: { aliases: ['reviewer'], takesValue: true },
    milestone: { aliases: ['milestone'], takesValue: true },
    draft: ['draft'],
    ready: ['ready'],
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const ref = args.ref as string | undefined;
  const project = args.project as string | undefined;
  const iidRaw = args.iid as string | undefined;
  const dryRun = !!args['dry-run'];
  const draft = !!args.draft;
  const ready = !!args.ready;

  if (draft && ready) {
    deps.stderr.write('✖ --draft and --ready are mutually exclusive\n');
    deps.exit(1);
  }

  if (ref && !/^.+\!\d+$/.test(ref)) {
    deps.stderr.write('✖ Invalid ref format. Expected: <group/repo>!<iid>\n');
    deps.exit(1);
  }

  const host = args.host as string | undefined;
  const iid = ref ? Number(ref.split('!').pop()) : iidRaw ? Number(iidRaw) : undefined;
  const validIid = iid !== undefined && !isNaN(iid) && iid > 0 ? iid : undefined;

  const vcsArgs: VcsCliArgs = { host, ref, project, iid: validIid };
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

  let resolvedIid = context.iid ?? validIid;

  if ((!resolvedIid || isNaN(resolvedIid) || resolvedIid <= 0) && context.branch) {
    const client = createClient(context);
    const mr = (await client.MergeRequests.getOne({
      project: context.project,
      sourceBranch: context.branch,
    })) as {
      iid?: number;
    } | null;
    if (mr?.iid) resolvedIid = mr.iid;
  }

  if (!resolvedIid || isNaN(resolvedIid) || resolvedIid <= 0) {
    deps.stderr.write('✖ Specify --ref <group/repo>!<iid> or --project and --iid\n');
    deps.exit(1);
  }

  const title = args.title as string | undefined;
  const description = args.description as string | undefined;
  const targetBranch = args['target-branch'] as string | undefined;
  const addLabels = [args.label].flat().filter((l): l is string => typeof l === 'string');
  const removeLabels = [args.unlabel].flat().filter((l): l is string => typeof l === 'string');
  const assigneeId = args.assignee as string | undefined;
  const reviewerId = args.reviewer as string | undefined;
  const milestoneId = args.milestone as string | undefined;

  const client = createClient(context);

  const updateQuery: VcsMergeRequestUpdateQuery = {
    project: context.project,
    iid: resolvedIid,
    title,
    description,
    draft: draft ? true : ready ? false : undefined,
    addLabels: addLabels.length > 0 ? addLabels : undefined,
    removeLabels: removeLabels.length > 0 ? removeLabels : undefined,
    assigneeIds: assigneeId ? [assigneeId] : undefined,
    reviewerIds: reviewerId ? [reviewerId] : undefined,
    targetBranch,
    milestoneId,
  };

  if (dryRun) {
    deps.stdout.write(
      `Would update MR: ${context.project}!${resolvedIid}  host=${context.host}  [DRY-RUN] no request sent\n`
    );
    deps.exit(0);
  }

  try {
    const result = (await client.MergeRequests.update(updateQuery)) as {
      webUrl: string;
      iid: string | number;
      title: string;
    };
    deps.stdout.write(`✓ MR !${result.iid} updated: ${result.webUrl}\n`);
  } catch (cause) {
    const msg = (cause as Error).message ?? 'неизвестная ошибка';
    logger.error('[vcs-mr-edit] API error', { cause });
    if (msg.includes('404')) {
      deps.stderr.write(`✖ MR ${context.project}!${resolvedIid} не найден.\n`);
    } else if (msg.includes('At least one field')) {
      deps.stderr.write(`✖ At least one field to update is required\n`);
    } else {
      deps.stderr.write(`✖ API error: ${msg}\n`);
    }
    deps.exit(1);
  }

  deps.exit(0);
}
