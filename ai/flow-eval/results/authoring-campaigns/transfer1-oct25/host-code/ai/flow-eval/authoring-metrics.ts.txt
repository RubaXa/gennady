// @file: Deterministic authoring-path measurements and fail-closed comparison of repeated experiments.
// @spec: AI-SKILLS
// @consumers: flow-eval CLI; authoring experiment reports and trajectory tests

import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gradeTrajectory, type ToolEvent, type Trajectory } from './trajectory.ts';
import type { SddEvalScenario } from './types.ts';

/** @purpose Bind actual supplied instructions/acceptance/budget, not just the generator's intended task. */
export function bindAuthoringScenario(taskDigest: string, scenario: SddEvalScenario): string {
  const { id: _id, directory: _directory, authoringBenchmark: _label, ...task } = scenario;
  return createHash('sha256').update(JSON.stringify({ taskDigest, task })).digest('hex');
}

/** @purpose Observations, not a model's account of what it did. */
export type AuthoringPathMetrics = {
  tools: number;
  targetReads: number;
  repeatedTargetReads: number;
  wholeWrites: number;
  partialWrites: number;
  failedTools: number;
  checks: number;
  outsideTargetWrites: number;
  toolSpanMs?: number;
};

/** @purpose Recognize a single actual CLI invocation; quoted prose, shell composition and help are not proof. */
function directCommand(event: ToolEvent, verb: string, directory: string): string[] | undefined {
  if (event.tool !== 'bash' || event.status !== 'completed' || event.exitCode !== 0) return;
  try {
    const input = JSON.parse(event.arg ?? '{}') as Record<string, unknown>;
    for (const key of ['workdir', 'cwd'])
      if (
        input[key] !== undefined &&
        (typeof input[key] !== 'string' ||
          resolve(directory, input[key] as string) !== resolve(directory))
      )
        return;
  } catch {
    return;
  }
  const command = event.command ?? '';
  if (/[;&|<>`$\n]/.test(command) || /(?:^|\s)(?:--help|--version|-h|-v)(?:\s|$)/.test(command))
    return;
  const tokens = command
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^(['"])(.*)\1$/, '$2'));
  const executable = tokens.shift();
  if (executable === 'npx') {
    while (tokens[0]?.startsWith('--')) {
      if (!['--no-install', '--offline'].includes(tokens.shift()!)) return;
    }
    if (tokens.shift() !== 'gennady') return;
  } else if (
    !executable ||
    ![
      'gennady',
      'node_modules/.bin/gennady',
      './node_modules/.bin/gennady',
      resolve(directory, 'node_modules/.bin/gennady'),
    ].includes(executable)
  )
    return;
  return tokens.shift() === verb ? tokens : undefined;
}

/** @purpose Resolve only observed file-tool paths inside the exact sandbox, not matching suffixes. */
function toolPath(event: ToolEvent, directory: string): string | undefined {
  try {
    const value = JSON.parse(event.arg ?? '{}') as { filePath?: unknown };
    if (typeof value.filePath === 'string') return resolve(directory, value.filePath);
  } catch {
    // A truncated/non-file projection is unknown, not evidence of reading or writing a target.
  }
  return undefined;
}

/** @purpose Require completion-to-start ordering, including parallel tool calls. */
function precedes(left: ToolEvent, right: ToolEvent): boolean {
  return (
    typeof left.finishedAt === 'number' &&
    Number.isFinite(left.finishedAt) &&
    typeof right.startedAt === 'number' &&
    Number.isFinite(right.startedAt) &&
    left.finishedAt <= right.startedAt
  );
}

/** @purpose Measure exact create→read→whole-write→check path; terminal file checks cannot invent this path. */
export function measureAuthoringPath(
  trajectory: Trajectory,
  target: string,
  directory: string,
  requiresAgentCheck = true,
  createArguments?: readonly string[]
) {
  const base = gradeTrajectory(trajectory);
  const tools = trajectory.events.filter((event): event is ToolEvent => event.type === 'tool');
  const owned = resolve(directory, target);
  const reads = tools.filter(
    (event) =>
      event.tool === 'read' && event.status === 'completed' && toolPath(event, directory) === owned
  );
  const writes = tools.filter(
    (event) =>
      event.tool === 'write' && event.status === 'completed' && toolPath(event, directory) === owned
  );
  const partial = tools.filter((event) => ['edit', 'apply_patch', 'patch'].includes(event.tool));
  const outside = tools.filter(
    (event) => ['write', 'edit'].includes(event.tool) && toolPath(event, directory) !== owned
  );
  const creates = tools.filter((event) => {
    const args = directCommand(event, 'sdd-new', directory);
    if (!args) return false;
    if (args.some((arg) => ['--manifest', '--list'].includes(arg))) return false;
    if (!createArguments) return true;
    if (args[0] !== createArguments[0]) return false;
    const options = new Map<string, string>();
    for (let index = 1; index < args.length; index += 2) {
      const key = args[index]!;
      const value = args[index + 1];
      if (
        !['--scope', '--module', '--out'].includes(key) ||
        !value ||
        value.startsWith('--') ||
        options.has(key)
      )
        return false;
      options.set(key, value);
    }
    for (let index = 1; index < createArguments.length; index += 2) {
      if (options.get(createArguments[index]!) !== createArguments[index + 1]) return false;
    }
    return (
      !args.includes('--out') || resolve(directory, args[args.indexOf('--out') + 1] ?? '') === owned
    );
  });
  const checks = tools.filter((event) => {
    const args = directCommand(event, 'sdd-check', directory);
    return (
      args !== undefined &&
      args.includes('--authoring') &&
      args.includes('--spec') &&
      resolve(directory, args[args.indexOf('--spec') + 1] ?? '') === owned
    );
  });
  const failures = base.pass ? [] : [base.detail];
  // A shell command may mutate the artifact without a Write event. Do not pretend
  // to prove whole-file-only authoring across opaque shell execution.
  if (
    tools.some(
      (event) =>
        event.tool === 'bash' &&
        !directCommand(event, 'sdd-new', directory) &&
        !directCommand(event, 'sdd-check', directory)
    )
  )
    failures.push('opaque Bash command: whole-write-only path unproven');
  if (
    tools.some(
      (event) =>
        typeof event.startedAt !== 'number' ||
        !Number.isFinite(event.startedAt) ||
        typeof event.finishedAt !== 'number' ||
        !Number.isFinite(event.finishedAt) ||
        event.finishedAt < event.startedAt
    )
  )
    failures.push('invalid/missing tool interval');
  const orderedWrites = [...writes].sort(
    (a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity)
  );
  const firstWrite = orderedWrites[0];
  const matchingRead =
    firstWrite &&
    reads.find(
      (read) => precedes(read, firstWrite) && creates.some((create) => precedes(create, read))
    );
  if (!matchingRead) failures.push('actual create→target read→whole Write order not proven');
  if (
    orderedWrites.some((write, index) => index > 0 && !precedes(orderedWrites[index - 1]!, write))
  )
    failures.push('overlapping writes to the same target');
  if (
    requiresAgentCheck &&
    (!writes.length || !checks.some((check) => writes.every((write) => precedes(write, check))))
  )
    failures.push('successful target check after final Write not proven');
  if (partial.length) failures.push('partial authoring writes observed');
  if (outside.length) failures.push('file-tool write outside target observed');
  const starts = tools
    .map((event) => event.startedAt)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const ends = tools
    .map((event) => event.finishedAt)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const span =
    starts.length === tools.length && ends.length === tools.length && tools.length
      ? Math.max(...ends) - Math.min(...starts)
      : undefined;
  const metrics: AuthoringPathMetrics = {
    tools: tools.length,
    targetReads: reads.length,
    repeatedTargetReads: Math.max(0, reads.length - 1),
    wholeWrites: writes.length,
    partialWrites: partial.length,
    failedTools: tools.filter(
      (event) => event.status === 'error' || (event.exitCode !== undefined && event.exitCode !== 0)
    ).length,
    checks: checks.length,
    outsideTargetWrites: outside.length,
    ...(span !== undefined && span >= 0 ? { toolSpanMs: span } : {}),
  };
  return {
    rule: 'AUTHORING-PATH',
    pass: failures.length === 0,
    detail: failures.join('; ') || 'actual create/read/whole-write/check path proven',
    metrics,
  };
}

/** @purpose One source-bound observation; missing provenance never qualifies for optimization claims. */
export type AuthoringObservation = {
  prompt?: import('./authoring-prompt-footprint.ts').AuthoringPromptFootprint;
  campaign: string;
  caseId: string;
  variant: string;
  repetition: number;
  sourceCommit: string;
  dirty: boolean;
  taskDigest: string;
  oracleDigest: string;
  harnessDigest: string;
  environmentDigest: string;
  environmentVerified: boolean;
  model: string;
  modelVerified: boolean;
  artifactPass: boolean;
  semanticVerdict?: string;
  trajectoryPass: boolean;
  durationMs?: number;
  nonCacheTokens?: number;
  metrics: AuthoringPathMetrics;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** @purpose Compare all declared cases/repetitions, not a cherry-picked successful subset.
 * Results are descriptive measurements, never a significance claim from three stochastic samples. */
export function compareAuthoringExperiments(
  records: readonly AuthoringObservation[],
  baseline: string,
  candidate: string,
  expectedCases: readonly string[],
  repetitions = 3
) {
  const issues: string[] = [];
  if (
    new Set(records.map((record) => record.campaign)).size !== 1 ||
    records.some((record) => !record.campaign)
  )
    issues.push('one exact nonempty campaign required');
  for (const variant of [baseline, candidate])
    if (
      new Set(
        records.filter((record) => record.variant === variant).map((record) => record.sourceCommit)
      ).size !== 1
    )
      issues.push(`${variant}: mixed source revisions across cases`);
  if (baseline === candidate || !baseline || !candidate)
    issues.push('two distinct named variants required');
  if (!Number.isSafeInteger(repetitions) || repetitions < 3)
    issues.push('at least three repetitions required');
  if (!expectedCases.length || new Set(expectedCases).size !== expectedCases.length)
    issues.push('exact nonempty case matrix required');
  if (
    records.some(
      (record) =>
        ![baseline, candidate].includes(record.variant) || !expectedCases.includes(record.caseId)
    )
  )
    issues.push('undeclared variant/case');
  const cases = expectedCases.map((caseId) => {
    const left = records.filter(
      (record) => record.caseId === caseId && record.variant === baseline
    );
    const right = records.filter(
      (record) => record.caseId === caseId && record.variant === candidate
    );
    for (const group of [left, right]) {
      if (
        group.length !== repetitions ||
        new Set(group.map((record) => record.repetition)).size !== repetitions ||
        group.some(
          (record) =>
            !Number.isSafeInteger(record.repetition) ||
            record.repetition < 1 ||
            record.repetition > repetitions
        )
      )
        issues.push(`${caseId}: missing/duplicate repetition`);
    }
    const all = [...left, ...right];
    for (const group of [left, right]) {
      if (
        group.some(
          (record) =>
            !record.prompt ||
            record.prompt.schema !== 'gennady.authoring-instruction-envelope.1' ||
            !Number.isSafeInteger(record.prompt.bytes) ||
            record.prompt.bytes <= 0 ||
            !Number.isSafeInteger(record.prompt.approximateTokens) ||
            record.prompt.approximateTokens <= 0 ||
            !/^[a-f0-9]{64}$/.test(record.prompt.digest)
        ) ||
        new Set(group.map((record) => record.prompt?.digest)).size !== 1 ||
        new Set(group.map((record) => record.prompt?.bytes)).size !== 1
      )
        issues.push(`${caseId}: missing/invalid/mixed instruction footprint`);
      if (
        group.some(
          (record) => !['pass', 'fail', 'inconclusive'].includes(record.semanticVerdict ?? '')
        )
      )
        issues.push(`${caseId}: missing semantic assessment`);
    }
    for (const field of [
      'taskDigest',
      'oracleDigest',
      'harnessDigest',
      'environmentDigest',
    ] as const) {
      if (
        all.some((record) => !/^[a-f0-9]{64}$/.test(record[field])) ||
        new Set(all.map((record) => record[field])).size !== 1
      )
        issues.push(`${caseId}: incomparable ${field}`);
    }
    if (
      all.some(
        (record) =>
          record.dirty ||
          !/^[a-f0-9]{40}$/.test(record.sourceCommit) ||
          !record.modelVerified ||
          !record.environmentVerified ||
          record.model !== 'llm-proxy/deepseek-v4-flash'
      )
    )
      issues.push(`${caseId}: dirty/unverified source, environment or model`);
    if (
      [left, right].some((group) => new Set(group.map((record) => record.sourceCommit)).size !== 1)
    )
      issues.push(`${caseId}: mixed source revisions within variant`);
    const summarize = (group: AuthoringObservation[]) => {
      const usable = group.filter(
        (record) =>
          Number.isFinite(record.durationMs) &&
          record.durationMs! > 0 &&
          Number.isFinite(record.nonCacheTokens) &&
          record.nonCacheTokens! > 0 &&
          Number.isSafeInteger(record.metrics.tools) &&
          record.metrics.tools > 0
      );
      if (usable.length !== group.length)
        issues.push(`${caseId}: missing/invalid speed/token metrics`);
      return {
        runs: group.length,
        artifactPasses: group.filter((record) => record.artifactPass).length,
        semanticPasses: group.filter((record) => record.semanticVerdict === 'pass').length,
        trajectoryPasses: group.filter((record) => record.trajectoryPass).length,
        promptBytes: group[0]?.prompt?.bytes ?? null,
        approximatePromptTokens: group[0]?.prompt?.approximateTokens ?? null,
        totalTools: group.reduce((sum, record) => sum + record.metrics.tools, 0),
        maxTools: group.length ? Math.max(...group.map((record) => record.metrics.tools)) : null,
        medianTools: group.length ? median(group.map((record) => record.metrics.tools)) : null,
        medianDurationMs: usable.length ? median(usable.map((record) => record.durationMs!)) : null,
        durationRangeMs: usable.length
          ? [
              Math.min(...usable.map((r) => r.durationMs!)),
              Math.max(...usable.map((r) => r.durationMs!)),
            ]
          : null,
        medianNonCacheTokens: usable.length
          ? median(usable.map((record) => record.nonCacheTokens!))
          : null,
      };
    };
    return { caseId, baseline: summarize(left), candidate: summarize(right) };
  });
  const regressions = cases
    .filter(
      (row) =>
        row.candidate.artifactPasses < row.baseline.artifactPasses ||
        row.candidate.semanticPasses < row.baseline.semanticPasses ||
        row.candidate.trajectoryPasses < row.baseline.trajectoryPasses ||
        row.candidate.totalTools > row.baseline.totalTools ||
        (row.candidate.medianTools ?? Infinity) > (row.baseline.medianTools ?? Infinity) ||
        (row.candidate.maxTools ?? Infinity) > (row.baseline.maxTools ?? Infinity) ||
        (row.candidate.promptBytes ?? Infinity) > (row.baseline.promptBytes ?? Infinity)
    )
    .map((row) => row.caseId);
  return {
    protocol: 'gennady.authoring-comparison.2',
    comparable: issues.length === 0,
    issues: [...new Set(issues)],
    cases,
    regressions,
    successCriteria:
      'smaller static instruction envelope; no per-case artifact/semantic/path regression; no tool-call total/median/max growth',
    promptShrank: cases.some(
      (row) =>
        row.candidate.promptBytes !== null &&
        row.baseline.promptBytes !== null &&
        row.candidate.promptBytes < row.baseline.promptBytes
    ),
    recommendation: issues.length
      ? 'inconclusive'
      : regressions.length
        ? 'reject'
        : cases.some(
              (row) =>
                row.candidate.promptBytes !== null &&
                row.baseline.promptBytes !== null &&
                row.candidate.promptBytes < row.baseline.promptBytes
            )
          ? 'review-measured-results'
          : 'no-prompt-reduction',
    inference:
      'descriptive only; no general speed/quality guarantee or statistical significance claim',
    monetaryCost: 'unknown',
  };
}
