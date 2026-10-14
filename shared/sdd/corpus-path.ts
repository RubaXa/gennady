// @file: Exact repository evidence paths excluded from the live SDD ticket/Task-ID corpus.
// @spec: SHARED
// @consumers: ticket-resolve, task-id

/**
 * @purpose Distinguish packaged/development simulation and migration evidence from project tickets.
 * @invariant Exact root-relative evidence directories only; specs scopes with the same names remain live.
 * @param path Repository-relative path with either directory separator.
 * @returns Whether the path belongs to inert SDD evidence rather than the live project corpus.
 */
export function isSddEvidencePath(path: string): boolean {
  return /^(?:ai\/(?:flow-sim|flow-eval)|migration)(?:\/|$)/.test(path.replace(/\\/g, '/'));
}
