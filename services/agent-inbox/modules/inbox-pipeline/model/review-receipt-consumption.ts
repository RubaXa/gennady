// @file: Append-only trusted receipt to evidence-slot consumption mapping.
// @spec: AGENT-INBOX-INBOX-PIPELINE
// @consumers: ReviewRuntimeReceiptStorePort, ReviewStructuralValidator

/** @purpose Durable proof that one trusted receipt was consumed for one slot mapping. */
export type ReviewReceiptConsumption = Readonly<{
  consumptionId: string;
  receiptId: string;
  contractId: string;
  contractVersion: string;
  manifestKeyDigest: string;
  slotId: string;
  evidenceId: string;
  reusePolicy: 'DENY' | 'EXPLICIT_SEPARATE_CONSUMPTION';
  sequence: number;
  recordedAt: string;
  digest: string;
}>;
