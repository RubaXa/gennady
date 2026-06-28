#!/usr/bin/env node
// @file: vcs-job CLI command — inspect and control pipeline jobs (status, play, cancel, retry).
// @consumers: vcs-job
// @tasks: TSK-85

import { resolveVcsContext, VcsResolveError } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs, VcsCliContext } from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { VcsPipelineStatus } from '../../../services/vcs-client/entities/vcs-pipeline-status.type.ts';
import type { VcsJob } from '../../../services/vcs-client/entities/vcs-job.type.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';

/** @purpose Allowed job actions. */
export type JobAction = 'status' | 'play' | 'cancel';

/** @purpose Injectable dependencies for the vcs-job command. */
export type VcsJobDeps = {
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

/** @purpose Default DI — real process bindings. */
function resolveDefaultDeps(): VcsJobDeps {
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
 * @param vcsArgs Parsed CLI arguments for the resolver.
 * @param deps Injected dependencies.
 * @returns Resolved VCS context.
 */
async function resolveContextOrFail(vcsArgs: VcsCliArgs, deps: VcsJobDeps): Promise<VcsCliContext> {
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

// #region START_RESOLVE_JOB_ID
/**
 * @purpose Resolve a job name or id to a concrete job id via pipeline jobs list.
 * @param pipeline Pipeline with jobs for name→id resolution.
 * @param jobSpec User-provided job name or id.
 * @returns Resolved job id string.
 * @throws {Error} When job is not found in the pipeline.
 */
function resolveJobId(pipeline: VcsPipelineStatus, jobSpec: string): string {
  const extractId = (gid: string) => {
    const m = gid.match(/(\d+)$/);
    return m ? m[1] : gid;
  };
  const byId = pipeline.jobs.find((j) => extractId(j.id) === jobSpec);
  if (byId) return extractId(byId.id);

  const byName = pipeline.jobs.find((j) => j.name === jobSpec);
  if (byName) return extractId(byName.id);

  throw new Error(`[resolveJobId] Job not found: ${jobSpec}`);
}
// #endregion END_RESOLVE_JOB_ID

// #region START_OUTPUT_JOB_STATUS
/**
 * @purpose Format and write job details to stdout.
 * @param job Job data from the API.
 * @param deps Injected dependencies.
 */
function outputJobStatus(job: VcsJob, deps: VcsJobDeps): void {
  deps.stdout.write(`Job: ${job.name}\n`);
  deps.stdout.write(`  Status: ${job.status}\n`);
  deps.stdout.write(`  Stage:  ${job.stage}\n`);
  deps.stdout.write(`  Ref:    ${job.ref}\n`);
  deps.stdout.write(`  URL:    ${job.webUrl}\n`);
}
// #endregion END_OUTPUT_JOB_STATUS

// #region START_NORMALIZE_ACTION
/**
 * @purpose Normalize user-provided action, mapping retry → play alias.
 * @param raw Raw action string from CLI.
 * @returns Normalized JobAction.
 */
function normalizeAction(raw: string): JobAction {
  const action = raw.trim().toLowerCase();
  if (action === 'retry') return 'play';
  return action as JobAction;
}
// #endregion END_NORMALIZE_ACTION

/**
 * @purpose Execute vcs-job command: resolve context, look up job by name/id, perform action.
 * @invariant --dry-run prints intent without API calls.
 * @invariant retry is an alias for play (same GitLab endpoint).
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies.
 * @returns Promise resolving after process termination.
 * @sideEffect Network: GitLab API calls via VCS client.
 * @sideEffect Console: job details to stdout.
 * @consumers CLI (gennady)
 */
export async function run(
  rawArgs: string[],
  deps: VcsJobDeps = resolveDefaultDeps()
): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    job: { aliases: ['job'], takesValue: true },
    action: { aliases: ['action'], takesValue: true },
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const vcsArgs: VcsCliArgs = {
    ref: args.ref as string | undefined,
    host: args.host as string | undefined,
  };

  const jobSpec = args.job as string | undefined;
  const actionRaw = (args.action as string) || 'status';
  const dryRun = !!args['dry-run'];

  if (!jobSpec) {
    deps.stderr.write('✖ Ошибка: --job <name|id> обязателен\n');
    deps.exit(1);
  }

  const action = normalizeAction(actionRaw);

  logger.debug(
    `[run] [parsing → parsed] job=${jobSpec} action=${action} dryRun=${dryRun} ref=${vcsArgs.ref ?? ''} host=${vcsArgs.host ?? ''}`
  );

  const context = await resolveContextOrFail(vcsArgs, deps);

  // #region START_DETERMINE_IID
  let iid: number;

  if (context.iid !== undefined) {
    iid = context.iid;
    logger.debug(`[run] [determining-iid → explicit] iid=${iid}`);
  } else {
    deps.stderr.write('✖ Ошибка: vcs-job требует явный MR ref (--ref group/repo!iid)\n');
    deps.exit(1);
  }
  // #endregion END_DETERMINE_IID

  // #region START_DRY_RUN
  if (dryRun) {
    deps.stdout.write(`Would ${action} job "${jobSpec}" for: ${context.project}!${iid}\n`);
    deps.stdout.write('[DRY-RUN] no request sent\n');
    logger.info(`[run] [ready → dry-run-complete] ${context.project}!${iid} job=${jobSpec}`);
    deps.exit(0);
  }
  // #endregion END_DRY_RUN

  const client: VcsClient =
    context.provider === 'github'
      ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
      : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });

  if (!client.Pipeline) {
    deps.stderr.write('✖ Ошибка: Pipeline API не поддерживается данным VCS-клиентом\n');
    deps.exit(1);
  }

  // #region START_FETCH_AND_ACT
  try {
    logger.debug(`[run] [resolved → fetching-pipeline] ${context.project}!${iid}`);

    const pipeline = await client.MergeRequests.getPipeline({
      project: context.project,
      iid,
    });

    logger.info(
      `[run] [fetching-pipeline → fetched] status=${pipeline.status || 'none'} jobs=${pipeline.jobs.length}`
    );

    const jobId = resolveJobId(pipeline, jobSpec);
    logger.debug(`[run] [resolving-job → resolved] spec=${jobSpec} id=${jobId}`);

    let job: VcsJob;

    if (action === 'play') {
      logger.debug(`[run] [idle → playing] ${jobId}`);
      job = await client.Pipeline.playJob({ project: context.project, jobId });
      logger.info(`[run] [playing → played] ${jobId} status=${job.status}`);
    } else if (action === 'cancel') {
      logger.debug(`[run] [idle → cancelling] ${jobId}`);
      job = await client.Pipeline.cancelJob({ project: context.project, jobId });
      logger.info(`[run] [cancelling → cancelled] ${jobId} status=${job.status}`);
    } else {
      logger.debug(`[run] [idle → fetching-job] ${jobId}`);
      job = await client.Pipeline.getJob({ project: context.project, jobId });
      logger.info(`[run] [fetching-job → fetched] ${jobId} status=${job.status}`);
    }

    outputJobStatus(job, deps);
    logger.info(`[run] [output → complete] job=${job.name} status=${job.status}`);
    deps.exit(0);
  } catch (cause) {
    const error = new Error(
      `[run] Operation failed for ${context.project}!${iid} job=${jobSpec} action=${action}`,
      { cause }
    );
    logger.error(`[run] [acting → failed]`, { error });
    deps.stderr.write(`✖ GitLab API error: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`);
    deps.exit(1);
  }
  // #endregion END_FETCH_AND_ACT
}
