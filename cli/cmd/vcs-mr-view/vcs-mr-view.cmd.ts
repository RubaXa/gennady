#!/usr/bin/env node
// @file: vcs-mr-view CLI command — show MR base info: title, description, reviewers, approvers, labels, state.
// @spec: CLI-VCS-MR-VIEW
// @consumers: gennady.ts

import {
  resolveVcsContext,
  VcsResolveError,
  type VcsCliArgs,
  type VcsCliContext,
} from '../_shared/vcs-context-resolver.ts';
import { createVcsClient } from '../_shared/create-vcs-client.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { logger } from '#logger';

/** @purpose Injectable dependencies for the vcs-mr-view command. */
type Deps = {
  /** @purpose VCS context resolution function */
  resolveVcsContext: typeof resolveVcsContext;
  /** @purpose Standard output stream — user-facing messages */
  stdout: NodeJS.WriteStream;
  /** @purpose Standard error stream — error messages */
  stderr: NodeJS.WriteStream;
  /** @purpose Terminate the process with a given exit code — never returns */
  exit: (code: number) => never;
};

/** @purpose Default DI — real process bindings. @returns Fresh deps wired to process. */
function defaultDeps(): Deps {
  return {
    resolveVcsContext,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
  };
}

/** @purpose Normalized MR view model — the stable surface consumed by text/JSON output. */
type MrView = {
  /** @purpose MR internal id */
  iid: number | string | undefined;
  /** @purpose MR title (without Draft/WIP prefix) */
  title: string;
  /** @purpose Provider state: opened/closed/merged */
  state: string;
  /** @purpose Whether the MR is a draft */
  draft: boolean;
  /** @purpose Author username */
  author?: string;
  /** @purpose Assignee usernames */
  assignees: string[];
  /** @purpose Requested reviewer usernames */
  reviewers: string[];
  /** @purpose Usernames that approved the MR */
  approvers: string[];
  /** @purpose Project-required approval count when the provider exposes it */
  approvalsRequired?: number;
  /** @purpose True when the approvals endpoint was queried but failed */
  approvalsUnavailable: boolean;
  /** @purpose Label names */
  labels: string[];
  /** @purpose Milestone title */
  milestone?: string;
  /** @purpose Source branch */
  sourceBranch?: string;
  /** @purpose Target branch */
  targetBranch?: string;
  /** @purpose Canonical MR web URL */
  webUrl?: string;
  /** @purpose Detailed merge status (fallback to merge_status) */
  mergeStatus?: string;
  /** @purpose Whether the MR has conflicts */
  hasConflicts?: boolean;
  /** @purpose Number of discussion notes */
  userNotesCount?: number;
  /** @purpose Changed-files count as reported by the provider */
  changesCount?: number | string;
  /** @purpose Creation timestamp */
  createdAt?: string;
  /** @purpose Last update timestamp */
  updatedAt?: string;
  /** @purpose MR description (Markdown) */
  description: string;
};

/** @purpose True when a value is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** @purpose Read a string field from an untyped API object. */
function str(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** @purpose Read a number field from an untyped API object. */
function num(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

/** @purpose Extract usernames from a GitLab user array (username, falling back to name). */
function userNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (isRecord(entry) ? (str(entry, 'username') ?? str(entry, 'name')) : undefined))
    .filter((name): name is string => Boolean(name));
}

/** @purpose Strip a leading Draft:/WIP: prefix from a title. */
function stripDraftPrefix(title: string): string {
  return title.replace(/^(?:Draft|WIP):\s*/i, '');
}

/** @purpose Detect draft state from explicit flags or the title prefix. */
function isDraft(record: Record<string, unknown>, title: string): boolean {
  if (record.draft === true || record.work_in_progress === true) return true;
  return /^(?:Draft|WIP):\s/i.test(title);
}

/**
 * @purpose Read the MR base info and (optionally) approvals, then print text or JSON.
 * @invariant --dry-run prints intent without API calls.
 * @invariant Missing --url/--ref/--project+iid requires an MR on the current branch, else exit 1.
 * @invariant Approvals endpoint failure degrades to approvalsUnavailable, never aborts the view.
 * @param rawArgs CLI arguments (process.argv).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after process termination — run() always exits via deps.exit.
 * @sideEffect Network: GET MR by iid + GitLab approvals endpoint.
 * @sideEffect Console: MR metadata to stdout.
 * @consumers CLI (gennady)
 */
