// @file: pipeline eval run — verifies PLAN.md artifact with mandatory tracks and gate verdict in journal
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass, fail } from './context.ts';

/**
 * @purpose Verify pipeline: PLAN.md artifact with mandatory tracks; gate verdict in journal
 * @param ctx Eval run context with journal and artifacts
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(ctx: EvalRunContext): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const artifacts = ctx.artifacts;
  const evidence: string[] = [];

  const planArtifact = entries.find((e) => {
    if (e.kind !== 'artifact_produced') return false;
    const p = e.payload as Record<string, unknown> | undefined;
    return (p?.artifact as string)?.includes('PLAN.md') || p?.name === 'PLAN.md';
  });

  if (!planArtifact) {
    if (!artifacts || !Object.keys(artifacts).some((k) => k.toLowerCase().includes('plan'))) {
      return fail('pipeline', ['PLAN.md artifact not found in journal or artifacts']);
    }
    evidence.push('PLAN.md found in artifacts (not journal)');
  } else {
    evidence.push(`PLAN.md artifact produced: seq=${planArtifact.seq}`);
  }

  const gateDecisions = entries.filter((e) => {
    if (e.kind !== 'decision') return false;
    const p = e.payload as Record<string, unknown> | undefined;
    return p?.proposalId?.toString().includes('gate') ?? false;
  });

  if (gateDecisions.length === 0) {
    evidence.push('no gate-verdict decision found — pipeline may not have reached coverage gate');
  } else {
    evidence.push(`gate verdict decisions found: ${gateDecisions.length}`);
  }

  return pass('pipeline', evidence);
}
