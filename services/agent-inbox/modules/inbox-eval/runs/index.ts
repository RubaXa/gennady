// @file: Barrel export for all 10 eval runners
// @spec: AGENT-INBOX-INBOX-EVAL
// @consumers: EvalHarness (IE-harness)

export { type EvalRunContext, type EvalRun, pass, fail } from './context.ts';
export { runEval as runBoot } from './boot.run.ts';
export { runEval as runRolePickup } from './role-pickup.run.ts';
export { runEval as runPipeline } from './pipeline.run.ts';
export { runEval as runEvents } from './events.run.ts';
export { runEval as runChat } from './chat.run.ts';
export { runEval as runEffects } from './effects.run.ts';
export { runEval as runAutonomy } from './autonomy.run.ts';
export { runEval as runParallel } from './parallel.run.ts';
export { runEval as runCrashRecovery } from './crash-recovery.run.ts';
export { runEval as runCoverageGate } from './coverage-gate.run.ts';
