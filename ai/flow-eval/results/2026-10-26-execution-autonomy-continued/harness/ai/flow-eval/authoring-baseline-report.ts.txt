// @file: Pure per-case baseline accounting; keeps failed attempts and unknown measurements visible.
// @spec: AI-SKILLS
// @consumers: offline authoring evidence report; deterministic trajectory replay

import type { SddEvalScenario, SddEvalUsage } from './types.ts';
import type { Trajectory } from './trajectory.ts';
import { getAuthoringCase } from './authoring-benchmark.ts';
import { profileAuthoringTrajectory } from './authoring-trajectory-profile.ts';

export type AuthoringBaselineRecord = {
  summary: {
    scenarioId: string;
    sha: string;
    source?: { dirty: boolean };
    verdict: string;
    status: string;
    usage?: SddEvalUsage;
    judgeUsage?: { usage: SddEvalUsage };
    quality?: { pass: boolean; checks?: Array<{ id: string; pass: boolean }> };
    trajectory?: { pass: boolean; detail: string };
    authoringBenchmark?: {
      campaign: string;
      caseId: string;
      variant: string;
      repetition: number;
      sourceCommit: string;
      model: string;
      modelVerified: boolean;
      environmentVerified: boolean;
      dirty: boolean;
      durationMs?: number;
    };
  };
  trajectory: Trajectory;
  reflection?: {
    status: string;
    usageDelta?: Partial<SddEvalUsage>;
    usageComplete?: boolean;
    models?: string[];
    diffUnchanged?: boolean;
    newToolCalls?: number;
  };
  cleanup: {
    scenarioId: string;
    caseId: string;
    repetition: number;
    tempRemoved: boolean;
    cleanupErrors: unknown[];
    sessions: Array<{ id: string; directory: string; deleted: boolean }>;
    requests: Record<string, number>;
  };
};

