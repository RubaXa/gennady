import { serializeRemoteConsoleArg } from './remote-console-client-serializer.ts';
import type {
  RemoteConsoleClientConnectConfig,
  RemoteConsoleClientRuntime,
  RemoteConsoleClientTarget,
  RemoteConsoleLevel,
  RemoteConsoleLogEntry,
} from './remote-console-client.types.ts';
import type { RemoteConsoleCommandEnvelope } from '../server/remote-console-server.types.ts';

const REMOTE_CONSOLE_LEVELS: RemoteConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
const REMOTE_CONSOLE_FLUSH_INTERVAL_MS = 5_000;

/** @purpose Stores one active connection state machine for a specific patched console target. */
type RemoteConsoleClientState = {
  /** @purpose Keeps resolved endpoint URL for all command envelopes in this connection. */
  url: string;

  /** @purpose Carries optional source marker copied to log and disconnect payloads. */
  tabId?: string;

  /** @purpose Carries optional branch marker copied to log payloads for source diagnostics. */
  branch?: string;

  /** @purpose References patched console target used for local behavior preservation. */
  consoleTarget: RemoteConsoleClientTarget;

  /** @purpose Holds original console methods used for passthrough and restore on disconnect. */
  originals: Record<RemoteConsoleLevel, (...args: unknown[]) => unknown>;

  /** @purpose Buffers serialized log entries before periodic or shutdown-triggered flush. */
  queue: RemoteConsoleLogEntry[];

  /** @purpose Guards against concurrent flush overlap while one transport request is in-flight. */
  flushInFlight: boolean;

  /** @purpose Ensures transport degradation is reported locally only once to avoid error spam. */
  transportFailureNotified: boolean;

  /** @purpose Ensures duplicate connect warning is emitted exactly once per active target. */
  duplicateConnectWarned: boolean;

  /** @purpose Marks shared shutdown path start for manual and lifecycle-triggered disconnect. */
  shutdownStarted: boolean;

  /** @purpose Stores periodic flush timer id for teardown during disconnect path. */
  intervalId: ReturnType<typeof setInterval> | null;

  /** @purpose Keeps lifecycle callback that triggers unload-safe shutdown on pagehide. */
  pagehideListener: () => void;

  /** @purpose Keeps compatibility fallback callback for beforeunload shutdown trigger. */
  beforeunloadListener: () => void;

  /** @purpose Exposes public disconnect handle injected into console target runtime object. */
  runtime: RemoteConsoleClientRuntime;
};

const remoteConsoleStates = new WeakMap<RemoteConsoleClientTarget, RemoteConsoleClientState>();
/** @purpose Provides browser-lifecycle and navigator adapters in DOM and Node-like runtimes. */
const runtimeGlobal = globalThis as unknown as {
  addEventListener?: (eventName: string, listener: () => void) => void;
  removeEventListener?: (eventName: string, listener: () => void) => void;
  navigator?: {
    sendBeacon?: (url: string, payload?: unknown) => boolean;
  };
};

/**
 * @purpose Connects a console-like browser target to a remote endpoint without breaking local console behavior.
 * @param consoleTarget Console-like target to patch for log mirroring.
 * @param config URL-centric transport configuration for remote endpoint and optional source tag.
 * @throws {Error} When URL is invalid or console target does not expose required logging methods.
 * @returns Runtime controls attached to console target under `__remote__.disconnect`.
 * @sideEffect Monkey patch: replaces log/info/warn/error/debug methods on target.
 * @sideEffect Timer: starts periodic batch flush every five seconds.
 * @sideEffect Network: sends envelope commands to configured URL.
 * @sideEffect Browser lifecycle: subscribes to pagehide and beforeunload for unload-safe shutdown.
 */
