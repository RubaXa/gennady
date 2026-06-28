#!/usr/bin/env node
// @file: CLI command: vcs-todo — mark todos done via Inbox.markTodoDone
// @consumers: N/A
// @tasks: TSK-76

import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import { resolveVcsContext } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs, VcsCliContext } from '../_shared/vcs-context-resolver.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { style } from '../../../shared/common/style.ts';
import { logger } from '#logger';
import { getGitRemote } from '../../../shared/backend/git/git-core.ts';

/** @purpose Options consumed by the vcs-todo main function. */
type MainOpts = {
  /** @purpose MR ref in group/repo!iid format for --done */
  doneRef?: string;
  /** @purpose Direct todo id for --id */
  todoId?: string;
  /** @purpose Dry-run: print would-mark messages, skip GraphQL */
  dryRun?: boolean;
  /** @purpose Explicit VCS host override */
  host?: string;
  /** @purpose Pre-resolved VCS context for testing */
  vcsContext?: VcsCliContext;
};

// #region START_RESOLVE_HOST
/**
 * @purpose Resolve the GitLab host for --id path: explicit host overrides
 *   git remote autodetect.
 * @param [host] Explicit host from --vcs-source.
 * @returns GitLab host without scheme, e.g. gitlab.example.com.
 */
function resolveHost(host?: string): string | undefined {
  if (host) return host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const remote = getGitRemote();
  return remote?.host;
}
// #endregion END_RESOLVE_HOST

/**
 * @purpose Mark GitLab todos as done: either all todos for a given MR (--done <ref>)
 *   or a specific todo by id (--id <todoId>). Supports --dry-run.
 * @implements {VcsTodoCli} in specs/cli/cli.spec.md#FR-TD-01..04
 * @param [opts] Command options.
 * @returns Object { ok, code }; code 0 on success, otherwise 1.
 * @sideEffect Network: POST /api/graphql (getActionable, todoMarkDone); Console: status output.
 */
export async function main(opts: MainOpts = {}): Promise<{ ok: boolean; code: number }> {
  const dryRun = !!opts.dryRun;

  const token = opts.vcsContext?.token ?? process.env.GITLAB_PERSONAL_TOKEN;
  const host = opts.vcsContext?.host ?? resolveHost(opts.host);

  if (!token) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден токен доступа GitLab.');
    console.error('  Установите переменную окружения:');
    console.error(style.cyan('  export GITLAB_PERSONAL_TOKEN="your_token_here"'));
    return { ok: false, code: 1 };
  }
  if (!host) {
    console.error(
      style.redBright.bold('✖ Ошибка:'),
      'Не определён GitLab-host. Укажите --vcs-source=<host> или запустите из репозитория с origin.'
    );
    return { ok: false, code: 1 };
  }

  const provider = opts.vcsContext?.provider ?? (/github/i.test(host!) ? 'github' : 'gitlab');
  const baseUrl = provider === 'github' ? 'https://api.github.com' : `https://${host}/api/v4`;
  const vcs: VcsClient = provider === 'github'
    ? new VcsGithubClient({ token, baseUrl })
    : new VcsGitlabClient({ token, baseUrl });

  // #region START_MARK_TODO_BY_ID — --id <todoId>: direct markTodoDone call
  if (opts.todoId) {
    logger.debug(`[vcs-todo] [idle → marking] ${opts.todoId}`);
    if (dryRun) {
      console.info(`Would mark todo done: ${opts.todoId}`);
      return { ok: true, code: 0 };
    }
    try {
      await vcs.Inbox!.markTodoDone({ todoId: opts.todoId });
      console.info(`${style.green('✔')} Todo marked done: ${opts.todoId}`);
      logger.info(`[vcs-todo] [marking → done] ${opts.todoId}`);
      return { ok: true, code: 0 };
    } catch (cause) {
      const error = new Error(`[vcs-todo] Failed to mark todo done: ${opts.todoId}`, { cause });
      logger.error(`[vcs-todo] [marking → failed] ${opts.todoId}`, { error });
      console.error(style.redBright.bold('✖ Ошибка:'), (cause as Error).message ?? String(cause));
      return { ok: false, code: 1 };
    }
  }
  // #endregion END_MARK_TODO_BY_ID

  // #region START_MARK_TODOS_BY_REF — --done <ref>: getActionable → markTodoDone per todoId
  if (opts.doneRef) {
    const sep = opts.doneRef.lastIndexOf('!');
    if (sep === -1) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Ожидался ref вида group/project!iid');
      return { ok: false, code: 1 };
    }
    const project = opts.doneRef.slice(0, sep);
    const iid = opts.doneRef.slice(sep + 1);

    try {
      logger.debug(`[vcs-todo] [idle → fetching] ${opts.doneRef}`);
      const items = await vcs.Inbox!.getActionable();
      const mr = items.find((m) => m.project === project && m.iid === iid);

      if (!mr || mr.todoIds.length === 0) {
        console.info(style.yellow('ℹ No pending todos for this MR'));
        logger.info(`[vcs-todo] [fetching → no-todos] ${opts.doneRef}`);
        return { ok: true, code: 0 };
      }

      logger.info(`[vcs-todo] [fetching → marking] ${mr.todoIds.length} todos for ${opts.doneRef}`);

      for (const todoId of mr.todoIds) {
        if (dryRun) {
          console.info(`Would mark todo done: ${todoId}`);
        } else {
          await vcs.Inbox!.markTodoDone({ todoId });
          console.info(`${style.green('✔')} Todo marked done: ${todoId}`);
        }
      }

      logger.info(`[vcs-todo] [marking → done] ${mr.todoIds.length} todos for ${opts.doneRef}`);
      return { ok: true, code: 0 };
    } catch (cause) {
      const error = new Error(`[vcs-todo] Failed to process todos for ${opts.doneRef}`, { cause });
      logger.error(`[vcs-todo] [fetching → failed] ${opts.doneRef}`, { error });
      console.error(style.redBright.bold('✖ Ошибка:'), (cause as Error).message ?? String(cause));
      return { ok: false, code: 1 };
    }
  }
  // #endregion END_MARK_TODOS_BY_REF

  console.error(style.redBright.bold('✖ Ошибка:'), 'Укажите --done <ref> или --id <todoId>.');
  return { ok: false, code: 1 };
}

/**
 * @purpose CLI entry point for vcs-todo: parse args, resolve VCS context, delegate to main().
 * @param [rawArgs] CLI arguments (defaults to process.argv).
 * @returns Exit code (0 on success, 1 on failure).
 * @sideEffect Console: error output on failure.
 */
export async function run(rawArgs: string[] = process.argv): Promise<number> {
  try {
    const args = parseArgs(rawArgs, {
      done: { aliases: ['done'], takesValue: true },
      id: { aliases: ['id'], takesValue: true },
      'dry-run': ['dry-run', 'dry'],
      'vcs-source': { aliases: ['vcs-source', 'host'], takesValue: true },
    });

    const vcsCliArgs: VcsCliArgs = {
      host: (args['vcs-source'] as string) || undefined,
    };

    const vcsContext = await resolveVcsContext(vcsCliArgs);

    const result = await main({
      doneRef: args.done as string | undefined,
      todoId: args.id as string | undefined,
      dryRun: !!args['dry-run'],
      host: (args['vcs-source'] as string) || undefined,
      vcsContext,
    });

    return result.code;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✖ Ошибка: ${message}`);
    return 1;
  }
}
