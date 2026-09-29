// @file: Thin SDD-owned task/phase facade over the universal Verify planner and runner.
// @spec: CLI-SDD-VERIFY
// @consumers: sdd-verify/index.ts

import fs from 'node:fs';
import { relative } from 'node:path';
import { validateTicketReviewPaths } from '../../../shared/sdd/audit-group.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parsePhaseDetail, parsePhasesOverview } from '../../../shared/sdd/ticket.ts';
import { resolveTicketArg } from '../../../shared/sdd/ticket-resolve.ts';
import { resolveSddRuleSnapshot } from '../../../shared/rules/sdd-rule-snapshot.ts';
import { runWithSddAttemptJournal } from '../../../shared/sdd/verify/sdd-attempt-journal.ts';
import {
  bindSddReceiptCommands,
  type SddReceiptCommandBinding,
} from '../../../shared/sdd/verify/sdd-receipt-sink.ts';
import { adaptSddVerifyContext } from '../../../shared/sdd/verify/sdd-verify-context.ts';
import { resolveProjectSddVerifySelector } from '../../../shared/verify/planning/resolve-multistack.ts';
import { runVerifyCommand } from '../verify/verify.cmd.ts';
import { resolvePhaseContext } from './phase-context.ts';
import { persistLegacyPhaseReceipt } from './legacy-receipt-persistence.ts';

type SddFacadeOutcome = Awaited<ReturnType<typeof runVerifyCommand>>;

function failure(detail: string): SddFacadeOutcome {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `[sdd-verify] ERR_CLI_SDD_VERIFY_PHASE_CONTEXT: ${detail}\n`,
  };
}

function diagnosticFailure(id: string, location: string, detail: string): SddFacadeOutcome {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `[sdd-verify] ${id} severity=error location=${location}: ${detail}\n`,
  };
}

/**
 * @purpose Resolve exact SDD task/phase scope and selector, then invoke the universal Verify engine.
 * @invariant This facade reads task state but does not persist journal/receipt state; UV-12E owns
 *   attempt persistence and UV-13 owns the conditional legacy receipt overlay.
 * @param root Repository root selected by the process cwd.
 * @param task Exact ticket path or Task-ID accepted by the SDD resolver.
 * @param phaseId Exact phase identity from the ticket.
 * @param [options] Process cancellation and isolated personal-config inputs.
 * @returns The same report projection and exit semantics as `runVerifyCommand`.
 */
