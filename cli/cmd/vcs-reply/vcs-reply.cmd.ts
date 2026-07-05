#!/usr/bin/env node
// @file: Post replies to GitLab MR discussions: reads JSON array from stdin or opts, posts notes.
// @consumers: vcs-reply
// @tasks: N/A, TSK-70, TSK-72, TSK-78, TSK-79, TSK-87, TSK-100

import fs from 'node:fs';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { VcsDiscussionPosition } from '../../../services/vcs-client/abstract/vcs-client-merge-discussions.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { style } from '../../../shared/common/style.ts';
import { resolveVcsContext } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs, VcsCliContext } from '../_shared/vcs-context-resolver.ts';

/**
 * @purpose One posting instruction: reply to a thread, resolve/reopen a discussion,
 *   start a new discussion / line-level diff comment, or edit/delete an existing note.
 * @invariant `discussionId` → reply; `noteId` → edit or delete; otherwise new discussion (line comment when `position` set).
 * @invariant `resolve` requires `discussionId`; `resolve:false` ignores `body`.
 * @invariant `delete` requires `noteId`.
 * @consumer vcs-reply main
 */
type ReplyItem = {
  /** @purpose Target discussion to reply into; absent → create a new discussion */
  discussionId?: string;
  /** @purpose Comment body (Markdown); required unless resolve/delete/edit is set */
  body?: string;
  /** @purpose Diff position for a line-level comment */
  position?: VcsDiscussionPosition;
  /** @purpose Resolve (true) or reopen (false) the discussion | @invariant Requires discussionId when set */
  resolve?: boolean;
  /** @purpose Code suggestion text to embed in a ```suggestion block | @invariant Requires `position` */
  suggestion?: string;
  /** @purpose Range of lines for the suggestion diff context | @invariant Default { above: 0, below: 0 } */
  suggestionRange?: { above: number; below: number };
  /** @purpose Target note to edit or delete | @invariant Mutually exclusive with discussionId/position operations */
  noteId?: string;
  /** @purpose Delete the note or the entire discussion | @invariant Requires noteId (delete note) or discussionId (delete entire thread) */
  delete?: boolean;
};

/**
 * @purpose Compose a ```suggestion:-A+B code block from suggestion text and range.
 * @param suggestion Code suggestion text
 * @param range Optional line range above/below the diff line
 * @returns Markdown-fenced suggestion block
 */
function composeSuggestionBody(
  suggestion: string,
  range?: { above: number; below: number }
): string {
  const above = range?.above ?? 0;
  const below = range?.below ?? 0;
  return ['```suggestion:-', above, '+', below, '\n', suggestion, '\n```'].join('');
}

/**
 * @purpose Resolve the final body for a ReplyItem: append suggestion block when present.
 * @param it ReplyItem with optional suggestion
 * @returns Final body string with suggestion block appended (or suggestion-only body)
 */
function resolveBody(it: ReplyItem): string {
  if (it.suggestion !== undefined) {
    const block = composeSuggestionBody(it.suggestion, it.suggestionRange);
    return it.body ? `${it.body}\n${block}` : block;
  }
  return it.body!;
}

/**
 * @purpose Validate reply items atomically: prepend 🤖, verify discussionId exists,
 *   validate suggestion syntax, check newPath in diff. Any error aborts batch.
 * @sideEffect Mutates items[i].body — prepends 🤖 prefix when missing.
 * @param items Reply items (already filtered by structural validity).
 * @param discussions Real MR discussions from getAll (null → skip discussionId check).
 * @param diffPaths MR diff file paths from getChanges (null → skip newPath check).
 * @returns null if all valid; otherwise list of {index, error} per invalid item.
 */
