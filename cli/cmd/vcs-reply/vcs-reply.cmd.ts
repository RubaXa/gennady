#!/usr/bin/env node
// @file: Post replies to GitLab MR discussions: reads JSON array from stdin or opts, posts notes.
// @consumers: vcs-reply
// @tasks: N/A

import fs from 'node:fs';
import { getGitRemote } from '../../../shared/backend/git/git-core.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import type { VcsDiscussionPosition } from '../../../services/vcs-client/abstract/vcs-client-merge-discussions.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { style } from '../../../shared/common/style.ts';

/**
 * @purpose One posting instruction: reply to a thread, a new discussion, or a
 *   line-level diff comment.
 * @invariant `discussionId` → reply; otherwise new discussion (line comment when `position` set).
 * @consumer vcs-reply main
 */
type ReplyItem = {
  /** @purpose Target discussion to reply into; absent → create a new discussion */
  discussionId?: string;
  /** @purpose Comment body (Markdown) */
  body: string;
  /** @purpose Diff position for a line-level comment */
  position?: VcsDiscussionPosition;
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

  if (!Array.isArray(payload) || payload.length === 0) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Ожидается непустой JSON-массив объектов.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const items = payload.filter(
    (x) =>
      x &&
      typeof x.body === 'string' &&
      x.body &&
      (x.discussionId === undefined || typeof x.discussionId === 'string')
  );

  if (items.length === 0) {
    console.error(
      style.redBright.bold('✖ Ошибка:'),
      'Нет валидных элементов (нужен непустой body).'
    );
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const kindOf = (it: ReplyItem): string =>
    it.discussionId ? 'reply' : it.position ? 'line' : 'discussion';

  const token = opts.token ?? process.env.GITLAB_PERSONAL_TOKEN;
  const remote = opts.remote ?? getGitRemote();
  // `--vcs-source` wins over the host derived from `origin`, so vcs-reply can target a
  // GitLab MR regardless of the current working directory's remote. Resolved here (as in
  // vcs-worktree) rather than only in index.ts, so it works however the command is invoked.
  const cliSource =
    (parseArgs(process.argv, { 'vcs-source': ['vcs-source'] })['vcs-source'] as string) ||
    undefined;
  const host = opts.host ?? cliSource ?? remote?.host ?? '';
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
      console.info(
        `${style.blue('[DRY]')} ${style.gray(`${kindOf(it)}:${tag}`)} → ${it.body.slice(0, 80)}`
      );
      sent += 1;
    }
    return { ok: true, sent, failed, code: 0 };
  }

  for (const it of items) {
    const tag = it.discussionId ?? kindOf(it);
    try {
      if (it.discussionId) {
        await vcs!.MergeDiscussions.addNote({
          project,
          iid: String(iid),
          discussionId: it.discussionId,
          body: it.body,
        });
      } else {
        await vcs!.MergeDiscussions.createDiscussion({
          project,
          iid: String(iid),
          body: it.body,
          position: it.position,
        });
      }
      console.info(`${style.green('✔')} ${style.gray(`${kindOf(it)}:${tag}`)}`);
      sent += 1;
    } catch (e) {
      console.error(
        `${style.redBright('✖')} ${style.gray(`${kindOf(it)}:${tag}`)} ${(e as Error).message ?? String(e)}`
      );
      failed += 1;
    }
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
});

const run = await main({
  project: args.project as string,
  iid: args.iid as string,
  dryRun: !!args['dry-run'],
});

process.exit(run.code);
