// @file: Observation loop configuration
// @spec: AGENT-MON-MODEL
// @consumers: observe, cli

/** @purpose Configuration for the observe polling cycle. */
export type ObserveOpts = {
  /** @purpose Polling interval in milliseconds */
  interval: number;
  /** @purpose Idle detection threshold in milliseconds | @invariant Default 300000 when absent */
  idleThresholdMs?: number;
};
