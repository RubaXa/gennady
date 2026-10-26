// @file: Per-call research ledger separating observable purpose, retained result and counterfactual hypotheses.
// @spec: AI-SKILLS
// @consumers: authoring baseline investigation; bounded optimization pilots

import {
  profileAuthoringTrajectory,
  type AuthoringProfileContext,
} from './authoring-trajectory-profile.ts';
import type { Trajectory, ToolEvent } from './trajectory.ts';

export type AuthoringAuditContext = AuthoringProfileContext & { requiredContextPaths: string[] };

/** @purpose Review every call without turning an inferred purpose, repeated read or reflection into proof of waste. */
export function auditAuthoringCalls(trajectory: Trajectory, context: AuthoringAuditContext) {
  const profile = profileAuthoringTrajectory(trajectory, context);
  const calls = profile.calls.map((call) => {
    const event = trajectory.events[call.order] as ToolEvent;
    const roles: string[] = [];
    const add = (role: string) => {
      if (!roles.includes(role)) roles.push(role);
    };
    let purpose = 'Unknown: retained action does not establish the information sought.';
    let assessment = 'unknown';
    if (call.tool === 'read' && call.path) {
      add('read-context');
      if (context.requiredContextPaths.includes(call.path) || call.path === profile.target) {
        purpose =
          'Load task-declared context or current target; contract-related, not proof every range was needed.';
        assessment = 'contract-related';
      } else {
        purpose =
          'Read reference/instruction context; relevance is observable, necessity needs review.';
        assessment = 'review-context';
      }
    } else if (['write', 'edit'].includes(call.tool)) {
      add(call.tool === 'write' ? 'whole-write-attempt' : 'partial-edit-attempt');
      purpose =
        call.path === profile.target
          ? 'Author the declared target.'
          : 'Attempt a mutation outside the proven target identity.';
      assessment =
        call.path === profile.target && call.tool === 'write'
          ? 'contract-related'
          : 'review-mutation';
    } else if (call.category === 'create') {
      add('canonical-create');
      purpose = 'Create the requested canonical skeleton and obtain its manifest.';
      assessment = 'contract-related';
    } else if (call.category === 'manifest') {
      add('manifest');
      purpose = 'Request section metadata; inspect whether creation already supplied it.';
      assessment = 'review-context';
    } else if (call.category === 'check') {
      add('validation');
      purpose =
        'Check the artifact; freshness and necessity of retries need preceding mutation/result facts.';
      assessment = 'review-validation';
    } else if (['grep', 'glob', 'list'].includes(call.tool)) {
      add('discovery');
      purpose = 'Find paths or matching text; pattern/results may not be retained.';
      assessment = 'review-discovery';
    }
    // Lexical operation tags only. Do not execute, parse payloads or promote a compound exit
    // into successful results for its individual subcommands.
    const command = call.command;
    if (call.tool === 'bash' && command) {
      if (/\b(?:ls|find|pwd)\b/.test(command)) add('filesystem-discovery');
      if (/\b(?:grep|rg)\b/.test(command)) add('text-search');
      if (/\b(?:cat|sed|head|tail)\b/.test(command)) add('shell-read');
      if (/\bgit\s+(?:status|diff|log)\b/.test(command)) add('git-observation');
      if (/\bsdd-(?:check|verify)\b/.test(command)) add('validation');
      if (/\bsdd-new\b/.test(command) && !roles.includes('canonical-create'))
        add('creation-or-metadata');
      if (!roles.length) add('shell-other');
      if (assessment === 'unknown') {
        purpose =
          'Lexically observed operations: ' +
          roles.join(', ') +
          '; exact information returned is unknown.';
        assessment = 'review-shell';
      }
    }
    if (!roles.length) add(call.commandWithheld ? 'withheld-shell' : 'unknown');
    const failed = call.status === 'error' || (call.exitCode !== undefined && call.exitCode !== 0);
    if (failed) assessment = 'failed-attempt';
    const elapsedMs =
      call.startedAt !== undefined &&
      call.finishedAt !== undefined &&
      call.finishedAt >= call.startedAt
        ? call.finishedAt - call.startedAt
        : null;
    return {
      order: call.order,
      callId: call.callId ?? null,
      messageId: call.messageId ?? null,
      sessionId: call.sessionId ?? null,
      tool: call.tool,
      path: call.path ?? null,
      command: call.command ?? null,
      roles,
      purpose,
      assessment,
      status: call.status ?? 'unknown',
      exitCode: call.exitCode ?? null,
      elapsedMs,
      resultEvidence: event.observation?.output.available
        ? 'public-output-fingerprint'
        : event.diagnostic
          ? 'failure-diagnostic'
          : 'terminal-facts-only',
      requestedReadWindow: event.observation?.requestedReadWindow ?? null,
      // Deliberately don't export free-form declaredPurpose: it remains an untrusted
      // self-report on the original event, not the investigator's causal explanation.
      issues: [...call.issues],
    };
  });
  const batching = profile.possibleBatchingCandidates.map((pair) => {
    const left = calls.find((call) => call.order === pair.orders[0])!;
    const right = calls.find((call) => call.order === pair.orders[1])!;
    return {
      orders: pair.orders,
      callIds: pair.callIds,
      paths: pair.paths,
      alreadySameMessage: left.messageId === right.messageId,
      interpretation:
        'Temporal pair only; data independence, equivalent output and host read-before-write compatibility are not established.',
    };
  });
  const counts = (values: string[]) =>
    values.reduce<Record<string, number>>((out, value) => {
      out[value] = (out[value] ?? 0) + 1;
      return out;
    }, Object.create(null));
  return {
    schema: 'gennady.authoring-call-audit.1',
    caseId: context.caseId,
    total: profile.totalToolEvents,
    recorded: calls.length,
    omitted: profile.omittedToolEvents,
    complete: profile.captureComplete && !profile.omittedToolEvents,
    assessments: counts(calls.map((call) => call.assessment)),
    resultEvidence: counts(calls.map((call) => call.resultEvidence)),
    calls,
    batching,
    repeatedReadCandidates: profile.repeatReads,
    provenUnnecessary: 0,
    limitations: [
      'Contract-related means the requested operation, not a proof of its minimality or successful information transfer.',
      'No tool output body or private reasoning is reconstructed. Historical output/ranges remain unknown.',
      'Lexical shell roles can overlap; shell payloads stay withheld. A compound exit is not per-subcommand evidence.',
      'Adjacent pairs overlap: do not add them into a claimed number of removable calls.',
      'A saved millisecond interval is tool runtime, not its counterfactual wall-time cost or provider round trip.',
      'Zero proven unnecessary calls means no causal removal experiment, not that all calls were necessary.',
    ],
  };
}
