#!/usr/bin/env node
// @file: vcs-pipeline CLI command — MR/ref pipeline status, metadata, jobs, filtered logs; list and watch.
// @consumers: vcs-pipeline
// @tasks: TSK-83

import { resolveVcsContext, VcsResolveError } from '../_shared/vcs-context-resolver.ts';
import type { VcsCliArgs, VcsCliContext } from '../_shared/vcs-context-resolver.ts';
import { createVcsClient } from '../_shared/create-vcs-client.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { VcsPipelineStatus } from '../../../services/vcs-client/entities/vcs-pipeline-status.type.ts';
import type { VcsPipelineSummary } from '../../../services/vcs-client/entities/vcs-pipeline-summary.type.ts';
import type { VcsMergeRequestsQuery } from '../../../services/vcs-client/abstract/vcs-client-merge-requests.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';
import { filterLog } from '../_shared/log-filter.ts';

/** @purpose Pipeline statuses after which a watch loop stops polling. */
const TERMINAL_STATUSES = new Set([
  'success',
  'failed',
  'canceled',
  'cancelled',
  'skipped',
  'manual',
]);

/** @purpose Terminal statuses that make the command exit non-zero. */
const FAILURE_STATUSES = new Set(['failed', 'canceled', 'cancelled']);

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
  /**
   * @purpose Sleep helper used by watch mode.
   * @param ms Milliseconds to wait.
   * @returns Promise resolving after the delay.
   */
  sleep?: (ms: number) => Promise<void>;
};

/** @purpose Default DI — real process bindings. @returns Fresh deps wired to process. */
function resolveDefaultDeps(): VcsPipelineDeps {
  return {
    resolveVcsContext,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  };
}

/** @purpose Resolved options controlling a single run of the command. */
type RunOptions = {
  /** @purpose Watch (poll) until the pipeline reaches a terminal status */
  watch: boolean;
  /** @purpose List recent pipelines instead of inspecting one */
  list: boolean;
  /** @purpose Machine-readable JSON output */
  json: boolean;
  /** @purpose Inline filtered logs of failed jobs */
  logs: boolean;
  /** @purpose Show all jobs instead of the default non-success view */
  all: boolean;
  /** @purpose Print intent only, without API calls */
  dryRun: boolean;
  /** @purpose Explicit job-status filter */
  statusFilter?: string;
  /** @purpose Restrict to one failing block by substring */
  test?: string;
  /** @purpose Branch/tag used for ref-mode pipeline lookup */
  branch?: string;
  /** @purpose Commit SHA used for ref-mode pipeline lookup */
  sha?: string;
  /** @purpose Max pipelines for list mode */
  limit: number;
  /** @purpose Watch poll interval in seconds */
  intervalSec: number;
  /** @purpose Watch timeout in seconds */
  timeoutSec: number;
};

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
 * @param provider VCS provider identifier.
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
  const client: VcsClient =
    provider === 'github'
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
// #endregion END_LOCATE_MR_BY_BRANCH

// #region START_FETCH_PIPELINE
/**
 * @purpose Fetch an MR pipeline status, metadata and jobs via headPipeline API.
 * @param context Resolved VCS context.
 * @param iid MR internal ID.
 * @returns Pipeline with status, metadata and job list.
 * @throws Propagates network/API errors from the GitLab client.
 */
async function fetchMergeRequestPipeline(
  context: VcsCliContext,
  iid: number
): Promise<VcsPipelineStatus> {
  const client: VcsClient = createVcsClient(context);

  logger.info(`[fetchMergeRequestPipeline] [idle → fetching] ${context.project}!${iid}`);
  const pipeline = await client.MergeRequests.getPipeline({
    project: context.project,
    iid,
  });
  logger.info(
    `[fetchMergeRequestPipeline] [fetching → fetched] status=${pipeline.status || 'none'} jobs=${pipeline.jobs.length}`
  );

  return pipeline;
}
// #endregion END_FETCH_PIPELINE

// #region START_FETCH_REF_PIPELINE
/**
 * @purpose Fetch the newest pipeline of a ref/sha (no merge request) with its jobs.
 * @param client Authenticated VCS client exposing the Pipeline port.
 * @param context Resolved VCS context (project/host).
 * @param options Ref-mode selection options.
 * @returns Pipeline view shaped like an MR head pipeline (empty status when none found).
 * @throws Propagates network/API errors from the GitLab client.
 */
