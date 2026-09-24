// @file: Stable public report projection that removes runtime paths and secret-bearing command data.
// @spec: CLI-VERIFY
// @consumers: text/json Verify reporters

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { VerifyRuleSnapshot } from '../model/verify-context.type.ts';
import type { VerifyRunReport } from '../model/verify-report.type.ts';
import type { LocalCommand, PlannedVerifyStep } from '../model/verify-step.type.ts';

function regexpEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @purpose Remove repository absolute paths and common authored secret forms from presentation text. | @param value Authored or runtime text. | @param root Canonical repository root. | @returns Safe deterministic presentation text. */
export function safeVerifyText(value: string, root: string): string {
  const withoutRoot = value.replace(new RegExp(regexpEscape(root), 'g'), '.');
  return withoutRoot
    .replace(/\b(Bearer)\s+[^\s,;]+/gi, '$1 [redacted]')
    .replace(
      /--(token|password|secret|authorization|api[_-]?key)(?:=|\s+)[^\s,;]+/gi,
      '--$1=[redacted]'
    )
    .replace(
      /\b(token|password|secret|authorization|api[_-]?key)\s*([=:])\s*[^\s,;]+/gi,
      '$1$2[redacted]'
    );
}

function relativePath(root: string, value: string): string {
  const relative = path.relative(root, value).split(path.sep).join('/');
  if (relative === '') return '.';
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    return '<external>';
  }
  return relative;
}

function commandProjection(command: LocalCommand, root: string): Record<string, unknown> {
  const normalized = {
    argv: command.argv,
    cwd: relativePath(root, command.cwd),
    env: Object.fromEntries(
      Object.entries(command.env ?? {}).sort(([left], [right]) => left.localeCompare(right))
    ),
    timeoutMs: command.timeoutMs,
  };
  return {
    identity: `sha256:${createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`,
    cwd: normalized.cwd,
    timeoutMs: command.timeoutMs,
    environmentKeys: Object.keys(command.env ?? {}).sort(),
  };
}

function stepProjection(step: PlannedVerifyStep, root: string): Record<string, unknown> {
  return {
    id: step.id,
    plugin: step.plugin,
    tags: step.tags,
    needs: step.needs,
    executor: step.executor,
    effect: step.effect,
    ...(step.command === undefined ? {} : { command: commandProjection(step.command, root) }),
    requires: step.requires.map((requirement) => ({
      ...requirement,
      description: safeVerifyText(requirement.description, root),
      fix: safeVerifyText(requirement.fix, root),
      ...(requirement.probe === undefined
        ? {}
        : { probe: commandProjection(requirement.probe, root) }),
    })),
    ...(step.outputMeansFailure === undefined
      ? {}
      : { outputMeansFailure: step.outputMeansFailure }),
    ...(step.envFail === undefined
      ? {}
      : {
          envFail: step.envFail.map((rule) => ({
            ...rule,
            ...(rule.stdoutMatches === undefined
              ? {}
              : { stdoutMatches: safeVerifyText(rule.stdoutMatches, root) }),
            ...(rule.stderrMatches === undefined
              ? {}
              : { stderrMatches: safeVerifyText(rule.stderrMatches, root) }),
            ...(rule.outputMatches === undefined
              ? {}
              : { outputMatches: safeVerifyText(rule.outputMatches, root) }),
            hint: safeVerifyText(rule.hint, root),
            ...(rule.source === undefined ? {} : { source: safeVerifyText(rule.source, root) }),
          })),
        }),
    ...(step.writes === undefined
      ? {}
      : {
          writes: {
            root: relativePath(root, step.writes.root),
            include: step.writes.include,
            ...(step.writes.exclude === undefined ? {} : { exclude: step.writes.exclude }),
          },
        }),
    ...(step.invalidates === undefined ? {} : { invalidates: step.invalidates }),
    timeoutMs: step.timeoutMs,
    onFailure: step.onFailure,
  };
}

function rulesProjection(rules: VerifyRuleSnapshot, root: string): Record<string, unknown> {
  const selections = (values: VerifyRuleSnapshot['required']) =>
    values.map((selection) => ({
      ...selection,
      reason: safeVerifyText(selection.reason, root),
      provenance: safeVerifyText(selection.provenance, root),
    }));
  return {
    digest: rules.digest,
    required: selections(rules.required),
    suggested: selections(rules.suggested),
    skipped: selections(rules.skipped),
  };
}

/**
 * @purpose Produce the deterministic machine-safe projection of one exact target report.
 * @param report Internal report retaining executable plan data.
 * @param root Canonical repository root to remove from public output.
 * @param planOnly Whether this is the compatibility no-spawn plan view.
 * @returns Fixed-order JSON-compatible document with hashed command identity and no env/argv values.
 */
export function projectVerifyReport(
  report: VerifyRunReport,
  root: string,
  planOnly: boolean
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: planOnly ? 'plan' : 'verify-run-report',
    evidence: planOnly
      ? false
      : report.evidence.map((item) => ({
          ...item,
          identity: safeVerifyText(item.identity, root),
          summary: safeVerifyText(item.summary, root),
        })),
    context: {
      request: {
        root: '.',
        phase: report.context.request.phase,
        scope: report.context.request.scope,
        ...(report.context.request.task === undefined
          ? {}
          : { task: safeVerifyText(report.context.request.task, root) }),
        ...(report.context.request.sddPhase === undefined
          ? {}
          : { sddPhase: report.context.request.sddPhase }),
      },
      plugins: report.context.plugins,
      frameworks: report.context.frameworks,
      headSha: report.context.headSha,
      rules: rulesProjection(report.context.rules, root),
    },
    readiness: {
      status: report.readiness.status,
      entries: report.readiness.entries.map((entry) => ({
        ...entry,
        message: safeVerifyText(entry.message, root),
        ...(entry.fix === undefined ? {} : { fix: safeVerifyText(entry.fix, root) }),
        ...(entry.policySource === undefined
          ? {}
          : { policySource: safeVerifyText(entry.policySource, root) }),
        ...(entry.policyReason === undefined
          ? {}
          : { policyReason: safeVerifyText(entry.policyReason, root) }),
        ...(entry.policyReasonSource === undefined
          ? {}
          : { policyReasonSource: safeVerifyText(entry.policyReasonSource, root) }),
      })),
    },
    plan: {
      phase: report.plan.phase,
      steps: report.plan.steps.map((step) => stepProjection(step, root)),
    },
    results: report.results.map((result) => ({
      ...result,
      output: safeVerifyText(result.output, root),
    })),
    mutations: report.mutations.map((mutation) => ({
      ...mutation,
      path: safeVerifyText(mutation.path, root),
      ...(mutation.previousPath === undefined
        ? {}
        : { previousPath: safeVerifyText(mutation.previousPath, root) }),
    })),
    rules: rulesProjection(report.rules, root),
    verdict: report.verdict,
  };
}
