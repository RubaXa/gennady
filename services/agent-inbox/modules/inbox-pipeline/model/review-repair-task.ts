// @file: Durable bounded repair task targeting exact current structural gaps.
// @consumers: ReviewRepairCoordinator, ReviewOrchestrator, agent runtime
// @tasks: TSK-176

/** @purpose Narrow immutable work request for one persisted repair attempt. */
export type ReviewRepairTask = Readonly<{
  repairTaskId: string;
  contractId: string;
  contractVersion: string;
  manifestRef: string;
  slotIds: readonly string[];
  expectedEvidenceTypes: Readonly<Record<string, readonly string[]>>;
  sourceAnchors: Readonly<Record<string, readonly string[]>>;
  attempt: number;
  provenance: readonly string[];
  state: 'PERSISTED' | 'RUNNING' | 'COMPLETE' | 'FAILED';
}>;
