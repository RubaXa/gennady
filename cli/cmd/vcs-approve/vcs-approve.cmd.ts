#!/usr/bin/env node
// @file: Approve a GitLab merge request via CLI — resolve context, locate MR, call approve API.
// @consumers: vcs-approve
// @tasks: TSK-69

import {
  resolveVcsContext,
  VcsResolveError,
  type VcsCliArgs,
  type VcsCliContext,
} from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsApproveError } from '../../../services/vcs-client/gitlab/vcs-gitlab-merge-requests.ts';
import type { VcsMergeRequestApproveQuery } from '../../../services/vcs-client/entities/vcs-merge-request-approve-query.type.ts';
import type { VcsMergeRequestsQuery } from '../../../services/vcs-client/abstract/vcs-client-merge-requests.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';

/** @purpose Injectable dependencies for the vcs-approve command — defaults to real implementations. */
export type VcsApproveDeps = {
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
function resolveDefaultDeps(): VcsApproveDeps {
  return {
    resolveVcsContext,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
  };
}

// #region START_EXTRACT_GITLAB_ERROR_DETAIL
/**
 * @purpose Extract HTTP status code from a GitLab client error message.
 * @invariant Message format: "GitLab request failed: <status> <statusText> <body>"
 * @param message Raw error message.
 * @returns Status code string or '???' when unparseable.
 */
function extractGitlabStatus(message: string): string {
  const match = message.match(/^GitLab request failed:\s*(\d+)/);
  return match?.[1] ?? '???';
}

/**
 * @purpose Extract human-readable error body from a GitLab client error message.
 * @param message Raw error message.
 * @returns Error body text without status prefix.
 */
function extractGitlabBody(message: string): string {
  const stripped = message.replace(/^GitLab request failed:\s*\d+\s*\w*\s*/, '');
  return stripped || message;
}
// #endregion END_EXTRACT_GITLAB_ERROR_DETAIL

// #region START_HANDLE_APPROVE_ERROR
/**
 * @purpose Translate a VcsApproveError into user-facing output and exit.
 * @param error Domain approve error with known code.
 * @param iid MR internal ID for message formatting.
 * @param deps Injected dependencies for output and exit.
 * @sideEffect Console: writes info or error messages to stdout/stderr; exits process.
 */
function handleApproveError(error: VcsApproveError, iid: number, deps: VcsApproveDeps): never {
  switch (error.code) {
    case 'ALREADY_APPROVED':
      logger.info(`[handleApproveError] idempotent: MR !${iid} already approved`);
      deps.stdout.write(`ℹ MR !${iid} already approved\n`);
      deps.exit(0);
    case 'SELF_APPROVE_FORBIDDEN':
      logger.info(`[handleApproveError] SELF_APPROVE_FORBIDDEN for MR !${iid}`);
      deps.stderr.write(`✖ GitLab API error [403]: Self-approval is not permitted\n`);
      deps.exit(1);
    case 'CANNOT_APPROVE': {
      const body = extractGitlabBody(error.message);
      logger.info(`[handleApproveError] CANNOT_APPROVE for MR !${iid}: ${body}`);
      deps.stderr.write(`✖ GitLab API error [409]: ${body}\n`);
      deps.exit(1);
    }
    default: {
      const status = extractGitlabStatus(error.message);
      const body = extractGitlabBody(error.message);
      logger.warn(`[handleApproveError] unexpected code '${error.code as string}' for MR !${iid}`);
      deps.stderr.write(`✖ GitLab API error [${status}]: ${body}\n`);
      deps.exit(1);
    }
  }
}
// #endregion END_HANDLE_APPROVE_ERROR

// #region START_RESOLVE_CONTEXT_OR_FAIL
/**
 * @purpose Resolve VCS context from CLI args; on failure — write error to stderr and exit.
 * @param vcsArgs Parsed CLI arguments for the resolver.
 * @param deps Injected dependencies.
 * @returns Resolved VCS context (never returns on failure).
 */
async function resolveContextOrFail(
  vcsArgs: VcsCliArgs,
  deps: VcsApproveDeps
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
 * @throws Propagates network/API errors from the GitLab client.
 * @returns MR record with at least iid and web_url, or null when no MR is found.
 */
async function locateMrByBranch(
  project: string,
  branch: string | undefined,
  token: string,
  host: string
): Promise<{ iid: number; webUrl: string } | null> {
  const client = new VcsGitlabClient({
    baseUrl: `https://${host}/api/v4`,
    token,
  });

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
  const webUrl = (mrRecord.web_url as string) ?? '';
  logger.info(`[locateMrByBranch] [querying → found] iid=${iid} ${webUrl}`);
  return { iid, webUrl };
}
// #endregion END_LOCATE_MR_AUTO_DETECT

// #region START_CALL_APPROVE_API
/**
 * @purpose Send approve request to GitLab and write success message to stdout.
 * @param context Resolved VCS context.
 * @param iid MR internal ID.
 * @param webUrl Optional MR web URL — computed from host/project/iid when absent.
 * @param deps Injected dependencies.
 * @sideEffect Network: POST /projects/:id/merge_requests/:iid/approve; Console: success message.
 */
async function approveMr(
  context: VcsCliContext,
  iid: number,
  webUrl: string | undefined,
  deps: VcsApproveDeps
): Promise<void> {
  const client = new VcsGitlabClient({
    baseUrl: `https://${context.host}/api/v4`,
    token: context.token,
  });

  const query: VcsMergeRequestApproveQuery = {
    repository: context.project,
    iid,
  };

  logger.info(`[approveMr] [idle → approving] ${context.project}!${iid}`);
  await client.MergeRequests.approve(query);
  logger.info(`[approveMr] [approving → approved] ${context.project}!${iid}`);

  const url = webUrl || `https://${context.host}/${context.project}/-/merge_requests/${iid}`;
  deps.stdout.write(`✓ MR !${iid} approved: ${url}\n`);
}
// #endregion END_CALL_APPROVE_API

/**
 * @purpose Execute vcs-approve command: resolve context, locate MR, send approve or dry-run.
 * @invariant Idempotent: already-approved MR yields info message and exit 0.
 * @invariant --dry-run prints without API call.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: GitLab API calls via VCS client.
 * @sideEffect Console: status and error messages to stdout/stderr.
 * @consumers CLI (gennady)
 */
export async function run(
  rawArgs: string[],
  deps: VcsApproveDeps = resolveDefaultDeps()
): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    project: { aliases: ['project'], takesValue: true },
    iid: { aliases: ['iid'], takesValue: true },
    branch: { aliases: ['branch'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const vcsArgs: VcsCliArgs = {
    ref: args.ref as string | undefined,
    project: args.project as string | undefined,
    iid: args.iid !== undefined ? Number(args.iid) : undefined,
    branch: args.branch as string | undefined,
    host: args.host as string | undefined,
  };

  const dryRun = !!args['dry-run'];
  logger.debug(
    `[run] [parsing → parsed] dryRun=${dryRun} ref=${vcsArgs.ref ?? ''} project=${vcsArgs.project ?? ''} iid=${vcsArgs.iid ?? ''}`
  );

  const context = await resolveContextOrFail(vcsArgs, deps);

  // #region START_DETERMINE_IID
  let iid: number;
  let webUrl: string | undefined;

  if (context.iid !== undefined) {
    iid = context.iid;
    logger.debug(`[run] [determining-iid → explicit] iid=${iid}`);
  } else {
    try {
      const mr = await locateMrByBranch(
        context.project,
        context.branch,
        context.token,
        context.host
      );

      if (!mr) {
        deps.stdout.write(
          `ℹ Merge Request не найден для ветки: ${context.branch ?? '(не определена)'}\n`
        );
        deps.exit(0);
      }

      iid = mr.iid;
      webUrl = mr.webUrl || undefined;
    } catch (cause) {
      const error = new Error('[run] MR lookup failed', { cause });
      logger.error(`[run] [determining-iid → failed]`, { error });
      const msg = (cause as Error).message ?? 'неизвестная ошибка';
      const status = extractGitlabStatus(msg);
      const body = extractGitlabBody(msg);
      deps.stderr.write(`✖ GitLab API error [${status}]: ${body}\n`);
      deps.exit(1);
    }
  }
  // #endregion END_DETERMINE_IID

  // #region START_DRY_RUN_OR_APPROVE
  if (dryRun) {
    deps.stdout.write(`Would approve: ${context.project}!${iid}  host=${context.host}\n`);
    deps.stdout.write('[DRY-RUN] no request sent\n');
    logger.info(`[run] [ready → dry-run-complete] ${context.project}!${iid}`);
    deps.exit(0);
  }

  try {
    await approveMr(context, iid, webUrl, deps);
    deps.exit(0);
  } catch (cause) {
    if (cause instanceof VcsApproveError) {
      handleApproveError(cause, iid, deps);
    }

    const msg = (cause as Error).message ?? 'неизвестная ошибка';
    const status = extractGitlabStatus(msg);
    const body = extractGitlabBody(msg);
    const error = new Error(`[run] Approve failed for ${context.project}!${iid}`, { cause });
    logger.error(`[run] [approving → failed]`, { error });
    deps.stderr.write(`✖ GitLab API error [${status}]: ${body}\n`);
    deps.exit(1);
  }
  // #endregion END_DRY_RUN_OR_APPROVE
}
