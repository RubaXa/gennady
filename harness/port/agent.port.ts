// @file: AgentPort — the harness's minimal agent abstraction (create session, prompt, continue, close).
// @consumers: harness/core/run-flow, harness/port/mock-agent, harness/port/opencode-server-agent
// @tasks: N/A (eval harness, not published)

/**
 * @purpose One observed tool action from an agent turn — the factual record the verifier trusts
 *   instead of the agent's self-report.
 * @invariant `input` is the primary argument (a file path for read/write/edit), verbatim.
 */
export type AgentTraceEntry = {
  /** @purpose Tool name as the runtime reports it (e.g. 'write', 'edit', 'read', 'bash'). */
  tool: string;
  /** @purpose Primary tool argument — a file path for file tools, the command for bash. */
  input: string;
};

/**
 * @purpose Terminal outcome of one agent turn, always carrying the factual trace so a failed turn
 *   is still inspectable.
 */
export type AgentTurnResult =
  | { ok: true; text: string; trace: AgentTraceEntry[] }
  | { ok: false; error: string; trace: AgentTraceEntry[] };

/** @purpose Options for opening a working session bound to one repository directory. */
export type AgentSessionOpts = {
  /** @purpose Human-readable session label, surfaced in logs and (for real runs) the server UI. */
  title: string;
  /** @purpose Absolute path to the repo the agent may read and write — its whole world. */
  directory: string;
  /** @purpose Optional model id (`providerID/modelID`), e.g. `llm-proxy/deepseek-v4-pro`. */
  model?: string;
};

/** @purpose Per-turn options — the prompt text and an optional whole-turn timeout in minutes. */
export type AgentPromptOpts = {
  /** @purpose The instruction sent to the agent for this turn. */
  text: string;
  /** @purpose Whole-turn timeout in minutes (agent turns are multi-step and long-running). */
  timeoutMinutes?: number;
};

/**
 * @purpose Minimal, harness-owned agent abstraction — deliberately narrower than agent-inbox's
 *   OpenCodePort so the eval harness never depends on that experimental module's internals.
 * @invariant One session = one repo directory with tools enabled; continue() reuses the same
 *   session so the flow's multi-step context survives across turns.
 * @consumers run-flow (driver), MockAgent (dev), OpencodeServerAgent (real runs)
 */
export abstract class AgentPort {
  /**
   * @purpose Open a working session bound to a repository directory.
   * @param opts Session title, directory, and optional model.
   * @returns The new session id used by every later call.
   */
  abstract createSession(opts: AgentSessionOpts): Promise<{ sid: string }>;

  /**
   * @purpose Run one agent turn in a session.
   * @param sid Session id from createSession.
   * @param opts Prompt text and optional timeout.
   * @returns The turn outcome with its factual tool-trace.
   */
  abstract prompt(sid: string, opts: AgentPromptOpts): Promise<AgentTurnResult>;

  /**
   * @purpose Continue the SAME session for a follow-up turn — never allocates a new session.
   * @param sid Session id to continue.
   * @param opts Prompt text and optional timeout.
   * @returns The turn outcome with the accumulated tool-trace.
   */
  abstract continue(sid: string, opts: AgentPromptOpts): Promise<AgentTurnResult>;

  /**
   * @purpose Release the session and its resources.
   * @param sid Session id to close.
   */
  abstract close(sid: string): Promise<void>;
}