export async function run(rawArgs: string[], deps: Deps = defaultDeps()): Promise<void> {
  const args = parseArgs(rawArgs, {
    ref: { aliases: ['ref'], takesValue: true },
    project: { aliases: ['project'], takesValue: true },
    iid: { aliases: ['iid'], takesValue: true },
    host: { aliases: ['host', 'vcs-host'], takesValue: true },
    url: { aliases: ['url'], takesValue: true },
    json: ['json'],
    'no-approvals': ['no-approvals'],
    'no-description': ['no-description'],
    'dry-run': ['dry-run', 'dry'],
  }) as Record<string, unknown>;

  const ref = args.ref as string | undefined;
  const project = args.project as string | undefined;
  const iidRaw = args.iid as string | undefined;
  const host = args.host as string | undefined;
  const url = args.url as string | undefined;
  const json = !!args.json;
  const skipApprovals = !!args['no-approvals'];
  const skipDescription = !!args['no-description'];
  const dryRun = !!args['dry-run'];

  if (ref && !/^.+\!\d+$/.test(ref)) {
    deps.stderr.write('✖ Invalid ref format. Expected: <group/repo>!<iid>\n');
    deps.exit(1);
  }

  const iid = ref ? Number(ref.split('!').pop()) : iidRaw ? Number(iidRaw) : undefined;
  const validIid = iid !== undefined && !isNaN(iid) && iid > 0 ? iid : undefined;

  const vcsArgs: VcsCliArgs = { host, ref, project, iid: validIid, url };
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

  // #region START_RESOLVE_IID_BY_BRANCH — no explicit iid: locate the open MR of the current branch
  if ((!resolvedIid || isNaN(resolvedIid) || resolvedIid <= 0) && context.branch) {
    const client = createVcsClient(context);
    const mr = (await client.MergeRequests.getOne({
      project: context.project,
      sourceBranch: context.branch,
    })) as { iid?: number } | null;
    if (mr?.iid) resolvedIid = mr.iid;
  }
  // #endregion END_RESOLVE_IID_BY_BRANCH

  if (!resolvedIid || isNaN(resolvedIid) || resolvedIid <= 0) {
    deps.stderr.write(
      '✖ Specify --url <mr-url> (preferred) or --ref <group/repo>!<iid> with --host\n'
    );
    deps.exit(1);
  }

  if (dryRun) {
    deps.stdout.write(
      `Would fetch MR info: ${context.project}!${resolvedIid}  host=${context.host}  [DRY-RUN] no request sent\n`
    );
    deps.exit(0);
  }

  const client = createVcsClient(context);

  let raw: unknown;
  try {
    raw = await client.MergeRequests.getByIid({
      project: context.project,
      iid: resolvedIid,
    });
  } catch (cause) {
    const msg = (cause as Error).message ?? 'неизвестная ошибка';
    logger.error('[vcs-mr-view] MR fetch failed', { cause });
    deps.stderr.write(`✖ API error: ${msg}\n`);
    deps.exit(1);
  }

  if (!isRecord(raw)) {
    deps.stderr.write(`✖ MR ${context.project}!${resolvedIid} не найден.\n`);
    deps.exit(1);
  }

  const mr = raw as Record<string, unknown>;
  const rawTitle = str(mr, 'title') ?? '';
  const draft = isDraft(mr, rawTitle);

  // #region START_FETCH_APPROVALS — best-effort; missing approvers must not hide the rest of the MR
  let approvers: string[] = [];
  let approvalsRequired: number | undefined;
  let approvalsUnavailable = false;

  if (!skipApprovals && client instanceof VcsGitlabClient) {
    try {
      const approvals = await client.getMergeRequestApprovals(context.project, String(resolvedIid));
      approvers = approvals.approvedBy;
      approvalsRequired = approvals.approvalsRequired;
    } catch (cause) {
      approvalsUnavailable = true;
      logger.warn('[vcs-mr-view] approvals unavailable', { cause });
    }
  }
  // #endregion END_FETCH_APPROVALS

  const authorRecord = isRecord(mr.author) ? mr.author : undefined;
  const milestoneRecord = isRecord(mr.milestone) ? mr.milestone : undefined;

  const view: MrView = {
    iid: (mr.iid as number | string | undefined) ?? resolvedIid,
    title: stripDraftPrefix(rawTitle),
    state: str(mr, 'state') ?? 'unknown',
    draft,
    ...(authorRecord ? { author: str(authorRecord, 'username') ?? str(authorRecord, 'name') } : {}),
    assignees: userNames(mr.assignees),
    reviewers: userNames(mr.reviewers),
    approvers,
    ...(approvalsRequired !== undefined ? { approvalsRequired } : {}),
    approvalsUnavailable,
    labels: Array.isArray(mr.labels)
      ? mr.labels.filter((l): l is string => typeof l === 'string')
      : [],
    ...(milestoneRecord ? { milestone: str(milestoneRecord, 'title') } : {}),
    sourceBranch: str(mr, 'source_branch'),
    targetBranch: str(mr, 'target_branch'),
    webUrl: str(mr, 'web_url'),
    mergeStatus: str(mr, 'detailed_merge_status') ?? str(mr, 'merge_status'),
    ...(typeof mr.has_conflicts === 'boolean' ? { hasConflicts: mr.has_conflicts } : {}),
    ...(num(mr, 'user_notes_count') !== undefined
      ? { userNotesCount: num(mr, 'user_notes_count') }
      : {}),
    ...(mr.changes_count !== undefined
      ? { changesCount: mr.changes_count as number | string }
      : {}),
    createdAt: str(mr, 'created_at'),
    updatedAt: str(mr, 'updated_at'),
    description: skipDescription ? '' : (str(mr, 'description') ?? ''),
  };

  if (json) {
    deps.stdout.write(JSON.stringify(view, null, 2) + '\n');
    logger.info(`[vcs-mr-view] [output → json] ${context.project}!${resolvedIid}`);
    deps.exit(0);
  }

  outputText(view, deps);
  logger.info(`[vcs-mr-view] [output → complete] ${context.project}!${resolvedIid}`);
  deps.exit(0);
}