async function fetchRefPipeline(
  client: VcsClient,
  context: VcsCliContext,
  options: RunOptions
): Promise<VcsPipelineStatus> {
  const summaries = await client.Pipeline!.getPipelines({
    project: context.project,
    ...(options.branch ? { ref: options.branch } : {}),
    ...(options.sha ? { sha: options.sha } : {}),
    limit: 1,
  });

  const latest = summaries[0];
  if (!latest) return { status: '', jobs: [] };

  const jobs = await client.Pipeline!.getPipelineJobs({
    project: context.project,
    pipelineId: latest.iid,
  });

  return {
    status: latest.status,
    jobs,
    ...(latest.id ? { id: latest.id } : {}),
    ...(latest.iid ? { iid: latest.iid } : {}),
    ...(latest.sha ? { sha: latest.sha } : {}),
    ...(latest.ref ? { ref: latest.ref } : {}),
    ...(latest.title ? { commitTitle: latest.title } : {}),
    ...(latest.createdAt ? { createdAt: latest.createdAt } : {}),
    ...(latest.updatedAt ? { updatedAt: latest.updatedAt } : {}),
  };
}
// #endregion END_FETCH_REF_PIPELINE

// #region START_JOB_STATUS_ICON
/**
 * @purpose Map a job status to a truthful icon.
 * @invariant MANUAL/SKIPPED/CANCELED are not failures and must never render as ✖.
 * @param status Raw job status from the API (any case).
 * @returns Single-glyph status icon.
 */
function statusIcon(status: string): string {
  switch (status.toLowerCase()) {
    case 'success':
    case 'passed':
      return '✓';
    case 'failed':
      return '✖';
    case 'warning':
      return '⚠';
    case 'manual':
      return '▶';
    case 'canceled':
    case 'cancelled':
      return '⊘';
    case 'skipped':
      return '↷';
    case 'running':
      return '●';
    case 'pending':
    case 'created':
    case 'preparing':
    case 'scheduled':
      return '○';
    default:
      return '•';
  }
}

/** @purpose True when a status is an actual job failure (log is worth fetching). */
function isFailed(status: string): boolean {
  return status.toLowerCase() === 'failed';
}
// #endregion END_JOB_STATUS_ICON

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

/** @purpose Build the canonical web URL of a pipeline from host, project and iid. */
function buildPipelineUrl(context: VcsCliContext, iid: string | undefined): string | undefined {
  if (!iid) return undefined;
  return `https://${context.host}/${context.project}/-/pipelines/${iid}`;
}

/** @purpose Collect present pipeline metadata as ordered label/value rows. */
function pipelineMetaRows(
  pipeline: VcsPipelineStatus,
  context: VcsCliContext
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (pipeline.iid) rows.push(['iid', `#${pipeline.iid}`]);
  if (pipeline.sha) rows.push(['sha', pipeline.sha]);
  if (pipeline.commitTitle) rows.push(['title', pipeline.commitTitle]);
  if (pipeline.ref) rows.push(['ref', pipeline.ref]);
  const url = buildPipelineUrl(context, pipeline.iid);
  if (url) rows.push(['url', url]);
  if (pipeline.createdAt || pipeline.updatedAt)
    rows.push(['time', `${pipeline.createdAt || '?'} → ${pipeline.updatedAt || '?'}`]);
  return rows;
}

/** @purpose Format pipeline metadata + jobs as JSON for machine consumption. */
function outputJson(
  pipeline: VcsPipelineStatus,
  jobs: typeof pipeline.jobs,
  context: VcsCliContext,
  deps: VcsPipelineDeps
): void {
  const url = buildPipelineUrl(context, pipeline.iid);
  deps.stdout.write(
    JSON.stringify(
      {
        status: pipeline.status,
        ...(pipeline.iid ? { iid: pipeline.iid } : {}),
        ...(pipeline.sha ? { sha: pipeline.sha } : {}),
        ...(pipeline.ref ? { ref: pipeline.ref } : {}),
        ...(pipeline.commitTitle ? { title: pipeline.commitTitle } : {}),
        ...(url ? { url } : {}),
        ...(pipeline.createdAt ? { createdAt: pipeline.createdAt } : {}),
        ...(pipeline.updatedAt ? { updatedAt: pipeline.updatedAt } : {}),
        jobs: jobs.map((j) => ({ name: j.name, status: j.status, id: extractJobId(j.id) })),
      },
      null,
      2
    )
  );
  deps.stdout.write('\n');
}

