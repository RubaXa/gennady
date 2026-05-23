// @file: remote-console
// @consumers: remote-console.cmd
// @tasks: N/A

export { remoteConsoleClient, connectRemoteConsoleClient } from './client/remote-console-client.ts';
export { serializeRemoteConsoleArg } from './client/remote-console-client-serializer.ts';
export type {
  RemoteConsoleClientConnectConfig,
  RemoteConsoleClientRuntime,
  RemoteConsoleClientTarget,
  RemoteConsoleLevel,
  RemoteConsoleLogEntry,
  RemoteConsoleSerializedArg,
} from './client/remote-console-client.types.ts';

export { startRemoteConsoleServer } from './server/remote-console-server.ts';
export { RemoteConsoleStdoutWriter } from './server/remote-console-stdout-writer.ts';
export type {
  RemoteConsoleCommandEnvelope,
  RemoteConsoleServerLifecycle,
  RemoteConsoleServerOptions,
} from './server/remote-console-server.types.ts';
