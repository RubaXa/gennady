// @file: Public value object types for the agent-run module API surface.
// @consumers: run, AgentEngine implementations, CLI commands, agent consumers
// @tasks: TSK-62

/**
 * @purpose Input to `run()`: describes the task, working directories, and execution constraints.
 * @invariant `mode` is locked to `'readonly'` in v1 — the type prevents other values at compile time.
 * @invariant `timeout` defaults to 120000 ms when absent; the engine owns actual process termination.
 */
export type RunOptions = {
  /** @purpose The task text sent to the agent engine | @invariant Non-empty; enforced by `run()` before dispatch */
  task: string;
  /** @purpose Working directories for the engine; first entry = root | @invariant Empty → engine uses cwd */
  dirs?: string[];
  /** @purpose Execution mode — only `'readonly'` is valid in v1 */
  mode?: 'readonly';
  /** @purpose Explicit engine id override; absent → registry default (opencode first) */
  engine?: string;
  /** @purpose Upper time bound for one engine run in ms | @invariant Default 120000 when absent */
  timeout?: number;
};

/**
 * @purpose Output of a successful `run()` call: the engine's markdown response and which engine produced it.
 */
export type RunResult = {
  /** @purpose Markdown text returned by the engine | @invariant Non-empty on success */
  text: string;
  /** @purpose Id of the engine that handled the run — matches `AgentEngine.id` */
  engine: string;
};

/**
 * @purpose Status snapshot for one registered engine as returned by `listEngines()`.
 */
export type EngineStatus = {
  /** @purpose Engine identifier — matches `AgentEngine.id` */
  id: string;
  /** @purpose Whether the engine binary is currently installed */
  installed: boolean;
  /** @purpose Installed version string when available */
  version?: string;
};
