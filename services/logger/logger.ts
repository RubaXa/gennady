// @file: Project-wide logger contract and console-bound level-aware implementation.
// @consumers: All services and CLI commands

/** @purpose Project-wide logger contract with a stable debug/info/warn/error API. */
export type SimpleLogger = {
  /**
   * @purpose Emits a debug-level message for development diagnostics.
   * @param message Log message with Trace-Prefix and state transition.
   * @param [detail] Optional structured payload.
   */
  debug: (message: string, detail?: unknown) => void;

  /**
   * @purpose Emits an info-level message for normal operational events.
   * @param message Log message with Trace-Prefix and state transition.
   * @param [detail] Optional structured payload.
   */
  info: (message: string, detail?: unknown) => void;

  /**
   * @purpose Emits a warning-level message for non-fatal issues.
   * @param message Log message with Trace-Prefix and state transition.
   * @param [detail] Optional structured payload.
   */
  warn: (message: string, detail?: unknown) => void;

  /**
   * @purpose Emits an error-level message for failures requiring investigation.
   * @param message Log message with Trace-Prefix and state transition.
   * @param [detail] Optional structured payload.
   */
  error: (message: string, detail?: unknown) => void;
};

/** @purpose Ordered log levels — lower index = more verbose. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

let _level: LogLevel = 'warn';

/** @purpose Set the minimum log level for the global logger instance. */
export const setLogLevel = (level: LogLevel): void => {
  _level = level;
};

// #region START_RING_BUFFER — in-memory tail of recent lines so a running serve can surface its
// own diagnostics (the 🐞 dashboard button) without a terminal. Console output is unchanged;
// this only mirrors. Never persisted.
/** @purpose Max retained lines — oldest evicted (FIFO) so a long run stays bounded. */
const RING_CAPACITY = 1000;
/** @purpose Recent formatted log lines, process memory only. */
const _ring: string[] = [];

/** @purpose Compact a structured detail payload for the ring, degrading gracefully. */
function _detailToString(detail: unknown): string {
  if (detail === undefined) return '';
  if (detail instanceof Error) return ` ${detail.name}: ${detail.message}`;
  try {
    return ` ${JSON.stringify(detail)}`;
  } catch {
    return ' [detail]';
  }
}

/** @purpose Append one line to the ring buffer with a level tag + ISO timestamp; never throws. */
function _ringPush(level: LogLevel, message: string, detail: unknown): void {
  try {
    const line = `[${new Date().toISOString()}][${level.toUpperCase()}] ${message}${_detailToString(detail)}`;
    _ring.push(line);
    if (_ring.length > RING_CAPACITY) _ring.shift();
  } catch {
    /* logging must never break the caller */
  }
}

/**
 * @purpose Snapshot recent server-log lines — the `/api/diagnostics` route feeds them to the 🐞
 *   button so it carries server-side flow diagnostics, not only the browser's.
 */
export const snapshotServerLog = (limit?: number): string[] => {
  if (limit === undefined || limit >= _ring.length) return [..._ring];
  return _ring.slice(_ring.length - limit);
};

/**
 * @purpose Logger implementation bound to the runtime console, filtered by the active log level.
 * @invariant The ring captures every call regardless of `_level` — a console-suppressed line
 *   stays retrievable via 🐞 for post-hoc diagnosis.
 * @sideEffect Console: writes log entries to stderr via console methods. Mutates the ring buffer.
 */
export const logger: SimpleLogger = {
  debug: (message, detail?) => {
    _ringPush('debug', message, detail);
    if (LEVELS[_level] <= LEVELS.debug)
      console.debug(message, ...(detail !== undefined ? [detail] : []));
  },
  info: (message, detail?) => {
    _ringPush('info', message, detail);
    if (LEVELS[_level] <= LEVELS.info)
      console.info(message, ...(detail !== undefined ? [detail] : []));
  },
  warn: (message, detail?) => {
    _ringPush('warn', message, detail);
    if (LEVELS[_level] <= LEVELS.warn)
      console.warn(message, ...(detail !== undefined ? [detail] : []));
  },
  error: (message, detail?) => {
    _ringPush('error', message, detail);
    if (LEVELS[_level] <= LEVELS.error)
      console.error(message, ...(detail !== undefined ? [detail] : []));
  },
};
// #endregion END_RING_BUFFER
