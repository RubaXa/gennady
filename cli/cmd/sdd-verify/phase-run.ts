// @file: Own one complete phase verification run and its atomic structured receipt lifecycle.
// @consumers: sdd-verify/index.ts
// @tasks: N/A

import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { extractSection } from '../../../shared/sdd/section.ts';
import {
  formatPhaseReceipt,
  parsePhaseReceipts,
  phaseReceiptPlanState,
  phaseReceiptTargetEvidence,
  phaseReceiptTargetState,
  phaseVerificationEnvironmentState,
  phaseVerificationPlanEnvironmentState,
  type PhaseReceipt,
  type PhaseReceiptCommand,
  type PhaseReceiptPlan,
} from '../../../shared/sdd/phase-receipt.ts';
import { run, type CoverageProbe } from './sdd-verify.cmd.ts';
import type { PhaseVerifyContext } from './phase-context.ts';
import type { GateResult, GateRunResult, GateRunner, VerifyOutcome } from './sdd-verify.types.ts';
import {
  acceptTicketOwnedWrite,
  captureTicketContainment,
  captureTargetContainment,
  createRepairMutationBoundary,
  ticketContainmentIssue,
  targetContainmentIssue,
  type TicketContainmentSnapshot,
} from './workspace-mutation.ts';
import { checkPhaseDependencies } from '../../../shared/sdd/phase-dependencies.ts';
import { phaseReceiptIssue } from './phase-receipt-validation.ts';
import {
  formatPhaseVerificationGatePlan,
  markPhaseVerificationProven,
} from '../../../shared/sdd/phase-verification-plan.ts';

/** @purpose Execute one ticket-owned command byte-for-byte and return its process result. */
type VerbatimRunner = (command: string) => GateRunResult;

function receiptError(detail: string): VerifyOutcome {
  return {
    ok: false,
    code: 'ERR_CLI_SDD_VERIFY_RECEIPT',
    exitCode: 1,
    message: `[sdd-verify] ERR_CLI_SDD_VERIFY_RECEIPT: ${detail}`,
  };
}

function receiptPattern(phase: string): RegExp {
  const fence = '`'.repeat(3);
  return new RegExp(
    `^<!--SDD_PHASE_RECEIPT:${phase}-->\\n${fence}json\\n[\\s\\S]*?\\n${fence}\\n<!--\\/SDD_PHASE_RECEIPT:${phase}-->\\n?`,
    'm'
  );
}

function atomicTicketWrite(
  path: string,
  content: string,
  containment: TicketContainmentSnapshot
): void {
  const before = ticketContainmentIssue(containment);
  if (before) throw new Error(before);
  const mode = statSync(path).mode;
  const directory = dirname(containment.canonical);
  let temp = '';
  let fd: number | undefined;
  for (let attempt = 0; attempt < 8; attempt++) {
    temp = resolve(
      directory,
      `.${basename(path)}.phase-receipt-${randomBytes(16).toString('hex')}.tmp`
    );
    try {
      fd = openSync(
        temp,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        mode & 0o777
      );
      break;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'EEXIST' || attempt === 7) throw cause;
    }
  }
  if (fd === undefined) throw new Error('cannot create an exclusive receipt temporary file');
  let tempDev: number;
  let tempIno: number;
  let tempMode: number;
  let renamed = false;
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) throw new Error('receipt temporary path is not a regular file');
    fchmodSync(fd, mode & 0o7777);
    const owned = fstatSync(fd);
    tempDev = owned.dev;
    tempIno = owned.ino;
    tempMode = owned.mode;
    writeFileSync(fd, content, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    const currentTemp = lstatSync(temp);
    if (
      !currentTemp.isFile() ||
      currentTemp.isSymbolicLink() ||
      currentTemp.dev !== tempDev ||
      currentTemp.ino !== tempIno
    ) {
      throw new Error('receipt temporary file identity changed before rename');
    }
    const beforeRename = ticketContainmentIssue(containment);
    if (beforeRename) throw new Error(beforeRename);
    renameSync(temp, path);
    renamed = true;
    const afterRename = acceptTicketOwnedWrite(containment, content, tempMode, tempDev, tempIno);
    if (afterRename) throw new Error(afterRename);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (!renamed && temp) {
      try {
        const current = lstatSync(temp);
        if (
          current.isFile() &&
          !current.isSymbolicLink() &&
          current.dev === tempDev! &&
          current.ino === tempIno!
        ) {
          unlinkSync(temp);
        }
      } catch {
        // Cleanup is ownership-checked and best-effort; never unlink a substituted path.
      }
    }
  }
}

