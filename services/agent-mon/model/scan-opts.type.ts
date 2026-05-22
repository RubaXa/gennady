// @file: Scan filtering parameters
// @consumers: monitor, providers
// @tasks: TSK-35, TSK-39

/** @purpose Filtering options for session scanning. */
export type ScanOpts = {
  /** @purpose Return sessions started after this timestamp or today's date | @invariant Epoch ms or the string 'today' */
  since?: number | 'today';
  /** @purpose Idle detection threshold in milliseconds | @invariant Default 300000 (5 min) when absent */
  idleThresholdMs?: number;
};
