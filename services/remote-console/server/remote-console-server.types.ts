// @file: Describes accepted command envelope variants handled by the single remote-console endpoint.
// @consumers: remote-console, remote-console-client, remote-console-server
// @tasks: N/A

import type { RemoteConsoleLogEntry } from '../client/remote-console-client.types.ts';

/** @purpose Describes accepted command envelope variants handled by the single remote-console endpoint. */
export type RemoteConsoleCommandEnvelope =
  | {
      /** @purpose Selects log-batch dispatch branch for the single endpoint. */
      type: 'logs';

      /** @purpose Optionally identifies source tab for downstream diagnostics. */
      tabId?: string;

      /** @purpose Carries ordered log entries to be rendered as stdout lines. */
      items: RemoteConsoleLogEntry[];
    }
  | {
      /** @purpose Selects controlled shutdown dispatch branch for the single endpoint. */
      type: 'disconnect';

      /** @purpose Optionally identifies source tab that requested shutdown. */
      tabId?: string;
    };

/** @purpose Defines startup options for the remote console HTTP runtime. */
export type RemoteConsoleServerOptions = {
  /** @purpose Configures the listening port for local server runtime. */
  port: number;

  /** @purpose Overrides bind host; defaults to loopback-safe host when omitted. */
  host?: string;

  /** @purpose Defines process exit code used after controlled disconnect shutdown. */
  exitCode?: number;

  /** @purpose Custom line writer for tests or integration embeddings.
   * @param line Text line to write.
   */
  stdoutWrite?: (line: string) => void;

  /** @purpose Custom exit strategy for tests; defaults to process.exit in production runtime.
   * @param code Exit code to use.
   */
  exit?: (code: number) => void;
};

/** @purpose Describes the lifecycle handle returned by the server startup API. */
export type RemoteConsoleServerLifecycle = {
  /** @purpose Exposes fully resolved endpoint URL for browser client configuration. */
  url: string;

  /** @purpose Closes the listening server without forcing process termination.
   * @returns Promise that resolves when server is closed.
   */
  close: () => Promise<void>;
};