/** @purpose Summarize the frozen matrix, not just its successful subset. No filesystem or LLM use. */
export function summarizeAuthoringBaseline(
  plan: readonly SddEvalScenario[],
  records: readonly AuthoringBaselineRecord[],
  identity: { sourceCommit: string; model: string }
) {
  if (!plan.length || plan.length > 1000 || records.length > 1000)
    throw new Error('bounded nonempty authoring matrix required');
  const ids = new Set(plan.map((scenario) => scenario.id));
  if (ids.size !== plan.length || plan.some((scenario) => !scenario.authoringBenchmark))
    throw new Error('distinct authoring scenarios required');
  const indexed = new Map<string, AuthoringBaselineRecord>();
  for (const record of records) {
    const id = record.summary.scenarioId;
    if (!ids.has(id) || indexed.has(id)) throw new Error('unexpected or duplicate baseline record');
    indexed.set(id, record);
  }
  const runs = plan.map((scenario) => {
    const expected = scenario.authoringBenchmark!;
    const record = indexed.get(scenario.id);
    if (!record)
      return {
        scenarioId: scenario.id,
        ...expected,
        missing: true as const,
        issues: ['missing-run'],
      };
    const { summary, trajectory, cleanup, reflection } = record;
    const observed = summary.authoringBenchmark;
    const issues: string[] = [];
    if (
      !observed ||
      (['campaign', 'caseId', 'variant', 'repetition'] as const).some(
        (key) => observed[key] !== expected[key]
      ) ||
      summary.sha !== identity.sourceCommit ||
      observed.sourceCommit !== identity.sourceCommit ||
      observed.model !== identity.model ||
      !observed.modelVerified ||
      !observed.environmentVerified ||
      observed.dirty !== false ||
      summary.source?.dirty !== false
    )
      issues.push('source-model-or-scenario-binding');
    if (trajectory.scenario !== scenario.id) issues.push('trajectory-binding');
    if (
      cleanup.scenarioId !== scenario.id ||
      cleanup.caseId !== expected.caseId ||
      cleanup.repetition !== expected.repetition ||
      !cleanup.tempRemoved ||
      cleanup.cleanupErrors.length ||
      !cleanup.sessions.length ||
      cleanup.sessions.some((session) => !session.deleted)
    )
      issues.push('cleanup-unproven');
    const tool = trajectory.events.find((event) => event.type === 'tool' && event.sessionId);
    const workerSession = tool?.type === 'tool' ? tool.sessionId : undefined;
    const directory = cleanup.sessions.find((session) => session.id === workerSession)?.directory;
    if (!directory) issues.push('worker-directory-unproven');
    if (reflection && (reflection.diffUnchanged !== true || reflection.newToolCalls !== 0))
      issues.push('reflection-isolation-unproven');
    if (
      [summary.usage?.models, summary.judgeUsage?.usage.models, reflection?.models].some((models) =>
        models?.some((model) => model !== identity.model)
      )
    )
      issues.push('observed-model-mismatch');
    const reflectionUsage = reflection?.usageDelta
      ? ({
          ...reflection.usageDelta,
          complete: reflection.usageComplete === true,
          models: reflection.models,
        } as SddEvalUsage)
      : undefined;
    const profile = profileAuthoringTrajectory(
      trajectory,
      {
        caseId: expected.caseId,
        target: getAuthoringCase(expected.caseId).target,
        directory: directory ?? '.',
      },
      { worker: summary.usage, judge: summary.judgeUsage?.usage, reflection: reflectionUsage }
    );
    if (!profile.captureComplete) issues.push('incomplete-tool-capture');
    const measurementRequests = Object.entries(cleanup.requests)
      .filter(([key]) => key.startsWith('measurement '))
      .map(([, value]) => value);
    const sdkRequests =
      measurementRequests.length &&
      measurementRequests.every((value) => Number.isSafeInteger(value) && value >= 0)
        ? measurementRequests.reduce((a, b) => a + b, 0)
        : undefined;
    return {
      scenarioId: scenario.id,
      ...expected,
      missing: false as const,
      issues,
      artifactPass: summary.quality?.pass,
      failedArtifactChecks:
        summary.quality?.checks?.filter((check) => !check.pass).map((check) => check.id) ?? [],
      semanticVerdict: summary.verdict,
      status: summary.status,
      pathPass: summary.trajectory?.pass,
      pathDetail: summary.trajectory?.detail,
      workerMs: observed?.durationMs,
      sdkRequests,
      reflectionStatus: reflection?.status ?? 'absent',
      profile,
    };
  });
  const caseIds = [...new Set(plan.map((scenario) => scenario.authoringBenchmark!.caseId))];
  const cases = caseIds.map((caseId) => {
    const selected = runs.filter((run) => run.caseId === caseId);
    const saved = selected.filter((run) => !run.missing);
    return {
      caseId,
      planned: selected.length,
      recorded: saved.length,
      artifactPass: saved.filter((run) => run.artifactPass === true).length,
      semanticPass: saved.filter((run) => run.semanticVerdict === 'pass').length,
      jointQualityPass: saved.filter(
        (run) => run.artifactPass === true && run.semanticVerdict === 'pass'
      ).length,
      pathPass: saved.filter((run) => run.pathPass === true).length,
      errored: saved.filter((run) => run.status === 'error').length,
      cleanlyBound: saved.filter((run) => !run.issues.length).length,
      // A partial metric never masquerades as a full-matrix average.
      tools: distribution(
        saved.map((run) => run.profile.totalToolEvents),
        selected.length
      ),
      workerMs: distribution(
        saved.map((run) => run.workerMs),
        selected.length
      ),
      workerNonCacheTokens: distribution(
        saved.map((run) =>
          run.profile.usageByRole.worker?.complete
            ? run.profile.usageByRole.worker.total
            : undefined
        ),
        selected.length
      ),
      workerMessages: distribution(
        saved.map((run) =>
          run.profile.usageByRole.worker?.complete
            ? run.profile.usageByRole.worker.assistantMessagesObserved
            : undefined
        ),
        selected.length
      ),
      readAttempts: distribution(
        saved.map((run) => run.profile.toolHistogram.read ?? 0),
        selected.length
      ),
      writeAttempts: distribution(
        saved.map(
          (run) => (run.profile.toolHistogram.write ?? 0) + (run.profile.toolHistogram.edit ?? 0)
        ),
        selected.length
      ),
      bashAttempts: distribution(
        saved.map((run) => run.profile.toolHistogram.bash ?? 0),
        selected.length
      ),
      repeatedReadAttempts: distribution(
        saved.map((run) =>
          run.profile.repeatReads.reduce((sum, group) => sum + group.orders.length - 1, 0)
        ),
        selected.length
      ),
    };
  });
  return {
    schema: 'gennady.authoring-baseline-report.1' as const,
    ...identity,
    planned: plan.length,
    recorded: records.length,
    complete: runs.every((run) => !run.missing && !run.issues.length),
    limitations: [
      'A baseline only: no optimization or causal speedup has been demonstrated.',
      'Artifact, semantic and path verdicts are separate; opaque Bash is not proof of a forbidden write.',
      'Read/write counts are attempts, not bytes read or filesystem changes. An observed repeat is not necessarily waste.',
      'Token totals exclude cache reads; cache counters and model messages are separate in per-role profiles.',
      'SDK REST requests include polling and are not provider HTTP calls; proxy retries and monetary cost are unknown.',
      'Three repetitions describe these synthetic artifact cases, not statistical equivalence or the complete interactive SDD flow.',
    ],
    cases,
    runs,
  };
}

function distribution(values: Array<number | undefined>, expected: number) {
  const known = values
    .filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
    )
    .sort((a, b) => a - b);
  const middle = Math.floor(known.length / 2);
  return {
    samples: known.length,
    expected,
    complete: known.length === expected,
    median: known.length
      ? known.length % 2
        ? known[middle]!
        : (known[middle - 1]! + known[middle]!) / 2
      : null,
    min: known[0] ?? null,
    max: known.at(-1) ?? null,
  };
}
