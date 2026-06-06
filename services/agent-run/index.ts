// @file: Composition root for the agent-run module — registers engines and re-exports public API.
// @consumers: CLI commands, agent consumers
// @tasks: TSK-63

import { register } from './core/registry.ts';
import { OpencodeEngine } from './engines/opencode/opencode-engine.ts';

// purpose: register opencode as the first (default) engine on module load
register(new OpencodeEngine());

export { run, listEngines } from './core/run.ts';
export type { RunOptions, RunResult, EngineStatus } from './core/run-options.type.ts';
export { AgentRunError } from './core/agent-run-error.ts';
export type { ErrorCode } from './core/agent-run-error.ts';
