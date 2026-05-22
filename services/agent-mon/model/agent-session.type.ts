// @file: Unified agent session model — single data format from all providers
// @consumers: monitor, diff, observe, providers/claude, providers/opencode
// @tasks: TSK-35

/** @purpose Normalized representation of an agent session across all providers. */
export type AgentSession = {
  /** @purpose Provider key this session belongs to | @invariant Non-empty string, unique per AgentMonitor */
  provider: string;
  /** @purpose Process ID | @invariant null for providers without OS process (OpenCode) */
  pid: number | null;
  /** @purpose Unique session identifier */
  sessionId: string;
  /** @purpose Parent session ID for subagent chains | @invariant V1 optional, tree deferred to V2 */
  parentId?: string;
  /** @purpose Display title of the session */
  title: string;
  /** @purpose Human-readable slug identifier | @invariant OpenCode-specific, absent in Claude */
  slug?: string;
  /** @purpose Working directory of the session */
  cwd: string;
  /** @purpose AI model used in the session */
  model?: string;
  /** @purpose Agent kind identifier */
  agent?: string;
  /** @purpose Current lifecycle state | @invariant 'active' — process alive, 'idle' — no activity > threshold, 'completed' — process dead or archived */
  status: 'active' | 'idle' | 'completed';
  /** @purpose Session start timestamp | @invariant Epoch milliseconds */
  startedAt: number;
  /** @purpose Session completion timestamp | @invariant Epoch milliseconds */
  completedAt?: number;
  /** @purpose Last activity timestamp | @invariant Epoch milliseconds */
  lastActivityAt?: number;
  /** @purpose Total elapsed time | @invariant Seconds */
  elapsedSeconds: number;
  /** @purpose Idle time since last activity | @invariant Seconds, computed from lastActivityAt */
  idleSeconds?: number;
  /** @purpose CPU usage percentage | @invariant Claude-only, absent for OpenCode */
  cpuPercent?: number;
  /** @purpose Memory usage in megabytes | @invariant Claude-only, absent for OpenCode */
  memoryMb?: number;
  /** @purpose Total tool call count */
  toolCallCount?: number;
  /** @purpose Total error count */
  errorCount?: number;
  /** @purpose Last message content, truncated | @invariant Truncated for display, not full text */
  lastMessage?: string;
  /** @purpose Input token count | @invariant OpenCode-specific */
  tokensInput?: number;
  /** @purpose Output token count | @invariant OpenCode-specific */
  tokensOutput?: number;
};
