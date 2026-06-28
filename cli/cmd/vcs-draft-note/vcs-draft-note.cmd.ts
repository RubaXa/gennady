// @file: Create, list, update, delete, and publish draft notes on GitLab MRs via CLI.
// @consumers: vcs-draft
// @tasks: TSK-87

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

/**
 * @purpose Injectable dependencies for the vcs-draft-note command — defaults to real implementations.
 * @consumer vcs-draft-note run()
 */
export type VcsDraftDeps = {
  /** @purpose VCS context resolution function */
  resolveVcsContext: typeof resolveVcsContext;
  /** @purpose Standard output stream */
  stdout: NodeJS.WriteStream;
  /** @purpose Standard error stream */
  stderr: NodeJS.WriteStream;
  /**
   * @purpose Terminate the process with a given exit code.
   * @param code Exit code (0 = success, non-zero = failure).
   * @returns Never; terminates the process.
   */
  exit: (code: number) => never;
};

/** @purpose Default DI — real process bindings. */
function resolveDefaultDeps(): VcsDraftDeps {
  return {
    resolveVcsContext,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
  };
}

// #region START_RESOLVE_CONTEXT_OR_FAIL
/**
 * @purpose Resolve VCS context from CLI args; on failure — write error to stderr and exit.
 * @param vcsArgs Parsed CLI arguments.
 * @param deps Injected dependencies.
 * @returns Resolved VCS context (never returns on failure).
 */
async function resolveContextOrFail(
  vcsArgs: VcsCliArgs,
  deps: VcsDraftDeps
): Promise<VcsCliContext> {
  try {
    logger.debug('[resolveContextOrFail] [idle → resolving]');
    const context = await deps.resolveVcsContext(vcsArgs);
    logger.info(
      `[resolveContextOrFail] [resolving → resolved] ${context.host}/${context.project}${context.iid ? `!${context.iid}` : ''}`
    );
    return context;
  } catch (cause) {
    if (cause instanceof VcsResolveError) {
      logger.error(
        `[resolveContextOrFail] [resolving → failed] ${(cause as VcsResolveError).message}`,
        { cause }
      );
      deps.stderr.write(`✖ Ошибка: ${cause.message}\n`);
      deps.exit(1);
    }
    const error = new Error('[resolveContextOrFail] VCS context resolution failed', { cause });
    logger.error(`[resolveContextOrFail] [resolving → failed]`, { error });
    deps.stderr.write(`✖ Ошибка: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`);
    deps.exit(1);
  }
}
// #endregion END_RESOLVE_CONTEXT_OR_FAIL

// #region START_LIST_DRAFT_NOTES
/**
 * @purpose Retrieve and print the authenticated user's draft notes for an MR.
 * @param context Resolved VCS context.
 * @param deps Injected dependencies.
 * @sideEffect Network: GET draft_notes; Console: draft notes list.
 */
async function listDrafts(context: VcsCliContext, deps: VcsDraftDeps): Promise<void> {
  const client: VcsClient =
    context.provider === 'github'
      ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
      : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });
  const iid = context.iid!;

  logger.info(`[listDrafts] [idle → listing] ${context.project}!${iid}`);
  const drafts = await client.MergeDiscussions!.listDraftNotes({
    project: context.project,
    iid: String(iid),
  });

  const count = drafts.length;
  if (count === 0) {
    deps.stdout.write('Нет черновиков для этого MR.\n');
    logger.info(`[listDrafts] [listing → empty]`);
    return;
  }

  deps.stdout.write(`Черновики (${count}):\n`);
  for (const draft of drafts) {
    const d = draft as Record<string, unknown>;
    const id = String(d.id ?? d.draft_note_id ?? '?');
    const body = String(d.body ?? '').slice(0, 80);
    deps.stdout.write(`  #${id}: ${body}${(d.body as string)?.length > 80 ? '…' : ''}\n`);
  }

  logger.info(`[listDrafts] [listing → listed] count=${count}`);
  deps.exit(0);
}
// #endregion END_LIST_DRAFT_NOTES

// #region START_CREATE_DRAFT_NOTE
/**
 * @purpose Create a new draft note on an MR.
 * @param context Resolved VCS context.
 * @param body Draft note body text.
 * @param deps Injected dependencies.
 * @sideEffect Network: POST draft_notes; Console: created draft note ID.
 */
