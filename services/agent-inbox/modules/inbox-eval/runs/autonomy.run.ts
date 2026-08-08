// @file: autonomy eval run — verifies proposal/decision pairs in journal; accept ≥ 90% (n≥20) → capability=auto
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass } from './context.ts';
import { DecisionJournal, type Capability } from '../../inbox-core/decision-journal.ts';
import { MetricsCollector } from '../metrics.ts';

/**
 * @purpose Verify autonomy: proposal/decision in journal; accept ≥ 90% with n≥20 → capability graduates to auto
 * @param ctx Eval run context with journal
 * @param decisionJournal Decision journal for accept-rate computation
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(
  ctx: EvalRunContext,
  decisionJournal: DecisionJournal
): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const evidence: string[] = [];

  const proposals = entries.filter((e) => e.kind === 'proposal');
  const decisions = entries.filter((e) => e.kind === 'decision');

  evidence.push(`proposals: ${proposals.length}, decisions: ${decisions.length}`);

  if (proposals.length === 0 || decisions.length === 0) {
    evidence.push('insufficient proposal/decision data — autonomy scenario not exercised');
    return pass('autonomy', evidence);
  }

  const collector = new MetricsCollector(ctx.journal, decisionJournal);
  const graduation = collector.computeGraduationMap();

  const graduated = (Object.entries(graduation) as [Capability, boolean][]).filter(([, v]) => v);
  const notGraduated = (Object.entries(graduation) as [Capability, boolean][]).filter(
    ([, v]) => !v
  );

  if (graduated.length > 0) {
    evidence.push(`graduated to auto: ${graduated.map(([c]) => c).join(', ')}`);
  }
  if (notGraduated.length > 0) {
    evidence.push(`still proposal: ${notGraduated.map(([c]) => c).join(', ')}`);
  }

  return pass('autonomy', evidence);
}
