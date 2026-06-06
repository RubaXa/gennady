// @file: Port contract for agent engine implementations.
// @consumers: registry, run
// @tasks: TSK-62

import type { RunOptions } from '../run-options.type.ts';
import type { RunResult } from '../run-options.type.ts';

/**
 * @purpose Contract that every agent engine adapter must satisfy.
 * @invariant `id` is stable and unique across registered engines.
 * @invariant `detect` produces no side effects beyond running a `--version` probe.
 * @invariant `run` completes in finite time: resolves within `options.timeout` or throws `AgentRunError('TIMEOUT')` without leaving orphan subprocesses.
 */
export interface AgentEngine {
  /** @purpose Stable, unique engine identifier used for registry lookup and result tagging. */
  readonly id: string;

  /**
   * @purpose Probe whether the engine binary is installed and retrieve its version.
   * @returns Installation status; `version` is present only when the binary responds to `--version`.
   */
  detect(): Promise<{ installed: boolean; version?: string }>;

  /**
   * @purpose Execute the engine with the provided task and return the markdown response.
   * @pre `options.task` is non-empty (enforced by `run()` before dispatch).
   * @param options Resolved run options including task, dirs, mode, and timeout.
   * @throws {AgentRunError} On any engine failure; does not write to disk (readonly contract).
   * @returns Markdown response text and the engine id that produced it.
   */
  run(options: RunOptions): Promise<RunResult>;
}
