// @file: Project-wide logger contract and console-bound level-aware implementation.
// @consumers: All services and CLI commands

/** @purpose Project-wide logger contract with a stable debug/info/warn/error API. */
export type SimpleLogger = {
  /**
   * @purpose Emits a debug-level message for development diagnostics.
   * @param message Log message with Trace-Prefix and state transition.
   * @param detail Optional structured payload.
   */
  debug: (message: string, detail?: unknown) => void;

  /**
   * @purpose Emits an info-level message for normal operational events.
   * @param message Log message with Trace-Prefix and state transition.
   * @param detail Optional structured payload.
   */
  info: (message: string, detail?: unknown) => void;

  /**
   * @purpose Emits a warning-level message for non-fatal issues.
   * @param message Log message with Trace-Prefix and state transition.
   * @param detail Optional structured payload.
   */
  warn: (message: string, detail?: unknown) => void;

  /**
   * @purpose Emits an error-level message for failures requiring investigation.
   * @param message Log message with Trace-Prefix and state transition.
   * @param detail Optional structured payload.
   */
  error: (message: string, detail?: unknown) => void;
};

/** @purpose Ordered log levels — lower index = more verbose. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

let _level: LogLevel = 'warn';

/**
 * @purpose Set the minimum log level for the global logger instance.
 * @param level New minimum level — messages below this level are suppressed.
 */
export const setLogLevel = (level: LogLevel): void => {
  _level = level;
};

/**
 * @purpose Logger implementation bound to the runtime console, filtered by the active log level.
 * @sideEffect Console: writes log entries to stderr via console methods.
 */
export const logger: SimpleLogger = {
  debug: (message, detail?) => {
    if (LEVELS[_level] <= LEVELS.debug) console.debug(message, ...(detail !== undefined ? [detail] : []));
  },
  info: (message, detail?) => {
    if (LEVELS[_level] <= LEVELS.info) console.info(message, ...(detail !== undefined ? [detail] : []));
  },
  warn: (message, detail?) => {
    if (LEVELS[_level] <= LEVELS.warn) console.warn(message, ...(detail !== undefined ? [detail] : []));
  },
  error: (message, detail?) => {
    if (LEVELS[_level] <= LEVELS.error) console.error(message, ...(detail !== undefined ? [detail] : []));
  },
};
