// @file: Re-export barrel for inbox-mocks module — all mock factories, adapters, scenarios and their types.
// @consumers: inbox-api, inbox-dashboard, inbox-roles, inbox-opencode (dev/e2e only)
// @tasks: TSK-105, TSK-180

export { mockActionableMr, mockMrContext } from './mr.mock.ts';
export type { ActionableMr, MrContext } from './mr.mock.ts';

export { mockBoard } from './board.mock.ts';
export type { Board, BoardRole } from './board.mock.ts';

export { mockOpenCodeResponse } from './opencode.mock.ts';
export type { OpenCodeResponse, OpenCodeFinding } from './opencode.mock.ts';

// Adapters
export { InMemoryJournalAdapter } from './adapters/in-memory-journal.adapter.ts';
export { InMemoryArtifactAdapter } from './adapters/in-memory-artifact.adapter.ts';
export { ControlledClockAdapter } from './adapters/controlled-clock.adapter.ts';
export { MockVcsAdapter } from './adapters/mock-vcs.adapter.ts';
export type {
  MockVcsEntry,
  RecordedVcsEffect,
  ScriptedEffectOutcome,
  MockVcsEffectScript,
} from './adapters/mock-vcs.adapter.ts';
export { MockAgentAdapter } from './adapters/mock-agent.adapter.ts';
export type { ScriptedPromptResponse } from './adapters/mock-agent.adapter.ts';
export { DeterministicTaskExecutor } from './adapters/deterministic-task-executor.adapter.ts';
export { MockRuntimeProfile } from './adapters/mock-runtime-profile.adapter.ts';
export { InMemoryProjectionAdapter } from './adapters/in-memory-projection.adapter.ts';
export type { MockMrProjectionSeed } from './adapters/in-memory-projection.adapter.ts';

// Scenarios
export { ReviewScenario } from './scenarios/review-scenario.ts';
export type {
  ScenarioDefinition,
  ScenarioMrFacts,
  ScenarioAgentResult,
  ScenarioRuntime,
  ScenarioStartOptions,
} from './scenarios/review-scenario.ts';
