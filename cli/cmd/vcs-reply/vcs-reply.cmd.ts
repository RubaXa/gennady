#!/usr/bin/env node
// @file: Post replies to GitLab MR discussions: reads JSON array from stdin or opts, posts notes.
// @consumers: vcs-reply
// @tasks: N/A, TSK-70, TSK-72

import fs from 'node:fs';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import type { VcsDiscussionPosition } from '../../../services/vcs-client/abstract/vcs-client-merge-discussions.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { style } from '../../../shared/common/style.ts';
import { resolveVcsContext } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs, VcsCliContext } from '../_shared/vcs-context-resolver.ts';

/**
 * @purpose One posting instruction: reply to a thread, resolve/reopen a discussion,
 *   or start a new discussion / line-level diff comment.
 * @invariant `discussionId` → reply; otherwise new discussion (line comment when `position` set).
 * @invariant `resolve` requires `discussionId`; `resolve:false` ignores `body`.
 * @consumer vcs-reply main
 */
type ReplyItem = {
  /** @purpose Target discussion to reply into; absent → create a new discussion */
  discussionId?: string;
  /** @purpose Comment body (Markdown); required unless resolve is set with discussionId */
  body?: string;
  /** @purpose Diff position for a line-level comment */
  position?: VcsDiscussionPosition;
  /** @purpose Resolve (true) or reopen (false) the discussion | @invariant Requires discussionId when set */
  resolve?: boolean;
};

type MainOpts = {
  project?: string;
  iid?: string;
  dryRun?: boolean;
  stdinJsonArray?: ReplyItem[];
  token?: string;
  /** @purpose Explicit GitLab host (`--vcs-source`); overrides the host derived from `origin`. */
  host?: string;
  remote?: { host: string; project: string; scheme: string } | null;
  baseUrl?: string;
  vcs?: VcsGitlabClient;
  /** @purpose Pre-resolved VCS context — when set, skips git auto-detection. */
  vcsContext?: VcsCliContext;
};

/**
 * @purpose Post replies to GitLab MR discussions: reads JSON array from stdin or opts, posts notes.
 * @param [opts] project, iid, dryRun, stdinJsonArray, token, remote, baseUrl, vcs (for tests).
 * @returns Object { ok, sent, failed, code }; code 0 on ok, otherwise 1.
 * @sideEffect Network: POST to GitLab Discussions API; Console: status and error output.
 * @consumer CLI (cmd/vcs-reply)
 */
