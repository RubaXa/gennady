#!/usr/bin/env node
// @file: vcs-job-log CLI command — print raw trace/log of a pipeline job.
// @consumers: vcs-job-log
// @tasks: TSK-85

import { resolveVcsContext, VcsResolveError } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs, VcsCliContext } from '../_shared/vcs-context-resolver.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import type { VcsPipelineStatus } from '../../../services/vcs-client/entities/vcs-pipeline-status.type.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';

/** @purpose Injectable dependencies for the vcs-job-log command. */
export type VcsJobLogDeps = {
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
function resolveDefaultDeps(): VcsJobLogDeps {
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
async function resolveContextOrFail(
  vcsArgs: VcsCliArgs,
  deps: VcsJobLogDeps
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

// #region START_RESOLVE_JOB_ID
/**
 * @purpose Resolve a job name or id to a concrete job id via pipeline jobs list.
 * @param pipeline Pipeline with jobs for name→id resolution.
 * @param jobSpec User-provided job name or id.
 * @returns Resolved job id string.
 * @throws {Error} When job is not found in the pipeline.
 */
function resolveJobId(pipeline: VcsPipelineStatus, jobSpec: string): string {
  const byId = pipeline.jobs.find((j) => j.id === jobSpec);
  if (byId) return byId.id;

  const byName = pipeline.jobs.find((j) => j.name === jobSpec);
  if (byName) return byName.id;

  throw new Error(`[resolveJobId] Job not found: ${jobSpec}`);
}
// #endregion END_RESOLVE_JOB_ID

/**
 * @purpose Execute vcs-job-log command: resolve context, look up job, print raw trace.
 * @invariant Prints raw trace stdout from the job runner — no formatting, no markup.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies.
 * @returns Promise resolving after process termination.
 * @sideEffect Network: GitLab API calls via VCS client.
 * @sideEffect Console: raw job trace to stdout.
 * @consumers CLI (gennady)
 */
export async function run(
  rawArgs: string[],
  deps: VcsJobLogDeps = resolveDefaultDeps()
): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    host: { aliases: ['host'], takesValue: true },
    job: { aliases: ['job'], takesValue: true },
  }) as Record<string, unknown>;

  const vcsArgs: VcsCliArgs = {
    ref: args.ref as string | undefined,
    host: args.host as string | undefined,
  };

  const jobSpec = args.job as string | undefined;

  if (!jobSpec) {
    deps.stderr.write('✖ Ошибка: --job <name|id> обязателен\n');
    deps.exit(1);
  }

  logger.debug(
    `[run] [parsing → parsed] job=${jobSpec} ref=${vcsArgs.ref ?? ''} host=${vcsArgs.host ?? ''}`
  );

  const context = await resolveContextOrFail(vcsArgs, deps);

  // #region START_DETERMINE_IID
  let iid: number;

  if (context.iid !== undefined) {
    iid = context.iid;
    logger.debug(`[run] [determining-iid → explicit] iid=${iid}`);
  } else {
    deps.stderr.write('✖ Ошибка: vcs-job-log требует явный MR ref (--ref group/repo!iid)\n');
    deps.exit(1);
  }
  // #endregion END_DETERMINE_IID

  const client = new VcsGitlabClient({
    baseUrl: `https://${context.host}/api/v4`,
    token: context.token,
  });

  if (!client.Pipeline) {
    deps.stderr.write('✖ Ошибка: Pipeline API не поддерживается данным VCS-клиентом\n');
    deps.exit(1);
  }

  // #region START_FETCH_AND_OUTPUT
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

    logger.debug(`[run] [idle → fetching-log] ${jobId}`);
    const trace = await client.Pipeline.getJobLog({ project: context.project, jobId });
    logger.info(`[run] [fetching-log → fetched] ${jobId} length=${trace.length}`);

    deps.stdout.write(trace);
    deps.exit(0);
  } catch (cause) {
    const error = new Error(`[run] Fetch failed for ${context.project}!${iid} job=${jobSpec}`, {
      cause,
    });
    logger.error(`[run] [fetching → failed]`, { error });
    deps.stderr.write(`✖ GitLab API error: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`);
    deps.exit(1);
  }
  // #endregion END_FETCH_AND_OUTPUT
}
