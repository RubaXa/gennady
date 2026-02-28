#!/usr/bin/env node

import fs from 'node:fs';
import { getGitRemote } from '../../../shared/backend/git/git-core.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { style } from '../../../shared/common/style.ts';

type MainOpts = {
  project?: string;
  iid?: string;
  dryRun?: boolean;
  stdinJsonArray?: { discussionId: string; body: string }[];
  token?: string;
  remote?: { host: string; project: string; scheme: string } | null;
  baseUrl?: string;
  vcs?: VcsGitlabClient;
};

/**
 * @purpose Отправить ответы в дискуссии GitLab MR: читает JSON-массив из stdin или opts, постит notes.
 * @consumer CLI (cmd/vcs-reply)
 * @param [opts] project, iid, dryRun, stdinJsonArray, token, remote, baseUrl, vcs (для тестов).
 * @returns Объект { ok, sent, failed, code }; code 0 при ok, иначе 1.
 * @sideEffect Network: POST в GitLab Discussions API; Console: вывод статуса и ошибок.
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

  let payload: { discussionId: string; body: string }[] | undefined = stdinJsonArray;
  if (!payload) {
    let raw = '';
    if (!process.stdin.isTTY) {
      raw = fs.readFileSync(0, 'utf8');
    }
    if (!raw || !raw.trim()) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Пустой stdin. Ожидается JSON-массив.');
      console.error(style.gray('Пример:'));
      console.error(style.gray(`  [{"discussionId":"DISC_001","body":"Текст"}]`));
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    try {
      payload = JSON.parse(raw) as { discussionId: string; body: string }[];
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
      typeof x.discussionId === 'string' &&
      x.discussionId &&
      typeof x.body === 'string' &&
      x.body
  );

  if (items.length === 0) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Нет валидных элементов для отправки.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const token = opts.token ?? process.env.GITLAB_PERSONAL_TOKEN;
  const remote = opts.remote ?? getGitRemote();
  let vcs: VcsGitlabClient | null = null;
  let hostInfo = '';
  if (!dryRun) {
    if (!token) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден токен доступа GitLab.');
      console.error('  Установите переменную окружения:');
      console.error(style.cyan('  export GITLAB_PERSONAL_TOKEN="your_token_here"'));
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    if (!remote) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден удалённый репозиторий origin.');
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    if (!/gitlab/i.test(remote.host)) {
      console.error(
        style.redBright.bold('✖ Ошибка:'),
        `Провайдер "${style.blue(remote.host)}" пока не поддерживается.`
      );
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    const apiPath = process.env.GITLAB_API_PATH ?? '/api/v4';
    const baseUrl = opts.baseUrl ?? `https://${remote.host}${apiPath}`;
    vcs = opts.vcs ?? new VcsGitlabClient({ token, baseUrl });
    hostInfo = remote.host;
  } else {
    hostInfo = remote?.host ?? '';
  }

  console.info('🤖', style.whiteBright.bold('GENNADY'), style.gray('→'), style.yellow('vcs-reply'));
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
      console.info(
        `${style.blue('[DRY]')} ${style.gray(it.discussionId)} → ${it.body.slice(0, 80)}`
      );
      sent += 1;
    }
    return { ok: true, sent, failed, code: 0 };
  }

  for (const it of items) {
    try {
      await vcs!.MergeDiscussions.addNote({
        project,
        iid: String(iid),
        discussionId: it.discussionId,
        body: it.body,
      });
      console.info(`${style.green('✔')} ${style.gray(it.discussionId)}`);
      sent += 1;
    } catch (e) {
      console.error(
        `${style.redBright('✖')} ${style.gray(it.discussionId)} ${(e as Error).message ?? String(e)}`
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
