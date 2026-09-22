// @file: Diff result shape — added, removed, updated session arrays
// @spec: AGENT-MON-MODEL
// @consumers: diff, observe, cli

import type { AgentSession } from './agent-session.type.js';

/** @purpose Result of comparing two session snapshots — what appeared, disappeared, or changed. */
export type SessionChanges = {
  /** @purpose Sessions present in current but absent in previous */
  added: AgentSession[];
  /** @purpose Sessions present in previous but absent in current */
  removed: AgentSession[];
  /** @purpose Sessions present in both but with semantic fields changed */
  updated: AgentSession[];
};