/** @purpose Format pipeline metadata + jobs as human-readable text with status icons. */
function outputText(
  pipeline: VcsPipelineStatus,
  jobs: typeof pipeline.jobs,
  context: VcsCliContext,
  deps: VcsPipelineDeps
): void {
  deps.stdout.write(`Pipeline status: ${pipeline.status || 'none'}\n`);
  for (const [label, value] of pipelineMetaRows(pipeline, context))
    deps.stdout.write(`  ${label.padEnd(5)} ${value}\n`);

  if (jobs.length === 0) {
    deps.stdout.write('No matching jobs.\n');
  } else {
    for (const job of jobs)
      deps.stdout.write(`  ${statusIcon(job.status)} ${job.name} (${job.status})\n`);
  }
}

/** @purpose Format a pipeline listing as human-readable text, two lines per pipeline. */
function outputList(
  summaries: VcsPipelineSummary[],
  context: VcsCliContext,
  label: string,
  deps: VcsPipelineDeps
): void {
  if (summaries.length === 0) {
    deps.stdout.write(`No pipelines found (${label}).\n`);
    return;
  }

  deps.stdout.write(`Pipelines (${label}, ${summaries.length}):\n`);
  for (const summary of summaries) {
    const sha = summary.sha ? summary.sha.slice(0, 7) : '?';
    deps.stdout.write(
      `  #${summary.iid} ${summary.status || 'none'} @${sha} ${summary.createdAt || '?'}\n`
    );
    if (summary.title) deps.stdout.write(`        ${summary.title}\n`);
    const url = buildPipelineUrl(context, summary.iid);
    if (url) deps.stdout.write(`        ${url}\n`);
  }
}

/** @purpose Format a pipeline listing as JSON for machine consumption. */
function outputListJson(
  summaries: VcsPipelineSummary[],
  context: VcsCliContext,
  deps: VcsPipelineDeps
): void {
  deps.stdout.write(
    JSON.stringify(
      summaries.map((summary) => ({
        ...summary,
        ...(buildPipelineUrl(context, summary.iid)
          ? { url: buildPipelineUrl(context, summary.iid) }
          : {}),
      })),
      null,
      2
    )
  );
  deps.stdout.write('\n');
}
// #endregion END_OUTPUT_PIPELINE

// #region START_LIST_PIPELINES
/**
 * @purpose Execute list mode: fetch recent pipelines (optionally by ref/sha) and print them.
 * @param context Resolved VCS context.
 * @param options Parsed run options.
 * @param deps Injected dependencies.
 * @returns Computed exit code (0 on success, 1 on API failure).
 */
async function runList(
  context: VcsCliContext,
  options: RunOptions,
  deps: VcsPipelineDeps
): Promise<number> {
  const client: VcsClient = createVcsClient(context);

  if (!client.Pipeline) {
    deps.stderr.write('✖ Ошибка: Pipeline API не поддерживается данным VCS-клиентом\n');
    return 1;
  }

  // invariant: only an explicit --branch narrows the list; a locally detected git branch must not leak in
  const label = [
    options.branch ? `ref=${options.branch}` : undefined,
    options.sha ? `sha=${options.sha}` : undefined,
    `limit=${options.limit}`,
  ]
    .filter(Boolean)
    .join(', ');

  if (options.dryRun) {
    deps.stdout.write(`Would list pipelines for: ${context.project} (${label})\n`);
    deps.stdout.write('[DRY-RUN] no request sent\n');
    return 0;
  }

  try {
    logger.info(`[runList] [idle → fetching] ${context.project} (${label})`);
    const summaries = await client.Pipeline.getPipelines({
      project: context.project,
      ...(options.branch ? { ref: options.branch } : {}),
      ...(options.sha ? { sha: options.sha } : {}),
      limit: options.limit,
    });

    const filtered =
      options.statusFilter && options.statusFilter !== 'all' && options.statusFilter !== 'failed'
        ? summaries.filter((s) => s.status.toLowerCase() === options.statusFilter!.toLowerCase())
        : summaries;

    logger.info(`[runList] [fetching → fetched] pipelines=${filtered.length}`);
    if (options.json) outputListJson(filtered, context, deps);
    else outputList(filtered, context, label, deps);
    return 0;
  } catch (cause) {
    const error = new Error(`[runList] Listing failed for ${context.project}`, { cause });
    logger.error(`[runList] [fetching → failed]`, { error });
    deps.stderr.write(`✖ GitLab API error: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`);
    return 1;
  }
}
// #endregion END_LIST_PIPELINES