export async function runSddVerifyFacade(
  root: string,
  task: string,
  phaseId: string,
  options: {
    readonly signal?: AbortSignal;
    readonly cancellationSignal?: 'SIGINT' | 'SIGTERM';
    readonly homeDirectory?: string;
    readonly legacyOverlay?: { readonly provenance: string };
  } = {}
): Promise<SddFacadeOutcome> {
  let canonicalRoot: string;
  try {
    canonicalRoot = fs.realpathSync(root);
  } catch (cause) {
    return failure(
      `project root is unreadable: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  const resolved = resolveTicketArg(task, canonicalRoot);
  if (!resolved.ok) {
    const detail = 'detail' in resolved ? resolved.detail : resolved.reason;
    return failure(`cannot resolve ticket ${JSON.stringify(task)}: ${detail}`);
  }
  const overview = extractSection(resolved.content, 'PHASES_OVERVIEW');
  if (overview.status !== 'ok') return failure('ticket has no readable PHASES_OVERVIEW');
  const phases = parsePhasesOverview(overview.content);
  const phaseIndex = phases.findIndex((candidate) => candidate.id === phaseId);
  const phase = phases[phaseIndex];
  if (phase === undefined) {
    return failure(`phase ${JSON.stringify(phaseId)} is absent from the ticket`);
  }
  const phaseSection = extractSection(resolved.content, `PHASE_${phase.id}`);
  if (phaseSection.status !== 'ok') {
    return failure(`phase ${JSON.stringify(phase.id)} has no readable PHASE_${phase.id} section`);
  }
  const executionLog = extractSection(resolved.content, 'EXECUTION_LOG');
  if (executionLog.status !== 'ok' && executionLog.status !== 'empty') {
    return failure('ticket has no unique readable EXECUTION_LOG');
  }

  try {
    return await runWithSddAttemptJournal({
      root: canonicalRoot,
      ticketPath: resolved.path,
      sddPhase: phase.id,
      ...(options.legacyOverlay === undefined
        ? {}
        : {
            legacyOverlay: {
              enabled: true as const,
              provenance: options.legacyOverlay.provenance,
            },
          }),
      run: async () => {
        const paths = validateTicketReviewPaths(canonicalRoot, resolved.content, {
          phaseIds: [phase.id],
          targetExpectation: 'existing',
          deletedPhaseIds: phases.slice(0, phaseIndex + 1).map((candidate) => candidate.id),
          handoffPhaseIds: [],
        });
        if (!paths.ok) {
          return failure(
            `${relative(canonicalRoot, resolved.path)} declares invalid path ${JSON.stringify(paths.path)}: ${paths.detail}`
          );
        }
        const deletedFiles = [...paths.paths.deleted].sort((left, right) =>
          left.localeCompare(right)
        );
        const scope = {
          mode: 'files' as const,
          files: [...new Set([...paths.paths.targets, ...deletedFiles])].sort((left, right) =>
            left.localeCompare(right)
          ),
        };
        let ruleDispatch: ReturnType<typeof resolveSddRuleSnapshot>;
        try {
          const detail = parsePhaseDetail(phaseSection.content);
          const ticketPath = relative(canonicalRoot, fs.realpathSync(resolved.path))
            .split('\\')
            .join('/');
          ruleDispatch = resolveSddRuleSnapshot({
            root: canonicalRoot,
            declaredSources: detail.rules,
            declarationFile: ticketPath,
            declarationProvenance: `${ticketPath}#PHASE_${phase.id}.Rules`,
            targetFiles: paths.paths.targets,
            plannedFiles: paths.paths.targets,
            tombstoneFiles: deletedFiles,
            intents: [phase.kind],
          });
        } catch (cause) {
          return failure(
            `phase ${JSON.stringify(phase.id)} RuleSnapshot cannot be resolved before Verify: ${cause instanceof Error ? cause.message : String(cause)}`
          );
        }

        let selection: ReturnType<typeof resolveProjectSddVerifySelector>;
        try {
          selection = resolveProjectSddVerifySelector(canonicalRoot, phase.kind, {
            scope,
            ...(options.homeDirectory === undefined
              ? {}
              : { homeDirectory: options.homeDirectory }),
          });
        } catch (cause) {
          return failure(
            `phase ${JSON.stringify(phase.id)} Verify selector cannot be resolved: ${cause instanceof Error ? cause.message : String(cause)}`
          );
        }

        let legacyContext: ReturnType<typeof adaptSddVerifyContext> | undefined;
        if (options.legacyOverlay !== undefined) {
          const legacyPhase = resolvePhaseContext(
            relative(canonicalRoot, resolved.path),
            phase.id,
            canonicalRoot
          );
          if (!legacyPhase.ok)
            return diagnosticFailure(
              'ERR_CLI_SDD_VERIFY_PHASE_CONTEXT',
              `${relative(canonicalRoot, resolved.path)}#${phase.id}`,
              legacyPhase.message
            );
          const required = legacyPhase.context.gatePlan?.gates.find(
            (gate) => gate.required && gate.state !== 'CONFIGURED' && gate.state !== 'PROVEN'
          );
          if (required !== undefined) {
            return diagnosticFailure(
              'SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED',
              `${legacyPhase.context.taskPath}#${legacyPhase.context.phaseId}`,
              `${required.name} ${required.state}`
            );
          }
          legacyContext = adaptSddVerifyContext(canonicalRoot, legacyPhase.context);
          if (!legacyContext.ok) {
            return diagnosticFailure(
              legacyContext.diagnostic.id,
              legacyContext.diagnostic.location,
              legacyContext.diagnostic.message
            );
          }
        }

        let legacyBindings: readonly SddReceiptCommandBinding[] = [];
        const outcome = await runVerifyCommand(
          canonicalRoot,
          { phase: selection.selector, planOnly: false, format: 'text' },
          {
            ...options,
            request: {
              scope,
              knownDeletedFiles: deletedFiles,
              rules: ruleDispatch.snapshot,
              workflow: {
                task: relative(canonicalRoot, resolved.path).split('\\').join('/'),
                phase: phase.id,
              },
            },
            ...(legacyContext === undefined || !legacyContext.ok
              ? {}
              : {
                  sdd: {
                    context: legacyContext.context,
                    bindings: (
                      plan: Parameters<typeof bindSddReceiptCommands>[1],
                      readiness: Parameters<typeof bindSddReceiptCommands>[3]
                    ) => {
                      const bound = bindSddReceiptCommands(
                        canonicalRoot,
                        plan,
                        legacyContext.context,
                        readiness
                      );
                      if (bound.ok) legacyBindings = bound.bindings;
                      return bound;
                    },
                    beforeFirstAttempt: {
                      run: () =>
                        persistLegacyPhaseReceipt(
                          canonicalRoot,
                          legacyContext.context.receiptPlan.ticket,
                          legacyContext.context.receiptPlan.phase,
                          null
                        ),
                      writes: {
                        root: canonicalRoot,
                        include: [legacyContext.context.receiptPlan.ticket],
                        exclude: ['.git/**'],
                      },
                    },
                    persist: (receipt: Parameters<typeof persistLegacyPhaseReceipt>[3]) =>
                      persistLegacyPhaseReceipt(
                        canonicalRoot,
                        legacyContext.context.receiptPlan.ticket,
                        legacyContext.context.receiptPlan.phase,
                        receipt
                      ),
                  },
                }),
          }
        );
        if (legacyContext === undefined || !legacyContext.ok || outcome.report === undefined) {
          return outcome;
        }
        const failed = legacyBindings.find((binding) =>
          ('stepIds' in binding ? binding.stepIds : [binding.stepId]).some((stepId) =>
            outcome.report!.results.some(
              (result) => result.stepId === stepId && result.status !== 'pass'
            )
          )
        );
        if (failed === undefined) return outcome;
        const id =
          failed.source === 'verification'
            ? 'ERR_CLI_SDD_VERIFY_EXTRA_FAILED'
            : 'ERR_CLI_SDD_VERIFY_GATE_FAILED';
        return {
          ...outcome,
          stdout: '',
          stderr: `[sdd-verify] ${id} severity=error location=${legacyContext.context.receiptPlan.ticket}#${phase.id}: ${('stepIds' in failed ? failed.stepIds : [failed.stepId]).join(',')} did not pass\n`,
        };
      },
    });
  } catch (cause) {
    return failure(cause instanceof Error ? cause.message : String(cause));
  }
}
