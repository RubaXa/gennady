// @file: agent-mon root barrel — re-exports public API surface
// @consumers: CLI, external consumers
// @tasks: TSK-41

export { createMonitor } from './monitor/index.ts';
export { diff } from './diff/index.ts';
export { observe } from './observe/index.ts';

export type { AgentSession } from './model/index.ts';
export type { SessionChanges } from './model/index.ts';
export type { ScanOpts } from './model/index.ts';
export type { ObserveOpts } from './model/index.ts';
export type { AgentProvider } from './model/index.ts';

export { DuplicateProviderError } from './model/index.ts';
export { ProviderNotFoundError } from './model/index.ts';
