// @file: Defines the supported browser console levels for remote mirroring.
// @consumers: remote-console, remote-console-client, remote-console-client-serializer, remote-console-server.types, remote-console-stdout-writer
// @tasks: N/A

/** @purpose Defines the supported browser console levels for remote mirroring. */
export type RemoteConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/**
 * @purpose Describes one serialized console argument in a transport-safe and printable form.
 * @consumer RemoteConsoleClient, RemoteConsoleStdoutWriter
 */
export type RemoteConsoleSerializedArg = {
  /** @purpose Declares whether the value was primitive or required a tagged fallback descriptor. */
  kind: 'primitive' | 'tagged';

  /** @purpose Stores the deterministic text representation for stdout rendering. */
  text: string;

  /** @purpose Carries Object.prototype.toString tag for tagged values when available. */
  tag?: string;
};

/**
 * @purpose Captures one browser console invocation as an ordered transport entry.
 * @consumer RemoteConsoleHttpServer
 */
export type RemoteConsoleLogEntry = {
  /** @purpose Mirrors the source logging level used in console call. */
  level: RemoteConsoleLevel;

  /** @purpose Stores event time as Unix epoch milliseconds for stable ordering in a batch. */
  timestamp: number;

  /** @purpose Preserves source argument order after safe serialization. */
  args: RemoteConsoleSerializedArg[];

  /** @purpose Optionally marks originating tab identity for diagnostics correlation. */
  tabId?: string;

  /** @purpose Optionally marks source branch identity for diagnostics correlation. */
  branch?: string;
};

/**
 * @purpose Provides URL-centric browser connection options for remote console transport.
 * @consumer Browser page runtime
 */
export type RemoteConsoleClientConnectConfig = {
  /** @purpose Stores absolute endpoint used for both logs and disconnect envelopes. */
  url: string;

  /** @purpose Carries optional source marker copied into outgoing log entries. */
  tabId?: string;

  /** @purpose Carries optional branch marker copied into outgoing log entries. */
  branch?: string;
};

/** @purpose Declares runtime controls published on patched console targets. */
export type RemoteConsoleClientRuntime = {
  /** @purpose Stops batching, attempts final flush and sends disconnect envelope exactly once. */
  disconnect: () => Promise<void>;
};

/**
 * @purpose Describes a console-compatible patch target that can expose remote runtime controls.
 * @consumer remoteConsoleClient.connect
 */
export type RemoteConsoleClientTarget = {
  /** @purpose Receives plain log-level messages while patched runtime mirrors entries remotely. */
  log: (...args: unknown[]) => unknown;
  /** @purpose Receives info-level messages while patched runtime mirrors entries remotely. */
  info: (...args: unknown[]) => unknown;
  /** @purpose Receives warning-level messages while patched runtime mirrors entries remotely. */
  warn: (...args: unknown[]) => unknown;
  /** @purpose Receives error-level messages while patched runtime mirrors entries remotely. */
  error: (...args: unknown[]) => unknown;
  /** @purpose Receives debug-level messages while patched runtime mirrors entries remotely. */
  debug: (...args: unknown[]) => unknown;

  /** @purpose Exposes injected remote runtime controls after successful connect. */
  __remote__?: RemoteConsoleClientRuntime;
};
