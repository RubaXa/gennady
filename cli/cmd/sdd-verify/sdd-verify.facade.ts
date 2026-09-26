// @file: Thin SDD-owned task/phase facade over the universal Verify planner and runner.
// @spec: CLI-SDD-VERIFY
// @consumers: sdd-verify/index.ts

import fs from 'node:fs';
import { relative } from 'node:path';
import { validateTicketReviewPaths } from '../../../shared/sdd/audit-group.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parsePhasesOverview } from '../../../shared/sdd/ticket.ts';
import { resolveTicketArg } from '../../../shared/sdd/ticket-resolve.ts';
import { resolveProjectSddVerifySelector } from '../../../shared/verify/planning/resolve-multistack.ts';
import { runVerifyCommand } from '../verify/verify.cmd.ts';

type SddFacadeOutcome = Awaited<ReturnType<typeof runVerifyCommand>>;

function failure(detail: string): SddFacadeOutcome {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `[sdd-verify] ERR_CLI_SDD_VERIFY_PHASE_CONTEXT: ${detail}\n`,
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
  const deletedFiles = [...paths.paths.deleted].sort((left, right) => left.localeCompare(right));
  const scope = {
    mode: 'files' as const,
    files: [...new Set([...paths.paths.targets, ...deletedFiles])].sort((left, right) =>
      left.localeCompare(right)
    ),
  };

  let selection: ReturnType<typeof resolveProjectSddVerifySelector>;
  try {
    selection = resolveProjectSddVerifySelector(canonicalRoot, phase.kind, {
      scope,
      ...(options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }),
    });
  } catch (cause) {
    return failure(
      `phase ${JSON.stringify(phase.id)} Verify selector cannot be resolved: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  return runVerifyCommand(
    canonicalRoot,
    { phase: selection.selector, planOnly: false, format: 'text' },
    {
      ...options,
      request: {
        scope,
        knownDeletedFiles: deletedFiles,
        workflow: {
          task: relative(canonicalRoot, resolved.path).split('\\').join('/'),
          phase: phase.id,
        },
      },
    }
  );
}
