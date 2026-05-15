// @file: Project-wide logger contract and console-bound implementation.
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

/**
 * @purpose Logger implementation bound to the runtime console.
 * @sideEffect Console: writes log entries to stdout/stderr.
 */
export const logger: SimpleLogger = console;