// #region START_WATCH_PIPELINE
/**
 * @purpose Poll a pipeline until it reaches a terminal status, printing status transitions.
 * @param fetch Pipeline fetcher — called once per poll.
 * @param options Watch timing options.
 * @param deps Injected dependencies.
 * @returns Final pipeline snapshot and whether the watch timed out.
 */
async function watchPipeline(
  fetch: () => Promise<VcsPipelineStatus>,
  options: RunOptions,
  deps: VcsPipelineDeps
): Promise<{ pipeline: VcsPipelineStatus; timedOut: boolean }> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const intervalMs = Math.max(1, options.intervalSec) * 1000;
  const deadline = Date.now() + Math.max(1, options.timeoutSec) * 1000;

  let pipeline = await fetch();
  let previous = '';

  for (;;) {
    const status = (pipeline.status || 'none').toLowerCase();
    if (status !== previous) {
      deps.stdout.write(`[watch] ${new Date().toISOString()} ${pipeline.status || 'none'}\n`);
      previous = status;
    }

    if (TERMINAL_STATUSES.has(status)) return { pipeline, timedOut: false };

    if (Date.now() >= deadline) {
      deps.stdout.write(
        `[watch] timeout after ${options.timeoutSec}s (last status: ${pipeline.status || 'none'})\n`
      );
      return { pipeline, timedOut: true };
    }

    await sleep(intervalMs);
    pipeline = await fetch();
  }
}
// #endregion END_WATCH_PIPELINE

/**
 * @purpose Execute vcs-pipeline: show MR/ref pipeline status, metadata and jobs; list or watch.
 * @invariant --dry-run prints intent without API calls.
 * @invariant Empty pipeline status is treated as no pipeline.
 * @invariant --watch exits 1 on a failed/canceled terminal status, 0 otherwise.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: VCS API calls via VCS client.
 * @sideEffect Console: pipeline status, metadata, jobs and logs to stdout.
 * @consumers CLI (gennady)
 */
