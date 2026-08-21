#!/usr/bin/env node
// @file: Show MR discussions — human-readable output of GitLab MR discussion threads.
// @consumers: gennady.ts
// @tasks: TSK-93, TSK-96

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveVcsContext,
  VcsResolveError,
  type VcsCliArgs,
  type VcsCliContext,
} from '../_shared/vcs-context-resolver.ts';
import { createVcsClient } from '../_shared/create-vcs-client.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { resolveStateDir, mrReportsDir } from '../inbox/_core/logic/state-paths.logic.ts';
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
    url: { aliases: ['url'], takesValue: true },
    all: ['all'],
    json: ['json'],
    'json-file': ['json-file'],
    my: ['my'],
    'with-drafts': ['with-drafts', 'drafts'],
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const ref = args.ref as string | undefined;
  const project = args.project as string | undefined;
  const iidRaw = args.iid as string | undefined;
  const showAll = !!args.all;
  const json = !!args.json;
  const jsonFile = !!args['json-file'];
  const dryRun = !!args['dry-run'];
  const host = args.host as string | undefined;
  const urlArg = args.url as string | undefined;
  const my = !!args.my;
  const withDrafts = !!args['with-drafts'];

  if (withDrafts && !my) {
    if (json) {
      deps.stdout.write(
        JSON.stringify({
          ok: false,
          error: 'INVALID_ARGS',
          detail: '--with-drafts requires --my',
        }) + '\n'
      );
      deps.exit(2);
    }
    deps.stderr.write('✖ Ошибка: --with-drafts requires --my\n');
    deps.exit(1);
  }

  if (ref && !/^.+\!\d+$/.test(ref)) {
    deps.stderr.write('✖ Invalid ref format. Expected: <group/repo>!<iid>\n');
    deps.exit(1);
  }

  const iid = ref ? Number(ref.split('!').pop()) : iidRaw ? Number(iidRaw) : undefined;
  const validIid = iid !== undefined && !isNaN(iid) && iid > 0 ? iid : undefined;

  const vcsArgs: VcsCliArgs = { host, ref, project, iid: validIid, url: urlArg };
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
    const client = createVcsClient(context);
    const mr = (await client.MergeRequests.getOne({
      project: context.project,
      sourceBranch: context.branch,
    })) as {
      iid?: number;
    } | null;
    if (mr?.iid) resolvedIid = mr.iid;
  }

  if (!resolvedIid || isNaN(resolvedIid) || resolvedIid <= 0) {
    deps.stderr.write(
      '✖ Specify --url <mr-url> (preferred) or --ref <group/repo>!<iid> with --host\n'
    );
    deps.exit(1);
  }

  if (dryRun) {
    deps.stdout.write(
      `Would fetch discussions: ${context.project}!${resolvedIid}  host=${context.host}  [DRY-RUN] no request sent\n`
    );
    deps.exit(0);
  }

  try {
    const client = createVcsClient(context);

    const discussions = (await client.MergeDiscussions!.getAll({
      project: context.project,
      iid: resolvedIid,
    })) as Array<Record<string, unknown>>;

    const filtered = showAll
      ? discussions
      : discussions.filter((d) => {
          const firstNote = (d.notes as Array<Record<string, unknown>> | undefined)?.[0];
          return firstNote?.resolved !== true;
        });

    let resultDiscussions = filtered;
    let drafts: unknown[] | undefined;

    if (my) {
      // #region START_APPLY_MY_FILTER
      try {
        const gitlabClient = client as VcsGitlabClient;
        const me = await gitlabClient.getCurrentUser();
        resultDiscussions = resultDiscussions.filter((d) => {
          const notes = (d.notes as Array<Record<string, unknown>>) ?? [];
          return notes.some((n) => {
            const author = n.author as { username?: string } | undefined;
            return author?.username === me.login;
          });
        });
      } catch (cause) {
        if (json) {
          deps.stdout.write(
            JSON.stringify({
              ok: false,
              error: 'NETWORK',
              detail: (cause as Error).message ?? 'Не удалось определить текущего пользователя',
            }) + '\n'
          );
          deps.exit(2);
        }
        deps.stderr.write(
          `✖ Ошибка: ${(cause as Error).message ?? 'Не удалось определить текущего пользователя'}\n`
        );
        deps.exit(1);
      }
      // #endregion END_APPLY_MY_FILTER

      if (withDrafts) {
        // #region START_LOAD_DRAFT_NOTES
        try {
          drafts = await client.MergeDiscussions!.listDraftNotes({
            project: context.project,
            iid: resolvedIid,
          });
        } catch (cause) {
          deps.stderr.write(
            `⚠ Не удалось загрузить черновики: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`
          );
          drafts = [];
        }
        // #endregion END_LOAD_DRAFT_NOTES
      }
    }

    if (jsonFile) {
      // #region START_JSON_FILE — write clean JSON (no banner) to <reportsDir>/discussions.json + compact summary.
      const fullRef = `${context.project}!${resolvedIid}`;
      const reportsDir = mrReportsDir(resolveStateDir(rawArgs), fullRef);
      mkdirSync(reportsDir, { recursive: true });
      const filePath = join(reportsDir, 'discussions.json');
      writeFileSync(filePath, JSON.stringify(resultDiscussions.map(mapToJson), null, 2), 'utf-8');

      let myLogin: string | undefined;
      try {
        const me = await (client as VcsGitlabClient).getCurrentUser();
        myLogin = me.login;
      } catch {
        myLogin = undefined;
      }

      const summary = resultDiscussions.map((d) => {
        const shortId = String(d.id ?? '').slice(0, 8);
        const notes = (d.notes as Array<Record<string, unknown>> | undefined) ?? [];
        const firstNote = notes[0];
        const author = firstNote?.author as { name?: string; username?: string } | undefined;
        const authorName = author?.name ?? author?.username ?? 'unknown';
        const resolved = firstNote?.resolved === true;
        const position = firstNote?.position as Record<string, unknown> | undefined;
        const file = position?.new_path as string | undefined;
        const line = position?.new_line as number | undefined;
        const body = String(firstNote?.body ?? '')
          .split('\n')[0]
          .slice(0, 100);
        const mine = myLogin
          ? notes.some((n) => (n.author as { username?: string } | undefined)?.username === myLogin)
          : false;
        return {
          shortId,
          resolved,
          author: authorName,
          body: body || '(no text)',
          file,
          line,
          mine,
        };
      });

      deps.stdout.write(
        JSON.stringify({ file: filePath, total: resultDiscussions.length, summary }, null, 2) + '\n'
      );
      deps.exit(0);
      // #endregion END_JSON_FILE
    }

    if (json) {
      if (withDrafts) {
        deps.stdout.write(
          JSON.stringify({ discussions: resultDiscussions.map(mapToJson), drafts }, null, 2) + '\n'
        );
      } else {
        deps.stdout.write(JSON.stringify(resultDiscussions.map(mapToJson), null, 2) + '\n');
      }
      deps.exit(0);
    }

    if (resultDiscussions.length === 0) {
      deps.stdout.write(`No discussions found for ${context.project}!${resolvedIid}\n`);
      deps.exit(0);
    }

    for (const d of resultDiscussions) {
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
      if (firstNote.resolved) extra += ' (resolved)';
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
    resolved: firstNote?.resolved ?? null,
    notes: notes.map((n) => ({
      id: n.id,
      author: (n.author as { name?: string })?.name ?? 'unknown',
      username: (n.author as { username?: string })?.username ?? undefined,
      body: n.body ?? '',
      createdAt: n.created_at ?? '',
    })),
  };
}