function validateReplyItems(
  items: ReplyItem[],
  discussions: unknown[] | null,
  diffPaths: string[] | null
): Array<{ index: number; error: string }> | null {
  const errors: Array<{ index: number; error: string }> = [];
  const validIds = new Set(
    discussions?.map((d) => (d as Record<string, unknown>).id as string).filter(Boolean) ?? []
  );
  const diffSet = diffPaths ? new Set(diffPaths) : null;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    // #region START_AUTO_PREPEND_BOT_PREFIX — check 1: body без 🤖 → авто-дописать
    if (it.body && !it.body.startsWith('🤖')) {
      it.body = `🤖 ${it.body}`;
    }
    // #endregion END_AUTO_PREPEND_BOT_PREFIX

    // #region START_VALIDATE_DISCUSSION_ID — check 2: discussionId сверка с реальными дискуссиями
    if (it.discussionId && validIds.size > 0 && !validIds.has(it.discussionId)) {
      const sample = [...validIds].slice(0, 10).join(', ');
      const extra = validIds.size > 10 ? `... (+${validIds.size - 10})` : '';
      errors.push({
        index: i,
        error: `discussionId "${it.discussionId}" не найден. Валидные: ${sample}${extra}`,
      });
      continue;
    }
    // #endregion END_VALIDATE_DISCUSSION_ID

    // #region START_VALIDATE_SUGGESTION_BLOCK — check 3: ```suggestion блок синтаксически цел
    const bodyText = it.body ?? '';
    const suggestionText =
      it.suggestion !== undefined ? composeSuggestionBody(it.suggestion, it.suggestionRange) : '';
    const combined = bodyText + suggestionText;

    if (combined.includes('```suggestion')) {
      // failure mode: opening header must match ```suggestion:-N+M format
      if (!/```suggestion:-\d+\+\d+/.test(combined)) {
        errors.push({
          index: i,
          error: 'suggestion-блок: неверный заголовок (ожидается ```suggestion:-N+M)',
        });
        continue;
      }
      const afterOpening = combined.slice(combined.indexOf('```suggestion') + 3);
      if (!afterOpening.includes('```')) {
        errors.push({ index: i, error: 'suggestion-блок не закрыт' });
        continue;
      }
      if (!it.position) {
        errors.push({ index: i, error: 'suggestion-блок требует position' });
        continue;
      }
    }
    // #endregion END_VALIDATE_SUGGESTION_BLOCK

    // #region START_VALIDATE_NEW_PATH — check 4: position.newPath в диффе MR
    if (it.position?.newPath && diffSet && !diffSet.has(it.position.newPath)) {
      errors.push({
        index: i,
        error: `position.newPath "${it.position.newPath}" не найден в диффе MR`,
      });
    }
    // #endregion END_VALIDATE_NEW_PATH
  }

  return errors.length > 0 ? errors : null;
}

type MainOpts = {
  project?: string;
  iid?: string;
  dryRun?: boolean;
  stdinJsonArray?: ReplyItem[];
  token?: string;
  /** @purpose Explicit GitLab host (`--vcs-host`); overrides the host derived from `origin`. */
  host?: string;
  remote?: { host: string; project: string; scheme: string } | null;
  baseUrl?: string;
  vcs?: VcsClient;
  /** @purpose Pre-resolved VCS context — when set, skips git auto-detection. */
  vcsContext?: VcsCliContext;
};

/**
 * @purpose Post replies to GitLab MR discussions: reads JSON array from stdin or opts, posts notes.
 * @param [opts] project, iid, dryRun, stdinJsonArray, token, remote, baseUrl, vcs (for tests).
 * @returns Object { ok, sent, failed, code, error?, detail? }; code 0 on ok, otherwise 1.
 *   `error` and `detail` populated on INVALID_ARGS validation failure (TSK-100).
 * @sideEffect Network: POST to GitLab Discussions API; Console: status and error output.
 * @consumer CLI (cmd/vcs-reply)
 */
