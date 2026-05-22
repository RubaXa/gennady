// @file: Barrel re-export for the state module.
// @consumers: cmd/agent-mon, ui
// @tasks: TSK-45

export { createStateManager } from './create-state-manager.ts';
export type { StateManager } from './create-state-manager.ts';
export type { ViewModel, ProviderColumn, SessionCard } from './view-model.type.ts';
export { groupByProvider } from './group-by-provider.ts';
export { isWaitingForUser } from './is-waiting.ts';