export function connectRemoteConsoleClient(
  consoleTarget: RemoteConsoleClientTarget,
  config: RemoteConsoleClientConnectConfig
): RemoteConsoleClientRuntime {
  ensureConnectPreconditions(consoleTarget, config);

  const existingState = remoteConsoleStates.get(consoleTarget);
  if (existingState) {
    if (!existingState.duplicateConnectWarned) {
      existingState.duplicateConnectWarned = true;
      existingState.originals.warn(
        '[remoteConsoleClient.connect] [connected → connected] Duplicate connect ignored for existing target'
      );
    }

    return existingState.runtime;
  }

  const originals = captureOriginals(consoleTarget);
  const shutdownPath = async () => {
    const state = remoteConsoleStates.get(consoleTarget);
    if (!state) {
      return;
    }

    await disconnectRemoteConsoleClient(state, false);
  };

  const runtime: RemoteConsoleClientRuntime = {
    disconnect: shutdownPath,
  };

  const state: RemoteConsoleClientState = {
    url: config.url,
    tabId: config.tabId,
    branch: config.branch,
    consoleTarget,
    originals,
    queue: [],
    flushInFlight: false,
    transportFailureNotified: false,
    duplicateConnectWarned: false,
    shutdownStarted: false,
    intervalId: null,
    pagehideListener: () => {
      void disconnectRemoteConsoleClient(state, true);
    },
    beforeunloadListener: () => {
      void disconnectRemoteConsoleClient(state, true);
    },
    runtime,
  };

  applyConsolePatch(state);
  enqueueConnectEvent(state);
  bindLifecycleListeners(state);
  state.intervalId = setInterval(() => {
    void flushQueue(state, false);
  }, REMOTE_CONSOLE_FLUSH_INTERVAL_MS);

  consoleTarget.__remote__ = runtime;
  remoteConsoleStates.set(consoleTarget, state);

  return runtime;
}

/**
 * @purpose Public client facade exposing only browser connect API for remote-console domain.
 * @consumer Browser page runtime
 */
export const remoteConsoleClient = {
  connect: connectRemoteConsoleClient,
};

/**
 * @purpose Validates target and config before runtime patching starts.
 * @param consoleTarget Candidate console-like target.
 * @param config Candidate connect configuration.
 * @throws {Error} When URL is not absolute or target methods are missing.
 */
function ensureConnectPreconditions(
  consoleTarget: RemoteConsoleClientTarget,
  config: RemoteConsoleClientConnectConfig
): void {
  try {
    new URL(config.url);
  } catch (cause) {
    throw new Error('[remoteConsoleClient.connect] Invalid config.url: expected absolute URL', {
      cause,
    });
  }

  for (const level of REMOTE_CONSOLE_LEVELS) {
    if (typeof consoleTarget[level] !== 'function') {
      throw new Error(`[remoteConsoleClient.connect] Missing console method: ${level}`);
    }
  }
}

/**
 * @purpose Captures original methods so local behavior remains intact while wrappers are active.
 * @param consoleTarget Console-like patch target.
 * @returns Immutable map of original logging methods.
 */
function captureOriginals(
  consoleTarget: RemoteConsoleClientTarget
): Record<RemoteConsoleLevel, (...args: unknown[]) => unknown> {
  return {
    log: consoleTarget.log.bind(consoleTarget),
    info: consoleTarget.info.bind(consoleTarget),
    warn: consoleTarget.warn.bind(consoleTarget),
    error: consoleTarget.error.bind(consoleTarget),
    debug: consoleTarget.debug.bind(consoleTarget),
  };
}

/**
 * @purpose Patches log methods to preserve local output and enqueue serialized transport entries.
 * @param state Active client runtime state bound to one console target.
 */
function applyConsolePatch(state: RemoteConsoleClientState): void {
  for (const level of REMOTE_CONSOLE_LEVELS) {
    const original = state.originals[level];
    state.consoleTarget[level] = (...args: unknown[]) => {
      original(...args);
      if (state.shutdownStarted) {
        return;
      }

      state.queue.push({
        level,
        timestamp: Date.now(),
        args: args.map((arg) => serializeRemoteConsoleArg(arg)),
        tabId: state.tabId,
        branch: state.branch,
      });
    };
  }
}

/**
 * @purpose Enqueues a synthetic connect event so server stdout reflects source identity at attach time.
 * @param state Active runtime state bound to one console target.
 */
function enqueueConnectEvent(state: RemoteConsoleClientState): void {
  state.queue.push({
    level: 'info',
    timestamp: Date.now(),
    args: [
      serializeRemoteConsoleArg('[remote-console] connected'),
      serializeRemoteConsoleArg(`tabId=${state.tabId ?? 'unknown'}`),
      serializeRemoteConsoleArg(`branch=${state.branch ?? 'unknown'}`),
    ],
    tabId: state.tabId,
    branch: state.branch,
  });
}

/**
 * @purpose Restores original methods and removes injected runtime controls after disconnect.
 * @param state Active runtime state being terminated.
 */
function restoreConsolePatch(state: RemoteConsoleClientState): void {
  for (const level of REMOTE_CONSOLE_LEVELS) {
    state.consoleTarget[level] = state.originals[level];
  }

  delete state.consoleTarget.__remote__;
}

/**
 * @purpose Attaches browser lifecycle hooks for unload-triggered auto-disconnect.
 * @param state Active runtime state.
 */
