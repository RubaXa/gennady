// @file: Supported normalized test-runner protocol capabilities and strict output parsers.
// @consumers: verify planner readiness, local executor
// @spec: CLI-VERIFY

import type { VerifyStepResult } from './model/verify-report.type.ts';
import type { VerifyPlan } from './model/verify-report.type.ts';
import type { VerifyReadiness } from './model/verify-readiness.type.ts';
import type { VerifyTestStatsPolicy } from './model/verify-step.type.ts';

type ParsedStats = NonNullable<VerifyStepResult['testStats']>;

const SUPPORTED = new Set([
  'node-test-summary-v1:node:test',
  'gennady-test-topology-v1:gennady-test-topology',
  'vitest-json-v1:vitest',
  'go-test-json-v1:go-test',
  'swift-test-summary-v1:swift-test',
  'xctest-summary-v1:xcodebuild',
]);

/**
 * @purpose Prove whether a declared stats policy has a matching executor-owned adapter.
 * @param policy Step-owned statistics policy and exact protocol/runner identity.
 * @returns Capability verdict and an actionable deterministic reason.
 */
export function verifyTestStatsCapability(policy: VerifyTestStatsPolicy): {
  readonly supported: boolean;
  readonly reason: string;
} {
  if (policy.policy === 'none')
    return { supported: true, reason: 'statistics explicitly disabled' };
  if (policy.protocol === undefined || policy.runner === undefined) {
    return { supported: false, reason: 'no protocol/runner adapter is declared' };
  }
  const supported = SUPPORTED.has(`${policy.protocol}:${policy.runner}`);
  return {
    supported,
    reason: supported
      ? `${policy.protocol} parses ${policy.runner}`
      : `unsupported protocol/runner pair ${policy.protocol}/${policy.runner}`,
  };
}

/**
 * @purpose Project step-owned stats and selector-trust contracts into selected-slice readiness.
 * @param plan Exact selected plan whose step and selector policies are evaluated.
 * @returns Deterministically ordered readiness entries for stats and trust capabilities.
 */
export function verifyPlanPolicyReadiness(plan: VerifyPlan): readonly VerifyReadiness[] {
  const entries: VerifyReadiness[] = [];
  for (const step of plan.steps) {
    if (step.testStats === undefined) continue;
    const capability = verifyTestStatsCapability(step.testStats);
    const missing = step.testStats.policy !== 'none' && !capability.supported;
    entries.push({
      plugin: step.plugin,
      phase: plan.phase,
      stepId: step.id,
      requirementId: `${step.id}:test-stats`,
      status:
        missing && step.testStats.policy === 'required'
          ? 'BLOCKED'
          : missing
            ? 'DEGRADED'
            : 'READY',
      message: `${step.testStats.policy} test statistics: ${capability.reason}`,
      ...(missing
        ? {
            fix: `declare a supported testStats protocol/runner for ${step.id}, or explicitly choose optional/none with provenance`,
          }
        : {}),
      policySource: step.testStats.source,
    });
  }
  if (plan.trust.level === 'remote-provider') {
    for (const plugin of [...new Set(plan.steps.map((step) => step.plugin))].sort()) {
      entries.push({
        plugin,
        phase: plan.phase,
        requirementId: `${plugin}:selector-trust`,
        status: 'BLOCKED',
        message:
          'selector requires remote-provider evidence; U5 provider watcher is not available locally',
        fix: 'run the U5 exact-SHA provider pipeline and supply its immutable pipeline identity',
        blocking: true,
        policySource: plan.trust.source,
      });
    }
  }
  return entries;
}

function integerMetric(output: string, name: string): number | null {
  const matches = [...output.matchAll(new RegExp(`^(?:#|ℹ) ${name} (\\d+)\\s*$`, 'gm'))];
  const value = matches.at(-1)?.[1];
  return value === undefined ? null : Number(value);
}

function nodeSummary(policy: VerifyTestStatsPolicy, output: string): ParsedStats | null {
  const executed = integerMetric(output, 'tests');
  const passed = integerMetric(output, 'pass');
  const failed = integerMetric(output, 'fail');
  const skipped = integerMetric(output, 'skipped') ?? 0;
  const todo = integerMetric(output, 'todo') ?? 0;
  const cancelled = integerMetric(output, 'cancelled') ?? 0;
  if (executed === null || passed === null || failed === null) return null;
  const normalizedSkipped = skipped + todo + cancelled;
  if (passed + failed + normalizedSkipped !== executed) return null;
  return {
    schema: 'gennady.verify-test-stats.v1',
    policy: policy.policy,
    protocol: policy.protocol!,
    runner: policy.runner!,
    source: policy.source,
    executed,
    passed,
    failed,
    skipped: normalizedSkipped,
  };
}

