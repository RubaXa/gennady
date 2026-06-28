#!/usr/bin/env node
// @file: Show MR discussions — human-readable output of GitLab MR discussion threads.
// @consumers: gennady.ts
// @tasks: TSK-93

import {
  resolveVcsContext,
  VcsResolveError,
  type VcsCliArgs,
  type VcsCliContext,
} from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
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
 * @purpose Show MR discussions — human-readable output of GitLab MR discussion threads.
 *   Thin wrapper over existing VcsClientMergeDiscussions.getAll().
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: GET /projects/:id/merge_requests/:iid/discussions (paginated)
 */
export async function run(rawArgs: string[], deps: Deps = defaultDeps()): Promise<void> {
  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    project: { aliases: ['project'], takesValue: true },
    iid: { aliases: ['iid'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    all: ['all'],
    json: ['json'],
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const ref = args.ref as string | undefined;
  const project = args.project as string | undefined;
  const iidRaw = args.iid as string | undefined;
  const showAll = !!args.all;
  const json = !!args.json;
  const dryRun = !!args['dry-run'];
  const host = args.host as string | undefined;

  if (ref && !/^.+\!\d+$/.test(ref)) {
    deps.stderr.write('✖ Invalid ref format. Expected: <group/repo>!<iid>\n');
    deps.exit(1);
  }

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

  if (dryRun) {
    deps.stdout.write(
      `Would fetch discussions: ${context.project}!${resolvedIid}  host=${context.host}  [DRY-RUN] no request sent\n`
    );
    deps.exit(0);
  }

  try {
    const client = createClient(context);

    const discussions = (await client.MergeDiscussions!.getAll({
      project: context.project,
      iid: resolvedIid,
    })) as Array<Record<string, unknown>>;

    const filtered = showAll ? discussions : discussions.filter((d) => !d.resolved);

    if (json) {
      deps.stdout.write(JSON.stringify(filtered.map(mapToJson), null, 2) + '\n');
      deps.exit(0);
    }

    if (filtered.length === 0) {
      deps.stdout.write(`No discussions found for ${context.project}!${resolvedIid}\n`);
      deps.exit(0);
    }

    for (const d of filtered) {
      const shortId = String(d.id ?? '').slice(0, 8);
      const notes = (d.notes as Array<Record<string, unknown>> | undefined) ?? [];
      const firstNote = notes[0];
      if (!firstNote) continue;

      const author = firstNote.author as { name?: string; username?: string } | undefined;
      const authorName = author?.name ?? author?.username ?? 'unknown';
      const body = String(firstNote.body ?? '')
        .split('\n')[0]
        .slice(0, 120);

      let extra = '';
      const position = firstNote.position as Record<string, unknown> | undefined;
      if (position?.new_path) {
        const file = position.new_path as string;
        const line = position.new_line as number | undefined;
        extra = file + (line ? `:${line}` : '');
      }
      if (d.resolved) extra += ' (resolved)';
      if (!body) extra += ' (no text)';

      deps.stdout.write(
        `[${shortId}] ${authorName}: ${body || '(no text)'}${extra ? ` (${extra})` : ''}\n`
      );
    }
  } catch (cause) {
    const msg = (cause as Error).message ?? 'неизвестная ошибка';
    logger.error('[vcs-discussions] API error', { cause });
    deps.stderr.write(`✖ API error: ${msg}\n`);
    deps.exit(1);
  }

  deps.exit(0);
}

function mapToJson(d: Record<string, unknown>) {
  const shortId = String(d.id ?? '').slice(0, 8);
  const notes = (d.notes as Array<Record<string, unknown>> | undefined) ?? [];
  const firstNote = notes[0];
  const author = firstNote?.author as { name?: string; username?: string } | undefined;
  const position = firstNote?.position as Record<string, unknown> | undefined;

  return {
    id: d.id,
    shortId,
    author: author?.name ?? author?.username ?? 'unknown',
    body: firstNote?.body ?? '',
    file: position?.new_path ?? undefined,
    line: position?.new_line ?? undefined,
    resolved: !!d.resolved,
    notes: notes.map((n) => ({
      author: (n.author as { name?: string })?.name ?? 'unknown',
      body: n.body ?? '',
      createdAt: n.created_at ?? '',
    })),
  };
}
