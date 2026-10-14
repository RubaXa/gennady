// @file: Stable public report projection that removes runtime paths and secret-bearing command data.
// @spec: CLI-VERIFY
// @consumers: text/json Verify reporters

import path from 'node:path';
import type { VerifyRuleSnapshot } from '../model/verify-context.type.ts';
import type { VerifyRunReport } from '../model/verify-report.type.ts';
import type { LocalCommand, PlannedVerifyStep } from '../model/verify-step.type.ts';
import { createVerifyCommandIdentity } from './command-identity.ts';

function regexpEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @purpose Remove repository paths and credential forms only after private verdict/stat classification. | @param value Authored or runtime text. | @param root Canonical repository root. | @param [environment] Selected command overrides carrying known secret values. | @param [maskKnownValues] False only for fixed protocol/hash identities, never runtime prose. | @returns Safe deterministic presentation text. */
export function safeVerifyText(
  value: string,
  root: string,
  environment: Readonly<Record<string, string | undefined>> = {},
  maskKnownValues = true
): string {
  let text = value;
  const secrets = new Set(
    maskKnownValues
      ? Object.entries({ ...process.env, ...environment }).flatMap(([key, secret]) => {
          if (
            !/(?:^|_)(?:TOKEN|PASSWORD|SECRET|AUTHORIZATION|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CLIENT_?SECRET|CREDENTIAL)(?:_|$)/i.test(
              key
            ) ||
            !secret
          )
            return [];
          const variants = [secret, JSON.stringify(secret).slice(1, -1)];
          try {
            variants.push(encodeURIComponent(secret));
          } catch {
            /* JSON may carry a lone surrogate; raw/JSON variants remain masked. */
          }
          return variants;
        })
      : []
  );
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join('[redacted]');
    const marker = text.lastIndexOf('\n[truncated');
    if (marker >= 0 && secret.length >= 4) {
      const prefix = text.slice(0, marker);
      const start = prefix.lastIndexOf(secret.slice(0, 4));
      const suffix = start < 0 ? '' : prefix.slice(start);
      if (suffix.length >= 4 && suffix.length < secret.length && secret.startsWith(suffix))
        text = `${prefix.slice(0, start)}[redacted]${text.slice(marker)}`;
    }
  }
  text = text.replace(new RegExp(regexpEscape(root), 'g'), '.');
  return text
    .replace(/\b([a-z][a-z\d+.-]*:\/\/)[^/\s@]+@/gi, '$1[redacted]@')
    .replace(
      /\b(?:gh[pousr]_[A-Za-z\d]{12,}|github_pat_[A-Za-z\d_]+|sk-[A-Za-z\d_-]{12,})\b/g,
      '[redacted]'
    )
    .replace(/\b(Bearer)\s+[^\s,;]+/gi, '$1 [redacted]')
    .replace(
      /--(token|password|secret|authorization|api[_-]?key)(?:=|\s+)(?:"(?:\\.|[^"\\\r\n])*(?:"|(?=\r?\n|$))|'[^'\r\n]*(?:'|(?=\r?\n|$))|[^\s,;]+)/gi,
      '--$1=[redacted]'
    )
    .replace(
      /\b([\w-]*(?:token|password|secret|authorization|api[_-]?key))(["']?)\s*([=:])\s*("(?:\\.|[^"\\\r\n])*(?:"|(?=\r?\n|$))|'[^'\r\n]*(?:'|(?=\r?\n|$))|(?:(?:Basic|Bearer)\s+)?[^\s,;}\]]+)/gi,
      (_match, key: string, quote: string, delimiter: string, content: string) =>
        `${key}${quote}${delimiter}${content.startsWith('"') ? '"[redacted]"' : content.startsWith("'") ? "'[redacted]'" : '[redacted]'}`
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
  return {
    identity: createVerifyCommandIdentity(command, root),
    cwd: relativePath(root, command.cwd),
    timeoutMs: command.timeoutMs,
    environmentKeys: Object.keys(command.env ?? {}).sort(),
  };
}

function stepProjection(step: PlannedVerifyStep, root: string): Record<string, unknown> {
  const safe = (text: string) => safeVerifyText(text, root, step.command?.env);
  return {
    id: step.id,
    plugin: step.plugin,
    ...(step.provenance === undefined ? {} : { provenance: safe(step.provenance) }),
    tags: step.tags,
    needs: step.needs,
    executor: step.executor,
    effect: step.effect,
    ...(step.command === undefined
      ? {}
      : {
          command: commandProjection(
            { ...step.command, timeoutMs: Math.min(step.timeoutMs, step.command.timeoutMs) },
            root
          ),
        }),
    requires: step.requires.map((requirement) => ({
      ...requirement,
      description: safe(requirement.description),
      fix: safe(requirement.fix),
      ...(requirement.probe === undefined
        ? {}
        : { probe: commandProjection(requirement.probe, root) }),
    })),
    ...(step.testStats === undefined
      ? {}
      : {
          testStats: {
            ...step.testStats,
            source: safe(step.testStats.source),
          },
        }),
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
              : { stdoutMatches: safe(rule.stdoutMatches) }),
            ...(rule.stderrMatches === undefined
              ? {}
              : { stderrMatches: safe(rule.stderrMatches) }),
            ...(rule.outputMatches === undefined
              ? {}
              : { outputMatches: safe(rule.outputMatches) }),
            hint: safe(rule.hint),
            ...(rule.source === undefined ? {} : { source: safe(rule.source) }),
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
      id: selection.id,
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
          identity: safeVerifyText(item.identity, root, {}, false),
          summary: safeVerifyText(item.summary, root),
        })),
    ...(report.remote === undefined
      ? {}
      : {
          remote: {
            schema: report.remote.schema,
            provider: report.remote.provider,
            project: safeVerifyText(report.remote.project, root),
            definitionId: safeVerifyText(report.remote.definitionId, root),
            sourceSha: report.remote.sourceSha,
            pipelineId: safeVerifyText(report.remote.pipelineId, root),
            pipelineSha: report.remote.pipelineSha,
            rawStatus: safeVerifyText(report.remote.rawStatus, root),
            terminalState: report.remote.terminalState,
            observedAt: report.remote.observedAt,
            jobs: report.remote.jobs.map((job) => ({ ...job })),
          },
        }),
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
        ...(report.context.request.deletedFiles === undefined
          ? {}
          : {
              deletedFiles: report.context.request.deletedFiles.map((file) =>
                safeVerifyText(file, root)
              ),
            }),
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
      trust: {
        level: report.plan.trust.level,
        source: safeVerifyText(report.plan.trust.source, root),
      },
      steps: report.plan.steps.map((step) => stepProjection(step, root)),
    },
    results: report.results.map((result) => ({
      ...result,
      output: safeVerifyText(result.output, root),
      ...(result.testStats === undefined
        ? {}
        : {
            testStats: {
              ...result.testStats,
              source: safeVerifyText(result.testStats.source, root),
            },
          }),
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
