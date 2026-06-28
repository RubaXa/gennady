#!/usr/bin/env node
// @file: vcs-pipeline CLI command — show MR pipeline status and failed jobs via getPipeline.
// @consumers: vcs-pipeline
// @tasks: TSK-83

import { resolveVcsContext, VcsResolveError } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs, VcsCliContext } from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import type { VcsPipelineStatus } from '../../../services/vcs-client/entities/vcs-pipeline-status.type.ts';
import type { VcsMergeRequestsQuery } from '../../../services/vcs-client/abstract/vcs-client-merge-requests.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';
import { filterLog } from '../_shared/log-filter.ts';

/** @purpose Injectable dependencies for the vcs-pipeline command — defaults to real implementations. */
export type VcsPipelineDeps = {
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
function resolveDefaultDeps(): VcsPipelineDeps {
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
 * @returns Resolved VCS context (never returns on failure).
 */
async function resolveContextOrFail(
  vcsArgs: VcsCliArgs,
  deps: VcsPipelineDeps
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

// #region START_LOCATE_MR_BY_BRANCH
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
  host: string
): Promise<{ iid: number } | null> {
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
  logger.info(`[locateMrByBranch] [querying → found] iid=${iid}`);
  return { iid };
}
// #endregion END_LOCATE_MR_BY_BRANCH

// #region START_FETCH_PIPELINE
/**
 * @purpose Fetch MR pipeline status and jobs via getPipeline API.
 * @param context Resolved VCS context.
 * @param iid MR internal ID.
 * @returns Pipeline with status and job list.
 * @throws Propagates network/API errors from the GitLab client.
 */
async function fetchPipeline(context: VcsCliContext, iid: number): Promise<VcsPipelineStatus> {
  const client = new VcsGitlabClient({
    baseUrl: `https://${context.host}/api/v4`,
    token: context.token,
  });

  logger.info(`[fetchPipeline] [idle → fetching] ${context.project}!${iid}`);
  const pipeline = await client.MergeRequests.getPipeline({
    project: context.project,
    iid,
  });
  logger.info(
    `[fetchPipeline] [fetching → fetched] status=${pipeline.status || 'none'} jobs=${pipeline.jobs.length}`
  );

  return pipeline;
}
// #endregion END_FETCH_PIPELINE

// #region START_OUTPUT_PIPELINE
/** @purpose Filter jobs by status: 'failed' = not success, otherwise exact match. */
function filterJobs(pipeline: VcsPipelineStatus, statusFilter?: string) {
  if (!statusFilter || statusFilter === 'all') return pipeline.jobs;
  if (statusFilter === 'failed')
    return pipeline.jobs.filter((j) => j.status.toLowerCase() !== 'success');
  return pipeline.jobs.filter((j) => j.status.toLowerCase() === statusFilter.toLowerCase());
}

/** @purpose Extract numeric REST job ID from GraphQL global ID. */
function extractJobId(gid: string): string {
  const m = gid.match(/(\d+)$/);
  return m ? m[1] : gid;
}

/** @purpose Format pipeline as JSON for machine consumption. */
function outputJson(
  pipeline: VcsPipelineStatus,
  jobs: typeof pipeline.jobs,
  deps: VcsPipelineDeps
): void {
  deps.stdout.write(
    JSON.stringify(
      {
        status: pipeline.status,
        jobs: jobs.map((j) => ({ name: j.name, status: j.status, id: extractJobId(j.id) })),
      },
      null,
      2
    )
  );
  deps.stdout.write('\n');
}

/** @purpose Format pipeline as human-readable text with ✓/✖ status icons. */
function outputText(
  pipeline: VcsPipelineStatus,
  jobs: typeof pipeline.jobs,
  deps: VcsPipelineDeps
): void {
  deps.stdout.write(`Pipeline status: ${pipeline.status || 'none'}\n`);
  if (jobs.length === 0) {
    deps.stdout.write('No matching jobs.\n');
  } else {
    for (const job of jobs)
      deps.stdout.write(`  ${job.status === 'success' ? '✓' : '✖'} ${job.name} (${job.status})\n`);
  }
}

// #endregion END_OUTPUT_PIPELINE

/**
 * @purpose Execute vcs-pipeline command: resolve context, fetch pipeline, print status + failed jobs.
 * @invariant --dry-run prints intent without API calls.
 * @invariant Empty pipeline status is treated as no pipeline.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: GitLab API calls via VCS client.
 * @sideEffect Console: pipeline status and failed jobs to stdout.
 * @consumers CLI (gennady)
 */
export async function run(
  rawArgs: string[],
  deps: VcsPipelineDeps = resolveDefaultDeps()
): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    status: { aliases: ['status'], takesValue: true },
    'dry-run': ['dry-run', 'dry'],
    json: ['json'],
    logs: ['logs'],
    all: ['all'],
  }) as Record<string, unknown>;

  const vcsArgs: VcsCliArgs = {
    ref: args.ref as string | undefined,
    host: args.host as string | undefined,
  };

  const dryRun = !!args['dry-run'];
  const jsonMode = !!args['json'];
  const logsMode = !!args['logs'];
  const allMode = !!args['all'];
  const statusFilter = allMode ? 'all' : ((args.status as string | undefined) || 'failed');

  logger.debug(
    `[run] [parsing → parsed] dryRun=${dryRun} ref=${vcsArgs.ref ?? ''} host=${vcsArgs.host ?? ''}`
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
        context.host
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
    deps.stdout.write(`Would fetch pipeline for: ${context.project}!${iid}\n`);
    deps.stdout.write('[DRY-RUN] no request sent\n');
    logger.info(`[run] [ready → dry-run-complete] ${context.project}!${iid}`);
    deps.exit(0);
  }
  // #endregion END_DRY_RUN

  // #region START_FETCH_AND_OUTPUT
  try {
    const pipeline = await fetchPipeline(context, iid);

    if (!pipeline.status) {
      deps.stdout.write(`No pipeline found for this MR\n`);
      logger.info(`[run] [output → no-pipeline] ${context.project}!${iid}`);
      deps.exit(0);
    }

    const jobs = filterJobs(pipeline, statusFilter);

    if (logsMode && jobs.length > 0) {
      deps.stdout.write(`Pipeline status: ${pipeline.status}\n\n`);
      const client = new VcsGitlabClient({
        baseUrl: `https://${context.host}/api/v4`,
        token: context.token,
      });
      for (const job of jobs) {
        const failed = job.status.toLowerCase() !== 'success';
        deps.stdout.write(`${failed ? '✖' : '✓'} ${job.name} (${job.status})\n`);
        if (failed) {
          try {
            const trace = await client.Pipeline!.getJobLog({
              project: context.project,
              jobId: extractJobId(job.id),
            });
            deps.stdout.write(`${filterLog(trace)}\n`);
          } catch (e) {
            deps.stdout.write(`  [log unavailable: ${(e as Error).message}]\n`);
          }
        }
      }
      deps.exit(0);
    }

    if (jsonMode) {
      outputJson(pipeline, jobs, deps);
    } else {
      outputText(pipeline, jobs, deps);
    }
    logger.info(`[run] [output → complete] status=${pipeline.status}`);
    deps.exit(0);
  } catch (cause) {
    const error = new Error(`[run] Fetch failed for ${context.project}!${iid}`, { cause });
    logger.error(`[run] [fetching → failed]`, { error });
    deps.stderr.write(`✖ GitLab API error: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`);
    deps.exit(1);
  }
  // #endregion END_FETCH_AND_OUTPUT
}