async function createDraft(
  context: VcsCliContext,
  body: string,
  deps: VcsDraftDeps
): Promise<void> {
  const client: VcsClient =
    context.provider === 'github'
      ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
      : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });
  const iid = context.iid!;

  logger.info(`[createDraft] [idle → creating] ${context.project}!${iid}`);
  const draft = await client.MergeDiscussions!.createDraftNote({
    project: context.project,
    iid: String(iid),
    body,
  });

  const id = (draft as Record<string, unknown>).id ?? '?';
  deps.stdout.write(`✓ Черновик #${id} создан\n`);
  logger.info(`[createDraft] [creating → created] id=${id}`);
  deps.exit(0);
}
// #endregion END_CREATE_DRAFT_NOTE

// #region START_UPDATE_DRAFT_NOTE
/**
 * @purpose Update the body of an existing draft note.
 * @param context Resolved VCS context.
 * @param draftNoteId Target draft note identifier.
 * @param body Updated body text.
 * @param deps Injected dependencies.
 * @sideEffect Network: PUT draft_notes/:id; Console: update confirmation.
 */
async function updateDraft(
  context: VcsCliContext,
  draftNoteId: string | number,
  body: string,
  deps: VcsDraftDeps
): Promise<void> {
  const client: VcsClient =
    context.provider === 'github'
      ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
      : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });
  const iid = context.iid!;

  logger.info(
    `[updateDraft] [idle → updating] ${context.project}!${iid} draftNoteId=${draftNoteId}`
  );
  const draft = await client.MergeDiscussions!.updateDraftNote({
    project: context.project,
    iid: String(iid),
    draftNoteId,
    body,
  });

  const id = (draft as Record<string, unknown>).id ?? draftNoteId;
  deps.stdout.write(`✓ Черновик #${id} обновлён\n`);
  logger.info(`[updateDraft] [updating → updated] id=${id}`);
  deps.exit(0);
}
// #endregion END_UPDATE_DRAFT_NOTE

// #region START_DELETE_DRAFT_NOTE
/**
 * @purpose Delete an unpublished draft note.
 * @param context Resolved VCS context.
 * @param draftNoteId Target draft note identifier.
 * @param deps Injected dependencies.
 * @sideEffect Network: DELETE draft_notes/:id; Console: deletion confirmation.
 */
async function deleteDraft(
  context: VcsCliContext,
  draftNoteId: string | number,
  deps: VcsDraftDeps
): Promise<void> {
  const client: VcsClient =
    context.provider === 'github'
      ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
      : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });
  const iid = context.iid!;

  logger.info(
    `[deleteDraft] [idle → deleting] ${context.project}!${iid} draftNoteId=${draftNoteId}`
  );
  await client.MergeDiscussions!.deleteDraftNote({
    project: context.project,
    iid: String(iid),
    draftNoteId,
  });

  deps.stdout.write(`✓ Черновик #${draftNoteId} удалён\n`);
  logger.info(`[deleteDraft] [deleting → deleted] draftNoteId=${draftNoteId}`);
  deps.exit(0);
}
// #endregion END_DELETE_DRAFT_NOTE

// #region START_PUBLISH_DRAFT_NOTE
/**
 * @purpose Publish a draft note, turning it into a regular discussion note.
 * @param context Resolved VCS context.
 * @param draftNoteId Target draft note identifier.
 * @param deps Injected dependencies.
 * @sideEffect Network: PUT draft_notes/:id/publish; Console: publish confirmation.
 */
async function publishDraft(
  context: VcsCliContext,
  draftNoteId: string | number,
  deps: VcsDraftDeps
): Promise<void> {
  const client: VcsClient =
    context.provider === 'github'
      ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
      : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });
  const iid = context.iid!;

  logger.info(
    `[publishDraft] [idle → publishing] ${context.project}!${iid} draftNoteId=${draftNoteId}`
  );
  await client.MergeDiscussions!.publishDraftNote({
    project: context.project,
    iid: String(iid),
    draftNoteId,
  });

  deps.stdout.write(`✓ Черновик #${draftNoteId} опубликован\n`);
  logger.info(`[publishDraft] [publishing → published] draftNoteId=${draftNoteId}`);
  deps.exit(0);
}
// #endregion END_PUBLISH_DRAFT_NOTE

// #region START_COUNT_ACTIONS
/** @purpose Count how many action flags are set among the parsed args. */
function countActions(args: Record<string, unknown>): number {
  let count = 0;
  if (args.list) count++;
  if (args.create !== undefined) count++;
  if (args.update !== undefined) count++;
  if (args.delete !== undefined) count++;
  if (args.publish !== undefined) count++;
  return count;
}
// #endregion END_COUNT_ACTIONS

