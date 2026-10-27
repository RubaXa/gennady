// @file: Bounded observational profiler of saved authoring tools; never reads source or model reasoning.
// @spec: AI-SKILLS
// @consumers: offline authoring trajectory analysis; deterministic profiler tests

import { isAbsolute, relative, resolve, sep } from 'node:path';
import { safeVerifyText } from '../../shared/verify/reporting/report-safety.ts';
import type { Trajectory, ToolEvent } from './trajectory.ts';
import type { SddEvalUsage } from './types.ts';

export type AuthoringProfileContext = { caseId: string; target: string; directory: string };
export type AuthoringProfileCategory =
  | 'target'
  | 'directive'
  | 'format'
  | 'template'
  | 'manifest'
  | 'reference'
  | 'check'
  | 'create'
  | 'discovery'
  | 'unknown';
export type AuthoringProfileCall = {
  order: number;
  tool: string;
  callId?: string;
  messageId?: string;
  sessionId?: string;
  status?: string;
  startedAt?: number;
  finishedAt?: number;
  exitCode?: number;
  path?: string;
  category: AuthoringProfileCategory;
  cliVerb?: string;
  command?: string;
  commandWithheld?: boolean;
  issues: string[];
};
export type AuthoringProfileOpportunity = {
  orders: number[];
  callIds: string[];
  paths: string[];
  reason: string;
};
export type AuthoringTrajectoryProfile = {
  version: 1;
  caseId: string;
  target?: string;
  captureComplete: boolean;
  classificationComplete: boolean;
  limitations: string[];
  totalToolEvents: number;
  omittedToolEvents: number;
  toolHistogram: Record<string, number>;
  cliVerbHistogram: Record<string, number>;
  categoryHistogram: Record<string, number>;
  calls: AuthoringProfileCall[];
  readTargets: Array<{ path: string; category: AuthoringProfileCategory; orders: number[] }>;
  repeatReads: Array<{ path: string; orders: number[] }>;
  writePaths: Array<{ path: string; orders: number[] }>;
  redundantReadOpportunities: AuthoringProfileOpportunity[];
  possibleBatchingCandidates: AuthoringProfileOpportunity[];
  usageByRole: Partial<
    Record<
      'worker' | 'judge' | 'reflection',
      {
        assistantMessagesObserved?: number;
        input?: number;
        output?: number;
        reasoning?: number;
        cacheRead?: number;
        cacheWrite?: number;
        total?: number;
        models?: string[];
        complete: boolean;
      }
    >
  >;
};