export async function main(opts: MainOpts = {}): Promise<{
  ok: boolean;
  sent: number;
  failed: number;
  code: number;
}> {
  const project = opts.project;
  const iid = opts.iid;
  const dryRun = !!opts.dryRun;
  const stdinJsonArray = opts.stdinJsonArray;

  if (!project) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Не указан --project.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }
  if (!iid) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Не указан --iid.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  let payload: ReplyItem[] | undefined = stdinJsonArray;
  if (!payload) {
    let raw = '';
    if (!process.stdin.isTTY) {
      raw = fs.readFileSync(0, 'utf8');
    }
    if (!raw || !raw.trim()) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Пустой stdin. Ожидается JSON-массив.');
      console.error(style.gray('Примеры:'));
      console.error(style.gray(`  [{"discussionId":"DISC_001","body":"ответ в тред"}]`));
      console.error(style.gray(`  [{"body":"новая дискуссия"}]`));
      console.error(
        style.gray(
          `  [{"body":"коммент на строку","position":{"baseSha":"..","startSha":"..","headSha":"..","newPath":"src/x.ts","newLine":42}}]`
        )
      );
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    try {
      payload = JSON.parse(raw) as ReplyItem[];
    } catch (e) {
      console.error(
        style.redBright.bold('✖ Ошибка:'),
        `Некорректный JSON: ${(e as Error).message ?? String(e)}`
      );
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
  }

  if (!Array.isArray(payload)) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Ожидается JSON-массив.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }
  if (payload.length === 0) {
    return { ok: true, sent: 0, failed: 0, code: 0 };
  }

  const invalidResolve = payload.find((x) => x && x.resolve !== undefined && !x.discussionId);
  if (invalidResolve) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'resolve требует discussionId.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const items = payload.filter((x) => {
    if (!x) return false;
    if (x.resolve !== undefined) {
      return typeof x.discussionId === 'string' && x.discussionId.length > 0;
    }
    return (
      typeof x.body === 'string' &&
      x.body.length > 0 &&
      (x.discussionId === undefined || typeof x.discussionId === 'string')
    );
  });

  if (items.length === 0) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Нет валидных элементов.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const kindOf = (it: ReplyItem): string =>
    it.discussionId ? 'reply' : it.position ? 'line' : 'discussion';

  // #region START_RESOLVE_VCS_CONTEXT
  const vcsContext = opts.vcsContext;
  const host: string =
    vcsContext?.host ??
    opts.host ??
    ((parseArgs(process.argv, { 'vcs-source': ['vcs-source'] })['vcs-source'] as string) ||
      undefined) ??
    '';
  const token = opts.token ?? vcsContext?.token ?? process.env.GITLAB_PERSONAL_TOKEN;
  // #endregion END_RESOLVE_VCS_CONTEXT

  let vcs: VcsGitlabClient | null = null;
  let hostInfo = '';
  if (!dryRun) {
    if (!token) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден токен доступа GitLab.');
      console.error('  Установите переменную окружения:');
      console.error(style.cyan('  export GITLAB_PERSONAL_TOKEN="your_token_here"'));
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    if (!host) {
      console.error(
        style.redBright.bold('✖ Ошибка:'),
        'Не определён GitLab-host. Укажите --vcs-source=<host> или запустите из репозитория с origin.'
      );
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    if (!/gitlab/i.test(host)) {
      console.error(
        style.redBright.bold('✖ Ошибка:'),
        `Провайдер "${style.blue(host)}" пока не поддерживается.`
      );
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    const baseUrl = opts.baseUrl ?? `https://${host}/api/v4`;
    vcs = opts.vcs ?? new VcsGitlabClient({ token, baseUrl });
    hostInfo = host;
  } else {
    hostInfo = host;
  }

  console.info(
    '🤖',
    style.whiteBright.bold('GENNADY'),
    style.gray(' → '),
    style.yellow('vcs-reply')
  );
  console.info(style.gray('-'.repeat(40)));
  console.info(`- project: ${style.cyan(project)}`);
  console.info(`- iid: ${style.cyan(String(iid))}`);
  if (hostInfo) console.info(`- host: ${style.cyan(hostInfo)}`);
  console.info(`- mode: ${dryRun ? style.yellow('dry-run') : style.green('live')}`);
  console.info(style.gray('-'.repeat(40)));

  let sent = 0;
  let failed = 0;

  if (dryRun) {
    for (const it of items) {
      const tag = it.discussionId ?? kindOf(it);
      // #region START_DRY_RUN_RESOLVE — resolve:true shows body then resolve; resolve:false shows reopen
      if (it.resolve === true) {
        if (it.body) {
          console.info(
            `${style.blue('[DRY]')} ${style.gray(`reply:${tag}`)} → ${it.body.slice(0, 80)}`
          );
        }
        console.info(
          `${style.blue('[DRY]')} ${style.gray(`Would resolve: discussionId=${it.discussionId}`)}`
        );
      } else if (it.resolve === false) {
        console.info(
          `${style.blue('[DRY]')} ${style.gray(`Would reopen: discussionId=${it.discussionId}`)}`
        );
      } else {
        console.info(
          `${style.blue('[DRY]')} ${style.gray(`${kindOf(it)}:${tag}`)} → ${it.body!.slice(0, 80)}`
        );
      }
      // #endregion END_DRY_RUN_RESOLVE
      sent += 1;
    }
    return { ok: true, sent, failed, code: 0 };
  }

  for (const it of items) {
    const tag = it.discussionId ?? kindOf(it);

    // #region START_RESOLVE_REOPEN — resolve:false → reopen only, body ignored
    if (it.resolve === false) {
      try {
        await vcs!.MergeDiscussions.resolveDiscussion({
          project,
          iid: String(iid),
          discussionId: it.discussionId!,
          resolved: false,
        });
        console.info(`${style.green('✔')} ${style.gray(`reopen:${tag}`)}`);
        sent += 1;
      } catch (e) {
        console.error(
          `${style.redBright('✖')} ${style.gray(`reopen:${tag}`)} ${(e as Error).message ?? String(e)}`
        );
        failed += 1;
      }
      continue;
    }
    // #endregion END_RESOLVE_REOPEN

    // #region START_RESOLVE_ONLY — resolve:true without body → resolve only
    if (it.resolve === true && !it.body) {
      try {
        await vcs!.MergeDiscussions.resolveDiscussion({
          project,
          iid: String(iid),
          discussionId: it.discussionId!,
          resolved: true,
        });
        console.info(`${style.green('✔')} ${style.gray(`resolve:${tag}`)}`);
        sent += 1;
      } catch (e) {
        console.error(
          `${style.redBright('✖')} ${style.gray(`resolve:${tag}`)} ${(e as Error).message ?? String(e)}`
        );
        failed += 1;
      }
      continue;
    }
    // #endregion END_RESOLVE_ONLY

    // #region START_POST_NOTE — reply or new discussion, optionally followed by resolve
    try {
      if (it.discussionId) {
        await vcs!.MergeDiscussions.addNote({
          project,
          iid: String(iid),
          discussionId: it.discussionId,
          body: it.body!,
        });
      } else {
        await vcs!.MergeDiscussions.createDiscussion({
          project,
          iid: String(iid),
          body: it.body!,
          position: it.position,
        });
      }

      // #region START_POST_RESOLVE — resolve discussion after successful note
      // failure mode: note posted but resolve fails → warn, count as failed
      if (it.resolve === true) {
        try {
          await vcs!.MergeDiscussions.resolveDiscussion({
            project,
            iid: String(iid),
            discussionId: it.discussionId!,
            resolved: true,
          });
        } catch (resolveErr) {
          const msg = (resolveErr as Error).message ?? String(resolveErr);
          console.error(
            `${style.redBright('✖')} ${style.gray(`reply:${tag}`)} Note posted but resolve failed: ${msg}`
          );
          failed += 1;
          continue;
        }
      }
      // #endregion END_POST_RESOLVE

      console.info(`${style.green('✔')} ${style.gray(`${kindOf(it)}:${tag}`)}`);
      sent += 1;
    } catch (e) {
      console.error(
        `${style.redBright('✖')} ${style.gray(`${kindOf(it)}:${tag}`)} ${(e as Error).message ?? String(e)}`
      );
      failed += 1;
    }
    // #endregion END_POST_NOTE
  }

  const ok = failed === 0;
  console.info(style.gray('-'.repeat(40)));
  console.info(`- sent: ${style.green(String(sent))}`);
  console.info(`- failed: ${failed ? style.redBright(String(failed)) : style.green('0')}`);
  return { ok, sent, failed, code: ok ? 0 : 1 };
}

const args = parseArgs(process.argv, {
  project: ['project'],
  iid: ['iid'],
  'dry-run': ['dry-run', 'dry'],
  'vcs-source': ['vcs-source'],
});

const vcsCliArgs: VcsCliArgs = {
  project: args.project as string | undefined,
  iid: args.iid ? Number(args.iid) : undefined,
  host: args['vcs-source'] as string | undefined,
};

try {
  const vcsContext = await resolveVcsContext(vcsCliArgs);

  const run = await main({
    project: args.project as string,
    iid: args.iid as string,
    dryRun: !!args['dry-run'],
    vcsContext,
  });

  process.exit(run.code);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✖ Ошибка: ${message}`);
  process.exit(1);
}
