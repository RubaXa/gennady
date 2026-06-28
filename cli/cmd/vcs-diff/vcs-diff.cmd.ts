#!/usr/bin/env node
// @file: vcs-diff CLI command — list changed files in MR via getChanges; show file content via getFileContent.
// @consumers: vcs-diff
// @tasks: TSK-81

import { resolveVcsContext, VcsResolveError } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs, VcsCliContext } from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { VcsMergeRequestChanges } from '../../../services/vcs-client/entities/vcs-merge-request-changes.type.ts';
import type { VcsMergeRequestsQuery } from '../../../services/vcs-client/abstract/vcs-client-merge-requests.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';

/** @purpose Injectable dependencies for the vcs-diff command — defaults to real implementations. */
export type VcsDiffDeps = {
  /** @purpose VCS context resolution function */
  resolveVcsContext: typeof resolveVcsContext;
  /** @purpose Standard output stream — user-facing messages */
  stdout: NodeJS.WriteStream;
  /** @purpose Standard error stream — error messages */
  stderr: NodeJS.WriteStream;
  /**
   * @purpose Terminate the process with a given exit code — never returns.
   * @param code Exit code (0 = success, non-zero = failure).
   * @returns Never; function terminates the process.
   */
  exit: (code: number) => never;
};

/** @purpose Default DI — real process bindings. @returns Fresh deps wired to process. */
function resolveDefaultDeps(): VcsDiffDeps {
  return {
    resolveVcsContext,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
  };
}

// #region START_FORMAT_CHANGE_LINE
/**
 * @purpose Format a single changed file entry for stdout output.
 * @param change MR change record with path, status, additions, deletions.
 * @returns Formatted line: "path (status) +adds/-dels".
 */
function formatChangeLine(change: VcsMergeRequestChanges): string {
  const adds = change.additions ?? 0;
  const dels = change.deletions ?? 0;
  return `${change.path} (${change.status}) +${adds}/-${dels}`;
}
// #endregion END_FORMAT_CHANGE_LINE

// #region START_RESOLVE_CONTEXT_OR_FAIL
/**
 * @purpose Resolve VCS context from CLI args; on failure — write error to stderr and exit.
 * @param vcsArgs Parsed CLI arguments for the resolver.
 * @param deps Injected dependencies.
 * @returns Resolved VCS context (never returns on failure).
 */
async function resolveContextOrFail(
  vcsArgs: VcsCliArgs,
  deps: VcsDiffDeps
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

// #region START_LOCATE_MR_AUTO_DETECT
/**
 * @purpose Locate an open MR by source branch via GitLab API.
 * @param project Project path (group/repo).
 * @param branch Source branch name.
 * @param token GitLab access token.
 * @param host GitLab host.
 * @returns MR record with at least iid, or null when no MR found.
 * @throws Propagates network/API errors from the GitLab client.
 */
async function locateMrByBranch(
  project: string,
  branch: string | undefined,
  token: string,
  host: string,
  provider: 'gitlab' | 'github'
): Promise<{ iid: number } | null> {
  const client: VcsClient = provider === 'github'
    ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token })
    : new VcsGitlabClient({ baseUrl: `https://${host}/api/v4`, token });

  const query: VcsMergeRequestsQuery = {
    project,
    sourceBranch: branch,
    state: 'opened',
  };

  logger.debug(`[locateMrByBranch] [idle → querying] ${project} branch=${branch}`);
  const mr = await client.MergeRequests.getOne(query);

  if (!mr) {
    logger.info(`[locateMrByBranch] [querying → not-found] ${project} branch=${branch}`);
    return null;
  }

  const mrRecord = mr as Record<string, unknown>;
  const iid = mrRecord.iid as number;
  logger.info(`[locateMrByBranch] [querying → found] iid=${iid}`);
  return { iid };
}
// #endregion END_LOCATE_MR_AUTO_DETECT

// #region START_FETCH_CHANGES
/**
 * @purpose Fetch MR changes via getChanges API.
 * @param context Resolved VCS context.
 * @param iid MR internal ID.
 * @returns List of changed files with metadata.
 * @throws Propagates network/API errors from the GitLab client.
 */
async function fetchChanges(
  context: VcsCliContext,
  iid: number
): Promise<VcsMergeRequestChanges[]> {
  const client: VcsClient = context.provider === 'github'
    ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
    : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });

  logger.info(`[fetchChanges] [idle → fetching] ${context.project}!${iid}`);
  const changes = await client.MergeRequests.getChanges({
    repository: context.project,
    iid,
  });
  logger.info(`[fetchChanges] [fetching → fetched] ${changes.length} files`);

  return changes;
}
// #endregion END_FETCH_CHANGES

