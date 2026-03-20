/** @purpose Project-wide logger contract with a stable debug/info/warn/error API. */
export type SimpleLogger = {
  /** @purpose Emits a debug-level message for development diagnostics. */
  debug: (message: string, detail?: unknown) => void;

  /** @purpose Emits an info-level message for normal operational events. */
  info: (message: string, detail?: unknown) => void;

  /** @purpose Emits a warning-level message for non-fatal issues. */
  warn: (message: string, detail?: unknown) => void;

  /** @purpose Emits an error-level message for failures requiring investigation. */
  error: (message: string, detail?: unknown) => void;
};

/**
 * @purpose Logger implementation bound to the runtime console.
 * @sideEffect Console: writes log entries to stdout/stderr.
 */
export const logger: SimpleLogger = console;