function updateReceipt(
  path: string,
  phase: string,
  receipt: PhaseReceipt | null,
  containment: TicketContainmentSnapshot
): string | null {
  const containmentFailure = ticketContainmentIssue(containment);
  if (containmentFailure) return containmentFailure;
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch (cause) {
    return `ticket became unreadable: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  const parsed = parsePhaseReceipts(content);
  if (!parsed.ok) return parsed.issue;
  const withoutPrior = content.replace(receiptPattern(phase), '');
  if (receipt === null && withoutPrior === content) return null;
  const log = extractSection(withoutPrior, 'EXECUTION_LOG');
  if (log.status !== 'ok') return 'ticket has no writable EXECUTION_LOG section';
  const close = '<!--/SECTION:EXECUTION_LOG-->';
  const index = withoutPrior.indexOf(close);
  if (index < 0) return 'ticket has no EXECUTION_LOG close marker';
  const block = receipt === null ? '' : `${formatPhaseReceipt(receipt)}\n`;
  const next = withoutPrior.slice(0, index) + block + withoutPrior.slice(index);
  try {
    atomicTicketWrite(path, next, containment);
    return null;
  } catch (cause) {
    return `cannot atomically update ticket: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

function planFor(root: string, context: PhaseVerifyContext): PhaseReceiptPlan | string {
  const environment = context.gatePlan
    ? phaseVerificationPlanEnvironmentState(root, context.gatePlan, context.verification)
    : phaseVerificationEnvironmentState(
        root,
        context.profile,
        context.producesCoverage,
        context.verification,
        context.targets.length > 0
      );
  if (!environment.ok) return environment.issue;
  return {
    ticket: context.taskPath,
    phase: context.phaseId,
    profile: context.profile,
    profileBasis: context.profileBasis,
    targets: [...context.targets],
    deletedFiles: [...context.deletedFiles],
    verification: context.verification.map((gate) => ({ ...gate })),
    ...(context.coverageOwner ? { coverageOwner: context.coverageOwner } : {}),
    producesCoverage: context.gatePlan?.producesCoverage ?? context.producesCoverage,
    environmentState: environment.state,
  };
}

function ladderCommands(results: GateResult[]): PhaseReceiptCommand[] {
  return results
    .filter((result) => result.status === 'pass')
    .map((result) => ({
      gate: result.name,
      role: result.mutates ? 'repair' : 'foundation',
      command: result.ranCommand,
      exitCode: result.exitCode,
    }));
}

/**
 * @purpose Run the one phase ladder plus applicable ticket commands, then atomically own its receipt.
 * @invariant The full environment/local-input plan is frozen before invalidation or execution. Once
 *   that preflight succeeds, the old receipt is invalidated before the first command runs.
 * @param root Project root.
 * @param context Structurally resolved phase inputs.
 * @param ladderRunner Injectable repair/foundation runner.
 * @param verbatimRunner Injectable ticket-command runner.
 * @param [coverageProbe] Optional coverage freshness boundary.
 * @returns Complete verification outcome after receipt persistence.
 */
export async function runPhaseVerification(
  root: string,
  context: PhaseVerifyContext,
  ladderRunner: GateRunner,
  verbatimRunner: VerbatimRunner,
  coverageProbe?: CoverageProbe
): Promise<VerifyOutcome> {
  // Freeze every caller-owned collection before the first asynchronous boundary. The plan below
  // is both the preflight authority and the eventual receipt payload; execution never reparses a
  // mutable caller context after validation.
  const frozenContext: PhaseVerifyContext = {
    ...context,
    targets: [...context.targets],
    deletedFiles: [...context.deletedFiles],
    verification: context.verification.map((gate) => ({ ...gate })),
  };
  if (frozenContext.gatePlan) {
    const required = frozenContext.gatePlan.gates.find(
      (gate) => gate.required && gate.state !== 'CONFIGURED'
    );
    if (required) {
      return {
        ok: false,
        code: 'SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED',
        exitCode: 1,
        message: [
          `[sdd-verify] SDD_VERIFY_PHASE_PREREQUISITE_REQUIRED: ${required.name} ${required.state}`,
          formatPhaseVerificationGatePlan(required),
        ].join('\n'),
      };
    }
  }
  const ticketPath = resolve(root, frozenContext.taskPath);
  let ticketContainment: TicketContainmentSnapshot;
  try {
    ticketContainment = captureTicketContainment(root, frozenContext.taskPath);
  } catch (cause) {
    return receiptError(
      `ticket cannot safely own an atomic receipt: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  let ticketContent: string;
  try {
    ticketContent = readFileSync(ticketPath, 'utf-8');
  } catch (cause) {
    return receiptError(
      `ticket is unreadable: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  const dependencyIssue = checkPhaseDependencies(
    ticketContent,
    frozenContext.phaseId,
    (receipt, phase) =>
      phaseReceiptIssue(root, receipt, phase, ticketPath, {
        taskPath: ticketPath,
        phase: frozenContext.phaseId,
        targets: [...frozenContext.targets, ...frozenContext.deletedFiles],
      })
  );
  if (dependencyIssue) return receiptError(dependencyIssue);
  const plan = planFor(root, frozenContext);
  if (typeof plan === 'string') return receiptError(plan);
  const invalidation = updateReceipt(ticketPath, plan.phase, null, ticketContainment);
  if (invalidation) return receiptError(invalidation);
  let targetContainment;
  try {
    targetContainment = captureTargetContainment(root, plan.targets);
  } catch (cause) {
    return receiptError(
      `cannot capture phase Target File containment: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  const ladderResults: GateResult[] = [];
  const ladder = await run(
    ladderRunner,
    plan.profile,
    coverageProbe,
    {
      targets: plan.targets,
      ...(frozenContext.specPath ? { specPath: frozenContext.specPath } : {}),
      producesCoverage: plan.producesCoverage,
      deletionOnly: plan.targets.length === 0 && plan.deletedFiles.length > 0,
      ...(frozenContext.gatePlan ? { gatePlan: frozenContext.gatePlan } : {}),
    },
    ladderResults,
    {
      repair: createRepairMutationBoundary(root),
      foundation: createRepairMutationBoundary(root, 'foundation'),
    }
  );
  if (!ladder.ok) return ladder;

  const commands = ladderCommands(ladderResults);
  const extrasBoundary = createRepairMutationBoundary(root, '§5 verification');
  let extrasSnapshot;
  try {
    extrasSnapshot = extrasBoundary.before([]);
  } catch (cause) {
    return receiptError(
      `cannot snapshot workspace before read-only §5 verification: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  let extraFailure: {
    gate: PhaseVerifyContext['verification'][number];
    exitCode: number;
    output: string;
  } | null = null;
  for (const gate of plan.verification) {
    const result = verbatimRunner(gate.command);
    if (result.exitCode !== 0) {
      extraFailure = { gate, exitCode: result.exitCode, output: result.output };
      break;
    }
    commands.push({
      gate: 'verification',
      role: gate.role,
      command: gate.command,
      exitCode: result.exitCode,
    });
  }
  const extraMutation = extrasBoundary.after(extrasSnapshot, []);
  if (!extraMutation.ok) {
    return {
      ok: false,
      code: 'ERR_CLI_SDD_VERIFY_EXTRA_FAILED',
      exitCode: 1,
      message: [
        `[sdd-verify] ❌ §5 verification must be read-only: ${extraMutation.issue}`,
        ...extraMutation.paths.map((path) => `  - ${path}`),
        '[sdd-verify] receipt not written; inspect the persistent mutations, fix the command, then start a new attempt.',
      ].join('\n'),
    };
  }
  if (extraFailure) {
    return {
      ok: false,
      code: 'ERR_CLI_SDD_VERIFY_EXTRA_FAILED',
      exitCode: 1,
      message: [
        `[sdd-verify] ❌ ${extraFailure.gate.role} verification — exit ${extraFailure.exitCode} (ran verbatim: ${extraFailure.gate.command})`,
        extraFailure.output.trim(),
        '[sdd-verify] receipt not written; fix the failure and start a new canonical phase attempt.',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  const containmentIssue = targetContainmentIssue(targetContainment);
  if (containmentIssue)
    return receiptError(
      `phase Target File containment changed before receipt: ${containmentIssue}`
    );
  const ticketIssue = ticketContainmentIssue(ticketContainment);
  if (ticketIssue) return receiptError(`ticket containment changed before receipt: ${ticketIssue}`);

  const targetState = phaseReceiptTargetState(root, plan.targets, plan.deletedFiles);
  if (!targetState.ok) return receiptError(targetState.issue);
  const targetEvidence = phaseReceiptTargetEvidence(root, plan.targets, plan.deletedFiles);
  if (!targetEvidence.ok) return receiptError(targetEvidence.issue);
  const provenPlan = frozenContext.gatePlan
    ? markPhaseVerificationProven(
        frozenContext.gatePlan,
        new Set(commands.filter((command) => command.exitCode === 0).map((command) => command.gate))
      )
    : null;
  const receipt: PhaseReceipt = {
    schema: 1,
    ...plan,
    planState: phaseReceiptPlanState(plan),
    targetState: targetState.state,
    targetEvidence: targetEvidence.evidence,
    commands,
    ...(provenPlan
      ? {
          gateEvidence: provenPlan.gates.map(({ name, state, command, provider }) => ({
            name,
            state,
            command,
            provider,
          })),
        }
      : {}),
  };
  const writeFailure = updateReceipt(ticketPath, plan.phase, receipt, ticketContainment);
  if (writeFailure) return receiptError(writeFailure);
  return {
    ok: true,
    text: [
      ladder.text,
      ...(provenPlan ? provenPlan.gates.map(formatPhaseVerificationGatePlan) : []),
      ...plan.verification.map((gate) => `  ✅ ${gate.role}: ${gate.command}`),
      `[sdd-verify] receipt recorded: ${plan.ticket}#${plan.phase}`,
    ].join('\n'),
  };
}