// #region START_FETCH_FILE_CONTENT
/**
 * @purpose Fetch file content from MR head branch via getFileContent API.
 * @param context Resolved VCS context.
 * @param path File path in repository.
 * @param ref Branch or commit ref for the file.
 * @returns File content record or null when not found.
 * @throws Propagates network/API errors from the GitLab client.
 */
async function fetchFileContent(
  context: VcsCliContext,
  path: string,
  ref: string
): Promise<string | null> {
  const client: VcsClient = context.provider === 'github'
    ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
    : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });

  logger.debug(`[fetchFileContent] [idle → fetching] ${context.project} path=${path} ref=${ref}`);
  const result = await client.RepositoryFiles!.getFileContent({
    repository: context.project,
    path,
    ref,
  });

  if (!result) {
    logger.info(`[fetchFileContent] [fetching → not-found] ${path}`);
    return null;
  }

  logger.info(`[fetchFileContent] [fetching → fetched] ${path} (${result.content.length} bytes)`);
  return result.content;
}
// #endregion END_FETCH_FILE_CONTENT

/**
 * @purpose Execute vcs-diff command: resolve context, fetch MR changes, optionally show file content.
 * @invariant --dry-run prints intent without API calls.
 * @invariant --path filters changes and shows file content via getFileContent.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: GitLab API calls via VCS client.
 * @sideEffect Console: MR changes or file content to stdout.
 * @consumers CLI (gennady)
 */
export async function run(
  rawArgs: string[],
  deps: VcsDiffDeps = resolveDefaultDeps()
): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    path: { aliases: ['path'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const vcsArgs: VcsCliArgs = {
    ref: args.ref as string | undefined,
    host: args.host as string | undefined,
  };

  const filePath = args.path as string | undefined;
  const dryRun = !!args['dry-run'];

  logger.debug(
    `[run] [parsing → parsed] dryRun=${dryRun} ref=${vcsArgs.ref ?? ''} path=${filePath ?? ''} host=${vcsArgs.host ?? ''}`
  );

  const context = await resolveContextOrFail(vcsArgs, deps);

  // #region START_DETERMINE_IID
  let iid: number;

  if (context.iid !== undefined) {
    iid = context.iid;
    logger.debug(`[run] [determining-iid → explicit] iid=${iid}`);
  } else {
    try {
      const mr = await locateMrByBranch(
        context.project,
        context.branch,
        context.token,
        context.host,
        context.provider
      );

      if (!mr) {
        deps.stdout.write(
          `ℹ Merge Request не найден для ветки: ${context.branch ?? '(не определена)'}\n`
        );
        deps.exit(0);
      }

      iid = mr.iid;
    } catch (cause) {
      const error = new Error('[run] MR lookup failed', { cause });
      logger.error(`[run] [determining-iid → failed]`, { error });
      deps.stderr.write(
        `✖ GitLab API error: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`
      );
      deps.exit(1);
    }
  }
  // #endregion END_DETERMINE_IID

  // #region START_DRY_RUN
  if (dryRun) {
    deps.stdout.write(`Would fetch diff for: ${context.project}!${iid}\n`);
    deps.stdout.write('[DRY-RUN] no request sent\n');
    logger.info(`[run] [ready → dry-run-complete] ${context.project}!${iid}`);
    deps.exit(0);
  }
  // #endregion END_DRY_RUN

  // #region START_FETCH_AND_OUTPUT
  try {
    const changes = await fetchChanges(context, iid);

    // #region START_PATH_FILTER_AND_CONTENT
    if (filePath) {
      const match = changes.find((c) => c.path === filePath);
      if (!match) {
        deps.stdout.write(`ℹ Файл "${filePath}" не найден в изменениях MR !${iid}\n`);
        deps.exit(0);
      }

      const content = await fetchFileContent(context, match.path, match.ref);
      if (content === null) {
        deps.stdout.write(`ℹ Файл "${filePath}" не содержит контента\n`);
        deps.exit(0);
      }

      deps.stdout.write(content);
      deps.stdout.write('\n');
      deps.exit(0);
    }
    // #endregion END_PATH_FILTER_AND_CONTENT

    // #region START_OUTPUT_CHANGES_LIST
    for (const change of changes) {
      deps.stdout.write(formatChangeLine(change));
      deps.stdout.write('\n');
    }
    // #endregion END_OUTPUT_CHANGES_LIST

    logger.info(`[run] [output → complete] ${changes.length} files`);
    deps.exit(0);
  } catch (cause) {
    const error = new Error(`[run] Fetch failed for ${context.project}!${iid}`, { cause });
    logger.error(`[run] [fetching → failed]`, { error });
    deps.stderr.write(`✖ GitLab API error: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`);
    deps.exit(1);
  }
  // #endregion END_FETCH_AND_OUTPUT
}
