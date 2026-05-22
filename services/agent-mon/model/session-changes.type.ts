// @file: Diff result shape — added, removed, updated session arrays
// @consumers: diff, observe, cli
// @tasks: TSK-35

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
