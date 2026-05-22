// @file: Public API surface — re-exports all model types and errors
// @consumers: all agent-mon modules
// @tasks: TSK-35

export type { AgentSession } from './agent-session.type.js';
export type { SessionChanges } from './session-changes.type.js';
export type { ScanOpts } from './scan-opts.type.js';
export type { ObserveOpts } from './observe-opts.type.js';
export type { AgentProvider } from './agent-provider.type.js';
export { DuplicateProviderError } from './errors.ts';
export { ProviderNotFoundError } from './errors.ts';