/**
 * @purpose Execute vcs-draft-note command: resolve context, dispatch to the selected draft-note action.
 * @invariant Exactly one action flag must be supplied; iid must be resolved from ref or explicit args.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: GitLab draft notes API calls.
 * @sideEffect Console: status and error messages to stdout/stderr.
 * @consumers CLI (gennady)
 */
export async function run(
  rawArgs: string[],
  deps: VcsDraftDeps = resolveDefaultDeps()
): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    project: { aliases: ['project'], takesValue: true },
    iid: { aliases: ['iid'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    create: { aliases: ['create'], takesValue: true },
    update: { aliases: ['update'], takesValue: true },
    delete: { aliases: ['delete'], takesValue: true },
    publish: { aliases: ['publish'], takesValue: true },
    body: { aliases: ['body'], takesValue: true },
    list: ['list'],
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const actionCount = countActions(args);
  if (actionCount === 0) {
    deps.stderr.write(
      '✖ Ошибка: укажите одно действие: --list, --create, --update, --delete или --publish\n'
    );
    deps.exit(1);
  }
  if (actionCount > 1) {
    deps.stderr.write('✖ Ошибка: можно указать только одно действие\n');
    deps.exit(1);
  }

  // #region START_PARSE_ACTION_ARGS
  const listAction = !!args.list;
  const createBody = args.create as string | undefined;
  const updateId = args.update as string | undefined;
  const deleteId = args.delete as string | undefined;
  const publishId = args.publish as string | undefined;
  const body = args.body as string | undefined;
  const dryRun = !!args['dry-run'];

  if (updateId !== undefined && !body) {
    deps.stderr.write('✖ Ошибка: --update требует --body <текст>\n');
    deps.exit(1);
  }
  // #endregion END_PARSE_ACTION_ARGS

  const vcsArgs: VcsCliArgs = {
    ref: args.ref as string | undefined,
    project: args.project as string | undefined,
    iid: args.iid !== undefined ? Number(args.iid) : undefined,
    host: args.host as string | undefined,
  };

  logger.debug(
    `[run] [parsing → parsed] list=${listAction} create=${!!createBody} update=${updateId ?? ''} delete=${deleteId ?? ''} publish=${publishId ?? ''} dryRun=${dryRun} ref=${vcsArgs.ref ?? ''}`
  );

  const context = await resolveContextOrFail(vcsArgs, deps);

  if (context.iid === undefined && context.branch) {
    const client: VcsClient =
      context.provider === 'github'
        ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
        : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });
    const mr = (await client.MergeRequests.getOne({
      project: context.project,
      sourceBranch: context.branch,
      state: 'opened',
    })) as { iid?: number } | null;
    if (mr?.iid) {
      context.iid = mr.iid;
    }
  }

  if (context.iid === undefined) {
    deps.stderr.write(
      '✖ Ошибка: не удалось определить MR iid — укажите --ref или --project и --iid\n'
    );
    deps.exit(1);
  }

  if (dryRun) {
    const action = listAction
      ? 'list'
      : createBody !== undefined
        ? `create "${createBody}"`
        : updateId !== undefined
          ? `update #${updateId}`
          : deleteId !== undefined
            ? `delete #${deleteId}`
            : `publish #${publishId}`;
    deps.stdout.write(
      `[DRY-RUN] Would ${action} on ${context.project}!${context.iid} host=${context.host}\n`
    );
    logger.info(`[run] [ready → dry-run-complete] ${context.project}!${context.iid}`);
    deps.exit(0);
  }

  try {
    if (listAction) {
      await listDrafts(context, deps);
    } else if (createBody !== undefined) {
      await createDraft(context, createBody, deps);
    } else if (updateId !== undefined) {
      await updateDraft(context, updateId, body!, deps);
    } else if (deleteId !== undefined) {
      await deleteDraft(context, deleteId, deps);
    } else if (publishId !== undefined) {
      await publishDraft(context, publishId, deps);
    }
  } catch (cause) {
    const msg = (cause as Error).message ?? 'неизвестная ошибка';
    const error = new Error(
      `[run] Draft note action failed for ${context.project}!${context.iid}`,
      { cause }
    );
    logger.error(`[run] [executing → failed]`, { error });
    deps.stderr.write(`✖ Ошибка: ${msg}\n`);
    deps.exit(1);
  }
}