const MAX_CALLS = 512;
const MAX_COMMAND = 4096;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** @purpose Describe only saved observable data; opportunities are hypotheses, not redundant-work verdicts. */
export function profileAuthoringTrajectory(
  trajectory: Trajectory,
  context: AuthoringProfileContext,
  usage: Partial<Record<'worker' | 'judge' | 'reflection', SddEvalUsage>> = {}
): AuthoringTrajectoryProfile {
  const root = resolve(context.directory);
  const clean = (value: string, limit = 160): string =>
    safeVerifyText(value, root)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .slice(0, limit);
  const ownedPath = (value: unknown): string | undefined => {
    if (
      typeof value !== 'string' ||
      !value ||
      value.length > 2048 ||
      /[\u0000-\u001f\u007f]|\[redacted\]|\[truncated/i.test(value)
    )
      return;
    const path = relative(root, resolve(root, value));
    if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) return;
    const safe = safeVerifyText(path.split(sep).join('/'), root);
    return safe.includes('[redacted]') ? undefined : safe;
  };
  const categoryForPath = (path: string): AuthoringProfileCategory => {
    if (path === ownedPath(context.target)) return 'target';
    if (/\/(?:formats|contract)\//.test(path)) return 'format';
    if (/(?:^|\/)(?:templates?|skeleton)(?:\/|\.)|\.skeleton\./.test(path)) return 'template';
    if (/(?:^|\/)manifest(?:[./-]|$)/.test(path)) return 'manifest';
    if (
      /(?:^|\/)(?:ai\/(?:directives|kit)\/|\.claude\/skills\/)|\.directive\.(?:xml|hbs)$/.test(path)
    )
      return 'directive';
    return 'reference';
  };
  const profile: AuthoringTrajectoryProfile = {
    version: 1,
    caseId: clean(context.caseId),
    target: ownedPath(context.target),
    captureComplete: trajectory.coverage?.complete === true,
    classificationComplete: true,
    limitations: [
      'Lexical sandbox paths only; symlink identity and unsaved filesystem history are not observed.',
      'Read ranges and contents are not captured; repeats and batching candidates are observational hypotheses, not intent or proven waste.',
      'Read/write path groups count observed attempts, not successful file accesses; status is retained on each call.',
      'usage.messages counts observed assistant messages, not HTTP requests, retries or model reasoning text. Roles are never pooled.',
    ],
    totalToolEvents: 0,
    omittedToolEvents: 0,
    toolHistogram: Object.create(null),
    cliVerbHistogram: Object.create(null),
    categoryHistogram: Object.create(null),
    calls: [],
    readTargets: [],
    repeatReads: [],
    writePaths: [],
    redundantReadOpportunities: [],
    possibleBatchingCandidates: [],
    usageByRole: {},
  };
  if (!profile.captureComplete) profile.limitations.push('Missing or incomplete saved capture.');
  if (!isAbsolute(context.directory)) {
    profile.classificationComplete = false;
    profile.limitations.push(
      'Sandbox directory is not absolute; path interpretation is unqualified.'
    );
  }
  if (!profile.target) {
    profile.classificationComplete = false;
    profile.limitations.push('Missing or unsafe expected target.');
  }
  const identities = new Map<string, AuthoringProfileCall>();
  for (const [order, event] of trajectory.events.entries()) {
    if (event.type !== 'tool') continue;
    profile.totalToolEvents++;
    if (profile.calls.length >= MAX_CALLS) {
      profile.omittedToolEvents++;
      continue;
    }
    const tool = /^[a-z][a-z0-9_.:-]{0,79}$/i.test(event.tool)
      ? clean(event.tool).toLowerCase()
      : 'unknown';
    const call: AuthoringProfileCall = { order, tool, category: 'unknown', issues: [] };
    for (const key of ['callId', 'messageId', 'sessionId'] as const) {
      const value = event[key];
      if (typeof value === 'string' && value && value !== 'unknown') call[key] = clean(value);
    }
    if (call.callId && call.messageId && call.sessionId) {
      const identity = JSON.stringify([event.sessionId, event.callId]);
      const previous = identities.get(identity);
      if (previous) {
        previous.issues.push('duplicate-identity');
        call.issues.push('duplicate-identity');
      } else identities.set(identity, call);
    } else call.issues.push('missing-identity');
    if (typeof event.status === 'string') call.status = clean(event.status, 32);
    if (!['completed', 'error'].includes(event.status ?? ''))
      call.issues.push('nonterminal-or-missing-status');
    if (finite(event.startedAt)) call.startedAt = event.startedAt;
    if (finite(event.finishedAt)) call.finishedAt = event.finishedAt;
    if (
      call.startedAt === undefined ||
      call.finishedAt === undefined ||
      call.finishedAt < call.startedAt
    )
      call.issues.push('missing-or-invalid-time');
    if (typeof event.exitCode === 'number' && Number.isSafeInteger(event.exitCode))
      call.exitCode = event.exitCode;
    let args: Record<string, unknown> | undefined;
    if (typeof event.arg === 'string' && event.arg.length <= 16384) {
      try {
        const parsed: unknown = JSON.parse(event.arg);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          args = parsed as Record<string, unknown>;
      } catch {
        /* Malformed/truncated input remains unknown; never export its raw bytes. */
      }
    }
    if (!args) call.issues.push('missing-or-malformed-arguments');
    if (['read', 'write', 'edit'].includes(tool)) {
      call.path = ownedPath(args?.filePath ?? args?.path);
      if (
        args?.filePath !== undefined &&
        args.path !== undefined &&
        ownedPath(args.filePath) !== ownedPath(args.path)
      ) {
        call.path = undefined;
        call.issues.push('conflicting-paths');
      }
      if (call.path) call.category = categoryForPath(call.path);
      else call.issues.push('missing-or-unsafe-path');
    } else if (['glob', 'grep', 'list'].includes(tool)) call.category = 'discovery';
    if (tool === 'bash') projectCommand(event, args, call, root, clean);
    if (call.category === 'unknown' && !call.issues.length)
      call.issues.push('unclassified-tool-or-verb');
    profile.calls.push(call);
  }
  if (profile.omittedToolEvents) {
    profile.captureComplete = false;
    profile.classificationComplete = false;
    profile.limitations.push('Profile call limit reached; remaining events are not analyzed.');
  }
  const reads = new Map<
    string,
    { path: string; category: AuthoringProfileCategory; orders: number[] }
  >();
  const writes = new Map<string, { path: string; orders: number[] }>();
  for (const call of profile.calls) {
    profile.toolHistogram[call.tool] = (profile.toolHistogram[call.tool] ?? 0) + 1;
    if (call.cliVerb)
      profile.cliVerbHistogram[call.cliVerb] = (profile.cliVerbHistogram[call.cliVerb] ?? 0) + 1;
    profile.categoryHistogram[call.category] = (profile.categoryHistogram[call.category] ?? 0) + 1;
    if (call.issues.length) profile.classificationComplete = false;
    if (call.path && call.tool === 'read') {
      const group = reads.get(call.path) ?? {
        path: call.path,
        category: call.category,
        orders: [],
      };
      group.orders.push(call.order);
      reads.set(call.path, group);
    }
    if (call.path && ['write', 'edit'].includes(call.tool)) {
      const group = writes.get(call.path) ?? { path: call.path, orders: [] };
      group.orders.push(call.order);
      writes.set(call.path, group);
    }
  }
  profile.readTargets = [...reads.values()];
  profile.repeatReads = profile.readTargets
    .filter((group) => group.orders.length > 1)
    .map(({ path, orders }) => ({ path, orders }));
  profile.writePaths = [...writes.values()];
  // Only adjacent, completed, uniquely identified, non-overlapping same-session reads qualify.
  // Any intervening Bash/check/write/unknown call is a barrier, never assumed side-effect-free.
  for (let i = 1; i < profile.calls.length; i++) {
    const left = profile.calls[i - 1]!,
      right = profile.calls[i]!;
    if (
      profile.omittedToolEvents ||
      !isAbsolute(context.directory) ||
      trajectory.coverage?.complete !== true ||
      right.order !== left.order + 1 ||
      [left, right].some(
        (call) =>
          call.tool !== 'read' || call.status !== 'completed' || call.issues.length || !call.path
      ) ||
      left.sessionId !== right.sessionId ||
      left.finishedAt! > right.startedAt!
    )
      continue;
    const opportunity = {
      orders: [left.order, right.order],
      callIds: [left.callId!, right.callId!],
      paths: [left.path!, right.path!],
      reason:
        left.path === right.path
          ? 'Adjacent same-path reads with no observed intervening mutation; read ranges/content stability are unknown, so a repeat may be justified.'
          : 'Adjacent distinct-path reads in one session with non-overlapping intervals; batching is only a candidate because content dependencies/tool batch support are unknown.',
    };
    if (left.path === right.path) profile.redundantReadOpportunities.push(opportunity);
    else profile.possibleBatchingCandidates.push(opportunity);
  }
  for (const role of ['worker', 'judge', 'reflection'] as const) {
    const observed = usage[role];
    if (!observed) continue;
    const projected: NonNullable<AuthoringTrajectoryProfile['usageByRole']['worker']> = {
      complete: observed.complete === true,
    };
    if (finite(observed.messages) && Number.isInteger(observed.messages))
      projected.assistantMessagesObserved = observed.messages;
    else projected.complete = false;
    for (const key of ['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite', 'total'] as const)
      if (finite(observed[key])) projected[key] = observed[key];
      else projected.complete = false;
    if (observed.models)
      projected.models = observed.models.slice(0, 20).map((model) => clean(model));
    profile.usageByRole[role] = projected;
  }
  return profile;
}

/** @purpose Keep exact sanitized non-payload command text; recognize only simple direct CLI attempts. */
function projectCommand(
  event: ToolEvent,
  args: Record<string, unknown> | undefined,
  call: AuthoringProfileCall,
  root: string,
  clean: (value: string, limit?: number) => string
): void {
  const command = event.command ?? (typeof args?.command === 'string' ? args.command : undefined);
  if (!command) {
    call.issues.push('missing-command');
    return;
  }
  if (command.length > MAX_COMMAND || /truncat|\[redacted\]/i.test(command))
    call.issues.push('truncated-or-redacted-command');
  // Shell source/payload/env assignments are not safe argument summaries. Do not export them.
  if (
    /[<>\n\r]|(?:^|[\s;&|])(?:echo|printf|export)\b|(?:^|\s)[A-Za-z_][\w]*=|(?:^|\s)(?:-e|-c|-d|--eval|--data(?:-raw|-binary)?)(?:\s|=)/.test(
      command
    )
  ) {
    call.commandWithheld = true;
    call.issues.push('embedded-shell-payload-withheld');
    return;
  }
  call.command = clean(command, MAX_COMMAND);
  if (command.length > MAX_COMMAND) return;
  if (typeof args?.command === 'string' && args.command !== command) {
    call.issues.push('conflicting-command');
    return;
  }
  if (
    !args ||
    ['workdir', 'cwd'].some(
      (key) =>
        args[key] !== undefined &&
        (typeof args[key] !== 'string' || resolve(root, args[key] as string) !== root)
    )
  ) {
    call.issues.push('missing-or-foreign-command-directory');
    return;
  }
  if (/[;&|`$\\]|['"]/.test(command)) {
    call.issues.push('opaque-shell');
    return;
  }
  const tokens = command.trim().split(/\s+/);
  const executable = tokens.shift();
  if (executable === 'npx') {
    while (tokens[0] === '--no-install' || tokens[0] === '--offline') tokens.shift();
    if (tokens.shift() !== 'gennady') {
      call.issues.push('unrecognized-command');
      return;
    }
  } else if (
    ![
      'gennady',
      './node_modules/.bin/gennady',
      'node_modules/.bin/gennady',
      resolve(root, 'node_modules/.bin/gennady'),
    ].includes(executable ?? '')
  ) {
    call.issues.push('unrecognized-command');
    return;
  }
  const verb = tokens.shift();
  if (!verb || !/^sdd-[a-z-]+$/.test(verb)) {
    call.issues.push('unrecognized-command');
    return;
  }
  call.cliVerb = verb;
  if (tokens.some((token) => ['--help', '--version', '-h', '-v'].includes(token)))
    call.category = 'discovery';
  else if (verb === 'sdd-new')
    call.category = tokens.includes('--manifest')
      ? 'manifest'
      : tokens.includes('--list')
        ? 'discovery'
        : 'create';
  else if (verb === 'sdd-check' || verb === 'sdd-verify') call.category = 'check';
  else if (verb === 'sdd-extract' || verb === 'sdd-orient' || verb === 'sdd-state')
    call.category = 'discovery';
}
