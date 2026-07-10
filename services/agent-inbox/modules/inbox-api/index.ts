// @file: Re-export barrel for inbox-api module — HttpServer, ports, types, and routers.
// @consumers: gennady inbox serve (CLI), inbox-dashboard, e2e tests
// @tasks: TSK-106

export { HttpServer } from './http-server.ts';
export type { HttpServerConfig } from './http-server.ts';

export { BoardProviderPort } from './board-provider.port.ts';
export { BoardProviderMock } from './board-provider.mock.ts';

export type {
  BoardData,
  RoleView,
  MrCard,
  MrDetail,
  AssignBody,
  ActionBody,
  ApiResponse,
} from './types.ts';

export { ApiError, notFound, badRequest } from './errors.ts';
export type { ApiErrorResponse } from './errors.ts';
