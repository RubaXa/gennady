// @file: Bounded post-measurement interview of the actual author, never a grading authority.
// @spec: AI-SKILLS
// @consumers: flow-eval CLI, reflection causal controls

import type { SddEvalEvidenceSource, SddEvalRuntime, SddEvalUsage } from './types.ts';
import { toolEventsFrom, type Trajectory } from './trajectory.ts';
import { safeVerifyText } from '../../shared/verify/reporting/report-safety.ts';
import { withEvalSignal } from './eval-signal.ts';

/** @purpose Interview the same worker only AFTER immutable primary summary/artifact/trace persistence. */
export async function collectAuthoringReflection(
  runtime: SddEvalRuntime,
  evidence: SddEvalEvidenceSource & {
    readTrajectory(sessionId: string): Promise<{
      entries: import('./types.ts').SddEvalTailEntry[];
      coverage: { complete: boolean };
    }>;
  },
  input: {
    sessionId: string;
    directory: string;
    trajectory: Trajectory;
    quality: unknown;
    semanticVerdict: string;
    signal?: AbortSignal;
  },
  timeoutMs = 90000
) {
  const startedAt = new Date().toISOString();
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
  const bound = <T>(operation: () => Promise<T>) => withEvalSignal(operation, signal);
  const primaryCalls = input.trajectory.events.filter((event) => event.type === 'tool');
  const prompt = [
    'The measured task is over and its artifacts, usage and trace are already frozen. This is a separate diagnostic interview, NOT a retry or grade. Use no tools and change no files.',
    'Give only short factual post-task notes, NOT private reasoning or a step-by-step thought process. Your claims are hypotheses that will be checked against the recorded trace.',
    'Return JSON with helped[], friction[], uncertainties[], nextHypothesis. For each helped/friction item name the instruction path/anchor and an observed tool call ID when possible. State unknown rather than inventing a cause. Which instruction was useful? Which was unclear/duplicated/missing? Which observed action could have been avoided, and what instruction change would you test? Do not defend a verdict or claim a check ran without its terminal evidence.',
    'The whole-write opaque-Bash limitation is a measurement limitation, not proof that your action was wrong. Do not invent a failure to explain it.',
    'FACTUAL_HOST_RESULTS\n' +
      JSON.stringify({ quality: input.quality, semanticVerdict: input.semanticVerdict }),
    'OBSERVED_TOOL_CALLS\n' +
      JSON.stringify(
        primaryCalls.map((event) => ({
          callId: event.callId,
          tool: event.tool,
          status: event.status,
          exitCode: event.exitCode,
          command: event.command?.slice(0, 300),
          arg: event.arg?.slice(0, 300),
        }))
      ).slice(0, 24000),
    'Maximum 600 words. Only public diagnostic notes, with no credentials or confidential reasoning.',
  ].join('\n\n');
  const beforeDiff = await bound(() => evidence.readDiff(input.sessionId));
  const before = await bound(
    () => evidence.readUsage?.(input.sessionId) ?? Promise.resolve(undefined)
  );
  let text = '';
  let status = 'completed';
  try {
    text = await runtime.judge({
      directory: input.directory,
      sessionId: input.sessionId,
      readOnly: true,
      model: { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' },
      prompt,
      signal,
    });
  } catch {
    status = signal.aborted ? 'cancelled-or-timeout' : 'error';
  }
  const after = await bound(
    () => evidence.readUsage?.(input.sessionId) ?? Promise.resolve(undefined)
  ).catch(() => undefined);
  const counters = [
    'input',
    'output',
    'reasoning',
    'cacheRead',
    'cacheWrite',
    'total',
    'messages',
  ] as const;
  const delta: Partial<SddEvalUsage> = {};
  let complete = before?.complete === true && after?.complete === true;
  for (const key of counters) {
    const value = after && before ? after[key] - before[key] : NaN;
    if (!Number.isFinite(value) || value < 0) complete = false;
    else delta[key] = value;
  }
  const capture = await bound(() => evidence.readTrajectory(input.sessionId));
  const known = new Set(primaryCalls.map((event) => event.callId));
  const newCalls = toolEventsFrom(capture.entries).filter((event) => !known.has(event.callId));
  const diffUnchanged = beforeDiff === (await bound(() => evidence.readDiff(input.sessionId)));
  if (newCalls.length || !diffUnchanged) status = 'read-only-violation';
  if (!capture.coverage.complete) status = 'unverified-trajectory';
  if (after?.models?.some((model) => model !== 'llm-proxy/deepseek-v4-flash')) {
    status = 'model-mismatch';
    complete = false;
  }
  const cited = [...new Set(text.match(/call_[A-Za-z0-9_-]+/g) ?? [])];
  const unknownCallIds = cited.filter((id) => !known.has(id));
  return {
    schema: 'gennady.authoring-reflection.1',
    sessionId: input.sessionId,
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    authority: 'self-report hypothesis only; primary metrics and verdicts remain frozen',
    diffUnchanged,
    newToolCalls: newCalls.length,
    usageDelta: delta,
    usageComplete: complete,
    citedCallIds: cited,
    unknownCallIds,
    models: after?.models,
    monetaryCost: 'unknown',
    text: safeVerifyText(text, input.directory).slice(0, 8192),
    textTruncated: text.length > 8192,
  };
}
