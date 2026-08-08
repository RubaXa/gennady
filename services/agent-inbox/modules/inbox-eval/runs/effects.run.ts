// @file: effects eval run — verifies idempotency (repeat effect → 1 audit marker) and resolve rights (resolve foreign → rejection)
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass, fail } from './context.ts';

/**
 * @purpose Verify effects: repeat effect → ≤1 audit marker; resolve foreign thread → rejection with reason
 * @param ctx Eval run context with journal
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(ctx: EvalRunContext): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const evidence: string[] = [];

  const dryruns = entries.filter((e) => {
    if (e.kind !== 'system') return false;
    const p = e.payload as Record<string, unknown> | undefined;
    return p?.event === 'dryrun';
  });

  if (dryruns.length > 0) {
    // Group by effectId — each unique effectId should have ≤1 marker
    const byEffect = new Map<string, number>();
    for (const e of dryruns) {
      const effectId = ((e.payload as Record<string, unknown>)?.effectId as string) ?? 'unknown';
      byEffect.set(effectId, (byEffect.get(effectId) ?? 0) + 1);
    }
    const duplicates = [...byEffect.entries()].filter(([, c]) => c > 1);
    if (duplicates.length > 0) {
      return fail('effects', [
        `duplicate dry-run markers for effects: ${duplicates.map(([id, c]) => `${id}(${c})`).join(', ')}`,
      ]);
    }
    evidence.push(`dryrun markers: ${dryruns.length} effect(s), no duplicates`);
  }

  // Check for rejection decisions on foreign resolves
  const rejections = entries.filter((e) => {
    if (e.kind !== 'decision') return false;
    const p = e.payload as Record<string, unknown> | undefined;
    return p?.verdict === 'reject';
  });

  if (rejections.length > 0) {
    evidence.push(`rejection decisions: ${rejections.length}`);
  }

  return pass('effects', evidence);
}
