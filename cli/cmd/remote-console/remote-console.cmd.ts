#!/usr/bin/env node

import open from 'open';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { startRemoteConsoleServer } from '../../../services/remote-console/remote-console.ts';

/** @purpose Defines parsed CLI arguments for remote-console command execution. */
export type RemoteConsoleCommandArgs = {
  /** @purpose Overrides default server port when provided by operator. */
  port?: number;

  /** @purpose Overrides default loopback bind host for server startup. */
  host?: string;

  /** @purpose Provides optional page URL to open with remote-console activation flag. */
  url?: string;
};

/** @purpose Describes injectable dependencies for command testing and runtime orchestration. */
export type RemoteConsoleCommandDeps = {
  /** @purpose Starts remote-console server runtime and returns lifecycle handle. */
  startServer: typeof startRemoteConsoleServer;

  /** @purpose Opens target URL in default browser process. */
  openBrowser: (targetUrl: string) => Promise<unknown>;

  /** @purpose Emits informational command diagnostics for operator feedback. */
  info: (...args: unknown[]) => void;

  /** @purpose Emits degraded-path diagnostics when optional browser opening fails. */
  warn: (...args: unknown[]) => void;
};

/**
 * @purpose Runs remote-console CLI command, starts server and optionally opens a browser URL with activation flag.
 * @param argv Process argv or compatible command argument list.
 * @param deps Optional dependency overrides for deterministic tests.
 * @sideEffect Network: starts HTTP server runtime for remote console envelopes.
 * @sideEffect Process: writes startup diagnostics to stdout.
 * @sideEffect OS: opens default browser when --url is passed.
 */
export async function runRemoteConsoleCommand(
  argv: string[],
  deps: RemoteConsoleCommandDeps = {
    startServer: startRemoteConsoleServer,
    openBrowser: open,
    info: (...args: unknown[]) => console.info(...args),
    warn: (...args: unknown[]) => console.warn(...args),
  }
): Promise<void> {
  const args = parseRemoteConsoleCommandArgs(argv);
  const server = await deps.startServer({
    port: args.port ?? 43_001,
    host: args.host,
    exitCode: 0,
  });

  deps.info(`[remote-console] listening on ${server.url}`);
  deps.info('[remote-console] browser client: remoteConsoleClient.connect(console, { url })');

  if (!args.url) {
    return;
  }

  try {
    const activationUrl = composeRemoteConsoleActivationUrl(args.url);
    await deps.openBrowser(activationUrl);
    deps.info(`[remote-console] opened ${activationUrl}`);
  } catch (cause) {
    deps.warn('[remote-console] failed to open browser URL, server is still running', { cause });
  }
}

/**
 * @purpose Parses command arguments for remote-console startup options.
 * @param argv Raw process argument vector.
 * @returns Normalized command arguments with optional port, host and url values.
 */
export function parseRemoteConsoleCommandArgs(argv: string[]): RemoteConsoleCommandArgs {
  const parsedArgs = parseArgs(argv, {
    port: ['port', 'p'],
    host: ['host'],
    url: ['url'],
  });

  const rawPort = parsedArgs.port;
  const rawHost = parsedArgs.host;
  const rawUrl = parsedArgs.url;
  const rawUrlWithEquals = argv
    .slice(2)
    .find((arg) => arg.startsWith('--url=') || arg.startsWith('-url='));
  const normalizedUrlFromArgv = rawUrlWithEquals
    ? rawUrlWithEquals.slice(rawUrlWithEquals.indexOf('=') + 1)
    : undefined;

  return {
    port: typeof rawPort === 'string' ? Number(rawPort) : undefined,
    host: typeof rawHost === 'string' ? rawHost : undefined,
    url: normalizedUrlFromArgv ?? (typeof rawUrl === 'string' ? rawUrl : undefined),
  };
}

/**
 * @purpose Adds deterministic activation query flag without dropping existing query params or hash fragment.
 * @param targetUrl Absolute browser URL provided by CLI user.
 * @throws {Error} When URL cannot be parsed as absolute URL.
 * @returns Mutated URL with `__remote_console__=1` query parameter.
 */
export function composeRemoteConsoleActivationUrl(targetUrl: string): string {
  try {
    const parsedUrl = new URL(targetUrl);
    parsedUrl.searchParams.set('__remote_console__', '1');
    return parsedUrl.toString();
  } catch (cause) {
    throw new Error(
      '[composeRemoteConsoleActivationUrl] Invalid --url value: expected absolute URL',
      {
        cause,
      }
    );
  }
}