export async function run(
  rawArgs: string[],
  deps: VcsPipelineDeps = resolveDefaultDeps()
): Promise<void> {
  logger.debug('[run] [idle → parsing]');

  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    host: { aliases: ['host', 'vcs-host'], takesValue: true },
    url: { aliases: ['url'], takesValue: true },
    project: { aliases: ['project'], takesValue: true },
    branch: { aliases: ['branch'], takesValue: true },
    sha: { aliases: ['sha'], takesValue: true },
    status: { aliases: ['status'], takesValue: true },
    limit: { aliases: ['limit'], takesValue: true },
    interval: { aliases: ['interval'], takesValue: true },
    timeout: { aliases: ['timeout'], takesValue: true },
    test: { aliases: ['test'], takesValue: true },
    'dry-run': ['dry-run', 'dry'],
    watch: ['watch', 'until-done'],
    json: ['json'],
    logs: ['logs'],
    all: ['all'],
    list: ['list'],
  }) as Record<string, unknown>;

  const options: RunOptions = {
    watch: !!args['watch'],
    list: !!args.list,
    json: !!args.json,
    logs: !!args.logs,
    all: !!args.all,
    dryRun: !!args['dry-run'],
    statusFilter: args.status as string | undefined,
    test: args.test as string | undefined,
    branch: args.branch as string | undefined,
    sha: args.sha as string | undefined,
    limit: Number(args.limit ?? 10) || 10,
    intervalSec: Number(args.interval ?? 15) || 15,
    timeoutSec: Number(args.timeout ?? 1800) || 1800,
  };
  if (options.all) options.statusFilter = 'all';
  else if (!options.statusFilter) options.statusFilter = 'failed';

  // #region START_RESOLVE_ARGS — ref mode cannot carry both --ref and --branch; take project from either
  const refArg = args.ref as string | undefined;
  const refProject =
    refArg && refArg.includes('!') ? refArg.slice(0, refArg.lastIndexOf('!')) : undefined;
  const projectArg = (args.project as string | undefined) ?? refProject;
  const refScoped = options.list || Boolean(options.branch || options.sha);

  const vcsArgs: VcsCliArgs = refScoped
    ? {
        url: args.url as string | undefined,
        host: args.host as string | undefined,
        project: projectArg,
        branch: options.branch,
      }
    : {
        ref: refArg,
        host: args.host as string | undefined,
        url: args.url as string | undefined,
        branch: options.branch,
      };
  // #endregion END_RESOLVE_ARGS

  logger.debug(
    `[run] [parsing → parsed] list=${options.list} watch=${options.watch} branch=${options.branch ?? ''} sha=${options.sha ?? ''}`
  );

  const context = await resolveContextOrFail(vcsArgs, deps);

  // #region START_LIST_MODE
  if (options.list) {
    const code = await runList(context, options, deps);
    logger.info(`[run] [listing → complete] status=${code}`);
    deps.exit(code);
  }
  // #endregion END_LIST_MODE

  // #region START_DETERMINE_TARGET
  const refMode = Boolean(options.branch || options.sha);
  let iid: number | undefined;
  let fetch: () => Promise<VcsPipelineStatus>;

  if (refMode) {
    const client: VcsClient = createVcsClient(context);
    if (!client.Pipeline) {
      deps.stderr.write('✖ Ошибка: Pipeline API не поддерживается данным VCS-клиентом\n');
      deps.exit(1);
    }
    fetch = () => fetchRefPipeline(client, context, options);
    logger.debug(
      `[run] [determining-target → ref] ref=${options.branch ?? ''} sha=${options.sha ?? ''}`
    );
  } else {
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
    fetch = () => fetchMergeRequestPipeline(context, iid as number);
  }
  // #endregion END_DETERMINE_TARGET

  // #region START_DRY_RUN
  if (options.dryRun) {
    if (refMode) {
      deps.stdout.write(
        `Would fetch latest pipeline for: ${context.project} (ref=${options.branch ?? ''} sha=${options.sha ?? ''})\n`
      );
    } else {
      deps.stdout.write(`Would fetch pipeline for: ${context.project}!${iid}\n`);
    }
    deps.stdout.write('[DRY-RUN] no request sent\n');
    logger.info(`[run] [ready → dry-run-complete] ${context.project}`);
    deps.exit(0);
  }
  // #endregion END_DRY_RUN

  // #region START_FETCH_AND_OUTPUT
  try {
    if (options.watch) {
      const { pipeline: finalPipeline, timedOut } = await watchPipeline(fetch, options, deps);
      const jobs = filterJobs(finalPipeline, options.statusFilter);
      if (options.json) outputJson(finalPipeline, jobs, context, deps);
      else outputText(finalPipeline, jobs, context, deps);
      const failed = FAILURE_STATUSES.has((finalPipeline.status || '').toLowerCase());
      logger.info(`[run] [watching → complete] status=${finalPipeline.status || 'none'}`);
      deps.exit(timedOut || failed ? 1 : 0);
    }

    const pipeline = await fetch();

    if (!pipeline.status) {
      deps.stdout.write(
        refMode ? 'No pipeline found for this ref\n' : 'No pipeline found for this MR\n'
      );
      logger.info(`[run] [output → no-pipeline] ${context.project}`);
      deps.exit(0);
    }

    const jobs = filterJobs(pipeline, options.statusFilter);

    if (options.logs && jobs.length > 0) {
      const client: VcsClient = createVcsClient(context);
      deps.stdout.write(`Pipeline status: ${pipeline.status}\n`);
      for (const [label, value] of pipelineMetaRows(pipeline, context))
        deps.stdout.write(`  ${label.padEnd(5)} ${value}\n`);
      deps.stdout.write('\n');
      for (const job of jobs) {
        const failed = isFailed(job.status);
        deps.stdout.write(`${statusIcon(job.status)} ${job.name} (${job.status})\n`);
        if (failed) {
          try {
            const trace = await client.Pipeline!.getJobLog({
              project: context.project,
              jobId: extractJobId(job.id),
            });
            deps.stdout.write(`${filterLog(trace, options.test ? { test: options.test } : {})}\n`);
          } catch (e) {
            deps.stdout.write(`  [log unavailable: ${(e as Error).message}]\n`);
          }
        }
      }
      deps.exit(0);
    }

    if (options.json) {
      outputJson(pipeline, jobs, context, deps);
    } else {
      outputText(pipeline, jobs, context, deps);
    }
    logger.info(`[run] [output → complete] status=${pipeline.status}`);
    deps.exit(0);
  } catch (cause) {
    const error = new Error(`[run] Fetch failed for ${context.project}`, { cause });
    logger.error(`[run] [fetching → failed]`, { error });
    deps.stderr.write(`✖ GitLab API error: ${(cause as Error).message ?? 'неизвестная ошибка'}\n`);
    deps.exit(1);
  }
  // #endregion END_FETCH_AND_OUTPUT
}