function vitestJson(policy: VerifyTestStatsPolicy, output: string): ParsedStats | null {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const result = parsed as Record<string, unknown>;
  const metrics = [
    result['numTotalTests'],
    result['numPassedTests'],
    result['numFailedTests'],
    result['numPendingTests'],
    result['numTodoTests'] ?? 0,
  ];
  if (!metrics.every((value) => Number.isSafeInteger(value) && (value as number) >= 0)) return null;
  const [executed, passed, failed, pending, todo] = metrics as [
    number,
    number,
    number,
    number,
    number,
  ];
  const skipped = pending + todo;
  if (passed + failed + skipped !== executed) return null;
  return {
    schema: 'gennady.verify-test-stats.v1',
    policy: policy.policy,
    protocol: policy.protocol!,
    runner: policy.runner!,
    source: policy.source,
    executed,
    passed,
    failed,
    skipped,
  };
}

function gennadyTestTopology(policy: VerifyTestStatsPolicy, output: string): ParsedStats | null {
  const prefix = '[gennady-test-topology-stats] ';
  const lines = output.split(/\r?\n/).filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(lines[0]!.slice(prefix.length));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const metrics = [value['executed'], value['passed'], value['failed'], value['skipped']];
  if (!metrics.every((metric) => Number.isSafeInteger(metric) && (metric as number) >= 0)) {
    return null;
  }
  const [executed, passed, failed, skipped] = metrics as [number, number, number, number];
  if (passed + failed + skipped !== executed) return null;
  return {
    schema: 'gennady.verify-test-stats.v1',
    policy: policy.policy,
    protocol: policy.protocol!,
    runner: policy.runner!,
    source: policy.source,
    executed,
    passed,
    failed,
    skipped,
  };
}

function goJson(policy: VerifyTestStatsPolicy, output: string): ParsedStats | null {
  const terminal = new Map<string, 'pass' | 'fail' | 'skip'>();
  for (const line of output.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return null;
    }
    if (typeof value !== 'object' || value === null) return null;
    const event = value as { Test?: unknown; Action?: unknown; Package?: unknown };
    if (
      typeof event.Test === 'string' &&
      typeof event.Package === 'string' &&
      (event.Action === 'pass' || event.Action === 'fail' || event.Action === 'skip')
    ) {
      terminal.set(`${event.Package}\0${event.Test}`, event.Action);
    }
  }
  const values = [...terminal.values()];
  return {
    schema: 'gennady.verify-test-stats.v1',
    policy: policy.policy,
    protocol: policy.protocol!,
    runner: policy.runner!,
    source: policy.source,
    executed: values.length,
    passed: values.filter((value) => value === 'pass').length,
    failed: values.filter((value) => value === 'fail').length,
    skipped: values.filter((value) => value === 'skip').length,
  };
}

function swiftSummary(policy: VerifyTestStatsPolicy, output: string): ParsedStats | null {
  const matches = [
    ...output.matchAll(/Executed (\d+) tests?, with (\d+) failures?(?: \(\d+ unexpected\))?/g),
  ];
  const match = matches.at(-1);
  if (match === undefined) return null;
  const executed = Number(match[1]);
  const failed = Number(match[2]);
  const skipped = [...output.matchAll(/^Test Case .* skipped /gm)].length;
  if (failed + skipped > executed) return null;
  return {
    schema: 'gennady.verify-test-stats.v1',
    policy: policy.policy,
    protocol: policy.protocol!,
    runner: policy.runner!,
    source: policy.source,
    executed,
    passed: executed - failed - skipped,
    failed,
    skipped,
  };
}

/**
 * @purpose Parse only output produced by the exact declared and supported runner protocol.
 * @param policy Step-owned statistics policy and exact protocol/runner identity.
 * @param stdout Bounded stdout captured for the declared protocol.
 * @param stderr Bounded stderr captured for the declared protocol.
 * @returns Normalized statistics when the output proves the declared protocol, otherwise null.
 */
export function parseVerifyTestStats(
  policy: VerifyTestStatsPolicy,
  stdout: string,
  stderr: string
): ParsedStats | null {
  if (!verifyTestStatsCapability(policy).supported || policy.policy === 'none') return null;
  const output = `${stdout}\n${stderr}`;
  if (policy.protocol === 'node-test-summary-v1') return nodeSummary(policy, output);
  if (policy.protocol === 'gennady-test-topology-v1') {
    return gennadyTestTopology(policy, output);
  }
  if (policy.protocol === 'vitest-json-v1') return vitestJson(policy, output);
  if (policy.protocol === 'go-test-json-v1') return goJson(policy, output);
  if (policy.protocol === 'swift-test-summary-v1' || policy.protocol === 'xctest-summary-v1') {
    return swiftSummary(policy, output);
  }
  return null;
}