function bindLifecycleListeners(state: RemoteConsoleClientState): void {
  if (typeof runtimeGlobal.addEventListener === 'function') {
    runtimeGlobal.addEventListener('pagehide', state.pagehideListener);
    runtimeGlobal.addEventListener('beforeunload', state.beforeunloadListener);
  }
}

/**
 * @purpose Removes lifecycle hooks installed by bindLifecycleListeners.
 * @param state Active runtime state.
 */
function unbindLifecycleListeners(state: RemoteConsoleClientState): void {
  if (typeof runtimeGlobal.removeEventListener === 'function') {
    runtimeGlobal.removeEventListener('pagehide', state.pagehideListener);
    runtimeGlobal.removeEventListener('beforeunload', state.beforeunloadListener);
  }
}

/**
 * @purpose Executes the shared shutdown path for manual and auto-disconnect flows.
 * @param state Active runtime state.
 * @param unloadSafe When true, sends envelopes via sendBeacon->keepalive policy.
 */
async function disconnectRemoteConsoleClient(
  state: RemoteConsoleClientState,
  unloadSafe: boolean
): Promise<void> {
  // START_ENFORCE_SINGLE_CLIENT_SHUTDOWN_PATH
  // Manual disconnect and pagehide auto-disconnect must converge to a single idempotent state machine.
  if (state.shutdownStarted) {
    return;
  }

  state.shutdownStarted = true;
  // END_ENFORCE_SINGLE_CLIENT_SHUTDOWN_PATH

  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  unbindLifecycleListeners(state);

  try {
    await flushQueue(state, unloadSafe);
    try {
      await sendEnvelope(state, { type: 'disconnect', tabId: state.tabId }, unloadSafe);
    } catch {
      // Disconnect envelope is best-effort by contract and must not throw into consumer flow.
    }
  } finally {
    restoreConsolePatch(state);
    remoteConsoleStates.delete(state.consoleTarget);
  }
}

/**
 * @purpose Flushes buffered log entries as one command envelope while preventing concurrent flush overlap.
 * @param state Active runtime state.
 * @param unloadSafe When true, uses unload-safe transport policy.
 */
async function flushQueue(state: RemoteConsoleClientState, unloadSafe: boolean): Promise<void> {
  if (state.flushInFlight || state.queue.length === 0) {
    return;
  }

  state.flushInFlight = true;
  const items = state.queue.splice(0, state.queue.length);

  try {
    await sendEnvelope(state, { type: 'logs', tabId: state.tabId, items }, unloadSafe);
  } catch (cause) {
    if (!state.transportFailureNotified) {
      state.transportFailureNotified = true;
      state.originals.error(
        '[remoteConsoleClient.connect] [streaming → degraded] Remote sink became unavailable; local console remains active',
        { cause }
      );
    }
  } finally {
    state.flushInFlight = false;
  }
}

/**
 * @purpose Sends one command envelope via regular fetch or unload-safe policy.
 * @param state Active runtime state carrying endpoint URL.
 * @param envelope Command payload to transmit.
 * @param unloadSafe Enables browser unload-safe strategy when true.
 * @throws {Error} When transport fails in regular fetch mode.
 */
async function sendEnvelope(
  state: RemoteConsoleClientState,
  envelope: RemoteConsoleCommandEnvelope,
  unloadSafe: boolean
): Promise<void> {
  if (unloadSafe) {
    await sendEnvelopeUnloadSafe(state.url, envelope);
    return;
  }

  const response = await fetch(state.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(envelope),
  });

  if (!response.ok) {
    throw new Error(`[remoteConsoleClient.connect] Unexpected response status: ${response.status}`);
  }
}

/**
 * @purpose Delivers command envelopes during unload using sendBeacon first, then keepalive fetch fallback.
 * @param url Remote endpoint URL.
 * @param envelope Command payload to deliver.
 */
async function sendEnvelopeUnloadSafe(
  url: string,
  envelope: RemoteConsoleCommandEnvelope
): Promise<void> {
  const payloadText = JSON.stringify(envelope);
  const payloadBlob = new Blob([payloadText], { type: 'application/json' });
  const sendBeaconCandidate = runtimeGlobal.navigator?.sendBeacon;

  if (typeof sendBeaconCandidate === 'function') {
    const deliveredByBeacon = sendBeaconCandidate.call(runtimeGlobal.navigator, url, payloadBlob);
    if (deliveredByBeacon) {
      return;
    }
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: payloadText,
      keepalive: true,
    });
  } catch {
    // Best-effort unload policy intentionally avoids retries and persistent queueing in first slice.
  }
}
