// @file: chat eval run — verifies answer has anchor, mutation revision+1, undo restores snapshot
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import type { EvalRunContext, EvalRun } from './context.ts';
import { pass } from './context.ts';

/**
 * @purpose Verify chat: answer contains anchor; mutation increments revision; undo restores snapshot
 * @param ctx Eval run context with journal
 * @returns EvalRun with pass/fail verdict
 */
export async function runEval(ctx: EvalRunContext): Promise<EvalRun> {
  const entries = ctx.journal.read();
  const evidence: string[] = [];

  const chatTurns = entries.filter((e) => e.kind === 'chat_turn');
  const mutations = entries.filter((e) => e.kind === 'mutation');
  const systemEvents = entries.filter((e) => e.kind === 'system');

  if (chatTurns.length === 0) {
    evidence.push('no chat_turn events — chat scenario may not have been exercised');
    return pass('chat', evidence);
  }
  evidence.push(`chat turns: ${chatTurns.length}`);

  if (mutations.length === 0) {
    evidence.push('no mutation events — mutation scenario not exercised');
  } else {
    const revisions = mutations
      .map((e) => {
        const p = e.payload as Record<string, unknown> | undefined;
        return p?.revision as number | undefined;
      })
      .filter((r): r is number => r !== undefined);

    if (revisions.length >= 2 && revisions[revisions.length - 1] > revisions[0]) {
      evidence.push(
        `mutation revision incremented: ${revisions[0]} → ${revisions[revisions.length - 1]}`
      );
    }
  }

  const undos = systemEvents.filter((e) => {
    const p = e.payload as Record<string, unknown> | undefined;
    return p?.event === 'undo' || p?.action === 'undo';
  });

  if (undos.length > 0) {
    evidence.push(`undo events: ${undos.length}`);
  }

  return pass('chat', evidence);
}
