// @file: dry-run journal — process-wide sink for INBOX_DRY_RUN external-write suppressions. When
//   dry-run is on, the two external-write seams (VCS mutation via EffectExecutor, operator DM via
//   RightsEscalator.notifyReady) route their intended payload here INSTEAD of hitting the outside
//   world. Each suppressed write is logged server-side and, when a broadcaster is registered (the
//   running HttpServer wires one to its SseHub), fanned out to every connected dashboard so the SPA
//   surfaces it in the browser console.
// @consumers: EffectExecutor, RightsEscalator, HttpServer (broadcaster), bootstrap (enable), serve.cmd
// @tasks: TSK-131

import { logger } from '#logger';

/** @purpose Which external-write seam a suppressed payload came from. */
export type DryRunChannel = 'mr' | 'dm';

/** @purpose One suppressed external write — `line` already carries the `DRY-RUN …` prefix. */
export type DryRunEntry = {
  /** @purpose Originating seam */
  channel: DryRunChannel;
  /** @purpose Human-readable line, prefixed `DRY-RUN ` — logged and broadcast verbatim */
  line: string;
};

/** @purpose Sink a registered consumer (the HttpServer's SSE hub) plugs in to receive suppressed writes. */
export type DryRunBroadcaster = (entry: DryRunEntry) => void;

/** @purpose Process-wide enable flag; seeded from `INBOX_DRY_RUN` env, overridable via `setDryRun`. */
let _enabled = _readEnvFlag();

/** @purpose Optional live broadcaster — set by the running server, cleared on shutdown. */
let _broadcaster: DryRunBroadcaster | null = null;

/**
 * @purpose Read the `INBOX_DRY_RUN` env flag (accepts `1`/`true`, case-insensitive).
 * @returns Whether dry-run is enabled by the environment.
 */
function _readEnvFlag(): boolean {
  const raw = (process.env.INBOX_DRY_RUN ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * @purpose Turn dry-run on/off explicitly (bootstrap `dryRun` option) — also keeps `INBOX_DRY_RUN`
 *   in sync so child code that only reads the env agrees with an explicitly-configured server.
 * @param on Whether dry-run should be enabled.
 * @sideEffect Mutates module state and `process.env.INBOX_DRY_RUN`.
 */
export function setDryRun(on: boolean): void {
  _enabled = on;
  process.env.INBOX_DRY_RUN = on ? '1' : '0';
}

/**
 * @purpose Whether external writes are currently suppressed.
 * @returns True when dry-run is enabled (env or explicit `setDryRun`).
 */
export function isDryRun(): boolean {
  return _enabled;
}

/**
 * @purpose Register (or clear with `null`) the live broadcaster the server uses to fan suppressed
 *   writes out to connected dashboards.
 * @param fn Broadcaster to receive every subsequent `emitDryRun`, or null to detach.
 * @sideEffect Mutates module state.
 */
export function setDryRunBroadcaster(fn: DryRunBroadcaster | null): void {
  _broadcaster = fn;
}

/**
 * @purpose Record one suppressed external write — the real code path's final, irreversible call is
 *   replaced by this. Always logs; also broadcasts when a sink is registered.
 * @param channel Originating seam (`mr` VCS mutation | `dm` operator message).
 * @param summary The payload description WITHOUT the `DRY-RUN ` prefix, e.g. `post→MR <ref>: <body>`.
 * @sideEffect Writes a log line; invokes the registered broadcaster (if any).
 */
export function emitDryRun(channel: DryRunChannel, summary: string): void {
  const line = `DRY-RUN ${summary}`;
  logger.info(`[dry-run] ${line}`);
  _broadcaster?.({ channel, line });
}
