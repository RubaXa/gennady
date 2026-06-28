#!/usr/bin/env node
// @file: Add/remove emoji reactions on MR/PR comments — 👍 🚀 ❤️ etc.
// @consumers: gennady.ts
// @tasks: TSK-98

import {
  resolveVcsContext,
  VcsResolveError,
  type VcsCliArgs,
  type VcsCliContext,
} from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { VcsReactionQuery } from '../../../services/vcs-client/entities/vcs-reaction-query.type.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';

const EMOJI_MAP: Record<string, { gitlab: string; github: string }> = {
  '👍': { gitlab: 'thumbsup', github: '+1' },
  '👎': { gitlab: 'thumbsdown', github: '-1' },
  '😄': { gitlab: 'smile', github: 'laugh' },
  '🎉': { gitlab: 'tada', github: 'hooray' },
  '😕': { gitlab: 'confused', github: 'confused' },
  '❤️': { gitlab: 'heart', github: 'heart' },
  '🚀': { gitlab: 'rocket', github: 'rocket' },
  '👀': { gitlab: 'eyes', github: 'eyes' },
  '🤡': { gitlab: 'clown_face', github: 'hooray' },
  '+1': { gitlab: 'thumbsup', github: '+1' },
  '-1': { gitlab: 'thumbsdown', github: '-1' },
  thumbsup: { gitlab: 'thumbsup', github: '+1' },
  thumbsdown: { gitlab: 'thumbsdown', github: '-1' },
  rocket: { gitlab: 'rocket', github: 'rocket' },
  heart: { gitlab: 'heart', github: 'heart' },
  laugh: { gitlab: 'smile', github: 'laugh' },
  hooray: { gitlab: 'tada', github: 'hooray' },
  eyes: { gitlab: 'eyes', github: 'eyes' },
};

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
 * @purpose Add or remove an emoji reaction on an MR/PR comment.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies.
 * @returns Promise resolving after process termination.
 * @sideEffect Network: POST/DELETE to provider API.
 */
export async function run(rawArgs: string[], deps: Deps = defaultDeps()): Promise<void> {
  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    project: { aliases: ['project'], takesValue: true },
    iid: { aliases: ['iid'], takesValue: true },
    comment: { aliases: ['comment'], takesValue: true },
    emoji: { aliases: ['emoji'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    remove: ['remove'],
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const ref = args.ref as string | undefined;
  const project = args.project as string | undefined;
  const iidRaw = args.iid as string | undefined;
  const commentId = args.comment as string | undefined;
  const emojiInput = (args.emoji as string) || (args._ as string[])[0];
  const remove = !!args.remove;
  const host = args.host as string | undefined;
  const dryRun = !!args['dry-run'];

  if (!commentId) {
    deps.stderr.write('✖ --comment <id> is required\n');
    deps.exit(1);
  }
  if (!emojiInput) {
    deps.stderr.write('✖ --emoji <name> is required\n');
    deps.exit(1);
  }

  const mapping = EMOJI_MAP[emojiInput];
  if (!mapping) {
    deps.stderr.write(
      `✖ Unknown emoji: ${emojiInput}. Supported: ${Object.keys(EMOJI_MAP).join(', ')}\n`
    );
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

  const resolvedIid = context.iid ?? validIid;
  if (!resolvedIid) {
    deps.stderr.write('✖ Specify --ref or --project and --iid\n');
    deps.exit(1);
  }

  const client = createClient(context);
  if (!client.Reactions) {
    deps.stderr.write('✖ Reactions not available for this host\n');
    deps.exit(1);
  }

  const providerEmoji = context.provider === 'github' ? mapping.github : mapping.gitlab;

  const query: VcsReactionQuery = {
    project: context.project,
    iid: resolvedIid,
    noteId: commentId,
    emoji: providerEmoji,
  };

  if (dryRun) {
    deps.stdout.write(
      `Would ${remove ? 'remove' : 'add'} ${emojiInput} on ${context.project}!${resolvedIid} comment=${commentId}  host=${context.host}  [DRY-RUN]\n`
    );
    deps.exit(0);
  }

  try {
    if (remove) {
      await client.Reactions.remove(query);
      deps.stdout.write(`✓ Removed ${emojiInput} from comment ${commentId}\n`);
    } else {
      await client.Reactions.add(query);
      deps.stdout.write(`✓ Added ${emojiInput} to comment ${commentId}\n`);
    }
  } catch (cause) {
    logger.error('[vcs-react] API error', { cause });
    deps.stderr.write(`✖ API error: ${(cause as Error).message}\n`);
    deps.exit(1);
  }

  deps.exit(0);
}
