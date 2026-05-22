// @file: Observation loop configuration
// @consumers: observe, cli
// @tasks: TSK-35

/** @purpose Configuration for the observe polling cycle. */
export type ObserveOpts = {
  /** @purpose Polling interval in milliseconds */
  interval: number;
  /** @purpose Idle detection threshold in milliseconds | @invariant Default 300000 when absent */
  idleThresholdMs?: number;
};