/** @purpose Render the normalized MR view as aligned human-readable text. */
function outputText(view: MrView, deps: Deps): void {
  const lines: Array<[string, string]> = [];

  lines.push(['state', `${view.state}${view.draft ? ' (draft)' : ''}`]);
  if (view.author) lines.push(['author', view.author]);
  lines.push(['assignees', view.assignees.length ? view.assignees.join(', ') : '(none)']);
  lines.push(['reviewers', view.reviewers.length ? view.reviewers.join(', ') : '(none)']);

  if (view.approvalsUnavailable) {
    lines.push(['approvers', '(unavailable)']);
  } else {
    const required =
      view.approvalsRequired !== undefined
        ? ` (${view.approvers.length}/${view.approvalsRequired})`
        : '';
    lines.push([
      'approvers',
      `${view.approvers.length ? view.approvers.join(', ') : '(none)'}${required}`,
    ]);
  }

  lines.push(['labels', view.labels.length ? view.labels.join(', ') : '(none)']);
  if (view.milestone) lines.push(['milestone', view.milestone]);
  if (view.sourceBranch || view.targetBranch) {
    lines.push(['branch', `${view.sourceBranch ?? '?'} → ${view.targetBranch ?? '?'}`]);
  }
  if (view.mergeStatus) {
    const conflicts =
      view.hasConflicts === undefined
        ? ''
        : view.hasConflicts
          ? ' (conflicts!)'
          : ' (no conflicts)';
    lines.push(['merge', `${view.mergeStatus}${conflicts}`]);
  }
  if (view.userNotesCount !== undefined) lines.push(['notes', String(view.userNotesCount)]);
  if (view.changesCount !== undefined) lines.push(['changes', String(view.changesCount)]);

  const width = lines.reduce((max, [label]) => Math.max(max, label.length), 0);
  deps.stdout.write(`MR !${view.iid ?? '?'}: ${view.title}\n`);
  for (const [label, value] of lines) deps.stdout.write(`  ${label.padEnd(width)}  ${value}\n`);
  if (view.createdAt || view.updatedAt) {
    deps.stdout.write(
      `  ${'time'.padEnd(width)}  ${view.createdAt ?? '?'} → ${view.updatedAt ?? '?'}\n`
    );
  }
  if (view.webUrl) deps.stdout.write(`  ${'url'.padEnd(width)}  ${view.webUrl}\n`);

  if (view.description) {
    deps.stdout.write('\ndescription:\n');
    deps.stdout.write(
      view.description
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n') + '\n'
    );
  }
}
