// @file: Re-export barrel for inbox-mocks module — all mock factories and their types.
// @consumers: inbox-api, inbox-dashboard, inbox-roles, inbox-opencode (dev/e2e only)
// @tasks: TSK-105

export { mockActionableMr, mockMrContext } from './mr.mock.ts';
export type { ActionableMr, MrContext } from './mr.mock.ts';

export { mockBoard } from './board.mock.ts';
export type { Board, BoardRole } from './board.mock.ts';

export { mockOpenCodeResponse } from './opencode.mock.ts';
export type { OpenCodeResponse, OpenCodeFinding } from './opencode.mock.ts';