export async function main(opts: MainOpts = {}): Promise<{
  ok: boolean;
  sent: number;
  failed: number;
  code: number;
  error?: string;
  detail?: string;
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
      console.error(style.gray(`  [{"noteId":"12345","body":"исправленный текст"}]`));
      console.error(style.gray(`  [{"noteId":"12345","delete":true}]`));
      console.error(style.gray(`  [{"discussionId":"DISC_001","delete":true}]`));
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

  const invalidSuggestion = payload.find((x) => x && x.suggestion !== undefined && !x.position);
  if (invalidSuggestion) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'suggestion требует position.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const invalidNoteDelete = payload.find((x) => x && x.delete && !x.noteId && !x.discussionId);
  if (invalidNoteDelete) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'delete требует noteId или discussionId.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const invalidNoteEdit = payload.find((x) => x && x.noteId && !x.delete && !x.body);
  if (invalidNoteEdit) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'edit note требует body.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const items = payload.filter((x) => {
    if (!x) return false;
    if (x.noteId) {
      if (x.delete) return true;
      return typeof x.body === 'string' && x.body.length > 0;
    }
    if (x.delete && x.discussionId) {
      return typeof x.discussionId === 'string' && x.discussionId.length > 0;
    }
    if (x.resolve !== undefined) {
      return typeof x.discussionId === 'string' && x.discussionId.length > 0;
    }
    const hasBody = typeof x.body === 'string' && x.body.length > 0;
    const hasSuggestion =
      typeof x.suggestion === 'string' && x.suggestion.length > 0 && !!x.position;
    const validDiscussionId = x.discussionId === undefined || typeof x.discussionId === 'string';
    return (hasBody || hasSuggestion) && validDiscussionId;
  });

  if (items.length === 0) {
    console.error(style.redBright.bold('✖ Ошибка:'), 'Нет валидных элементов.');
    return { ok: false, sent: 0, failed: 0, code: 1 };
  }

  const kindOf = (it: ReplyItem): string =>
    it.noteId
      ? it.delete
        ? 'delete'
        : 'edit'
      : it.discussionId
        ? it.delete
          ? 'delete-discussion'
          : 'reply'
        : it.position
          ? 'line'
          : 'discussion';

  // #region START_RESOLVE_VCS_CONTEXT
  const vcsContext = opts.vcsContext;
  const host: string =
    vcsContext?.host ??
    opts.host ??
    ((parseArgs(process.argv, {
      'vcs-host': { aliases: ['vcs-host', 'vcs-source'], takesValue: true },
    })['vcs-host'] as string) ||
      undefined) ??
    '';
  const token = opts.token ?? vcsContext?.token;
  // #endregion END_RESOLVE_VCS_CONTEXT

  let vcs: VcsClient | null = null;
  let hostInfo = '';
  if (!dryRun) {
    if (!token) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден токен доступа.');
      console.error('  Установите переменную окружения для вашего провайдера:');
      console.error(style.cyan('  GitHub: export GITHUB_PERSONAL_TOKEN="..."'));
      console.error(style.cyan('  GitLab: export GITLAB_PERSONAL_TOKEN="..."'));
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    if (!host) {
      console.error(
        style.redBright.bold('✖ Ошибка:'),
        'Не определён VCS-хост. Укажите --vcs-host=<host> или запустите из репозитория с origin.'
      );
      return { ok: false, sent: 0, failed: 0, code: 1 };
    }
    const provider = vcsContext?.provider ?? (/github/i.test(host) ? 'github' : 'gitlab');
    const baseUrl =
      opts.baseUrl ?? (provider === 'github' ? 'https://api.github.com' : `https://${host}/api/v4`);
    vcs =
      opts.vcs ??
      (provider === 'github'
        ? new VcsGithubClient({ baseUrl, token })
        : new VcsGitlabClient({ baseUrl, token }));
    hostInfo = host;
  } else {
    hostInfo = host;
  }

  // #region START_VALIDATE_REPLY_FORMAT — TSK-100: 5 mechanical checks before POST
  if (!dryRun) {
    let discussions: unknown[] | null = null;
    let diffPaths: string[] | null = null;

    try {
      discussions = await vcs!.MergeDiscussions!.getAll({ project, iid });
    } catch {
      // failure mode: getAll unavailable (test mock) or network failure → skip check 2
    }

    try {
      const changes = await vcs!.MergeRequests.getChanges({ repository: project, iid });
      diffPaths = changes.map((c) => c.path);
    } catch {
      // failure mode: getChanges unavailable or network failure → skip check 4
    }

    const validationErrors = validateReplyItems(items, discussions, diffPaths);
    if (validationErrors) {
      console.error(style.redBright.bold('✖ Ошибка:'), 'INVALID_ARGS');
      for (const err of validationErrors) {
        console.error(style.gray(`  [${err.index}] ${err.error}`));
      }
      return {
        ok: false,
        sent: 0,
        failed: 0,
        code: 1,
        error: 'INVALID_ARGS',
        detail: JSON.stringify(validationErrors),
      };
    }
  }
  // #endregion END_VALIDATE_REPLY_FORMAT

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
      // #region START_DRY_RUN_NOTE — noteId: show edit / delete intent
      if (it.noteId) {
        if (it.delete) {
          console.info(`${style.blue('[DRY]')} ${style.gray(`Would delete: noteId=${it.noteId}`)}`);
        } else {
          console.info(
            `${style.blue('[DRY]')} ${style.gray(`edit:${it.noteId}`)} → ${resolveBody(it).slice(0, 80)}`
          );
        }
        sent += 1;
        continue;
      }
      // #endregion END_DRY_RUN_NOTE
      // #region START_DRY_RUN_DELETE_DISCUSSION — delete:true with discussionId → delete entire thread
      if (it.delete && it.discussionId && !it.noteId) {
        console.info(
          `${style.blue('[DRY]')} ${style.gray(`Would delete discussion: discussionId=${it.discussionId}`)}`
        );
        sent += 1;
        continue;
      }
      // #endregion END_DRY_RUN_DELETE_DISCUSSION
      // #region START_DRY_RUN_RESOLVE — resolve:true shows body then resolve; resolve:false shows reopen
      if (it.resolve === true) {
        if (it.body) {
          console.info(
            `${style.blue('[DRY]')} ${style.gray(`reply:${tag}`)} → ${resolveBody(it).slice(0, 80)}`
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
          `${style.blue('[DRY]')} ${style.gray(`${kindOf(it)}:${tag}`)} → ${resolveBody(it).slice(0, 80)}`
        );
      }
      // #endregion END_DRY_RUN_RESOLVE
      sent += 1;
    }
    return { ok: true, sent, failed, code: 0 };
  }

  for (const it of items) {
    const tag = it.discussionId ?? kindOf(it);

    // #region START_EDIT_NOTE — update existing note body
    if (it.noteId && !it.delete) {
      try {
        await vcs!.MergeDiscussions!.updateNote({
          project,
          iid: String(iid),
          noteId: it.noteId,
          body: resolveBody(it),
        });
        console.info(`${style.green('✔')} ${style.gray(`edit:${it.noteId}`)}`);
        sent += 1;
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        const display = /404/.test(msg) ? `Note ${it.noteId} not found` : msg;
        console.error(`${style.redBright('✖')} ${style.gray(`edit:${it.noteId}`)} ${display}`);
        failed += 1;
      }
      continue;
    }
    // #endregion END_EDIT_NOTE

    // #region START_DELETE_NOTE — delete existing note
    if (it.noteId && it.delete) {
      try {
        await vcs!.MergeDiscussions!.deleteNote({
          project,
          iid: String(iid),
          noteId: it.noteId,
          discussionId: it.discussionId,
        });
        console.info(`${style.green('✔')} ${style.gray(`delete:${it.noteId}`)}`);
        sent += 1;
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        const display = /404/.test(msg) ? `Note ${it.noteId} not found` : msg;
        console.error(`${style.redBright('✖')} ${style.gray(`delete:${it.noteId}`)} ${display}`);
        failed += 1;
      }
      continue;
    }
    // #endregion END_DELETE_NOTE

    // #region START_DELETE_DISCUSSION — delete entire discussion thread by discussionId
    if (it.delete && it.discussionId && !it.noteId) {
      try {
        await vcs!.MergeDiscussions!.deleteDiscussion({
          project,
          iid: String(iid),
          discussionId: it.discussionId,
        });
        console.info(`${style.green('✔')} ${style.gray(`delete-discussion:${it.discussionId}`)}`);
        sent += 1;
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        const display = /404/.test(msg) ? `Discussion ${it.discussionId} not found` : msg;
        console.error(
          `${style.redBright('✖')} ${style.gray(`delete-discussion:${it.discussionId}`)} ${display}`
        );
        failed += 1;
      }
      continue;
    }
    // #endregion END_DELETE_DISCUSSION

    // #region START_RESOLVE_REOPEN — resolve:false → reopen only, body ignored
    if (it.resolve === false) {
      try {
        await vcs!.MergeDiscussions!.resolveDiscussion({
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
        await vcs!.MergeDiscussions!.resolveDiscussion({
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
        await vcs!.MergeDiscussions!.addNote({
          project,
          iid: String(iid),
          discussionId: it.discussionId,
          body: resolveBody(it),
        });
      } else {
        await vcs!.MergeDiscussions!.createDiscussion({
          project,
          iid: String(iid),
          body: resolveBody(it),
          position: it.position,
        });
      }

      // #region START_POST_RESOLVE — resolve discussion after successful note
      // failure mode: note posted but resolve fails → warn, count as failed
      if (it.resolve === true) {
        try {
          await vcs!.MergeDiscussions!.resolveDiscussion({
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
  project: { aliases: ['project'], takesValue: true },
  iid: { aliases: ['iid'], takesValue: true },
  'dry-run': ['dry-run', 'dry'],
  'vcs-host': { aliases: ['vcs-host', 'vcs-source'], takesValue: true },
  url: { aliases: ['url'], takesValue: true },
});

const vcsCliArgs: VcsCliArgs = {
  project: args.project as string | undefined,
  iid: args.iid ? Number(args.iid) : undefined,
  host: args['vcs-host'] as string | undefined,
  url: args.url as string | undefined,
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
