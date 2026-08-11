// @file: Immutable slot evidence with source and producer provenance.
// @consumers: ReviewStructuralValidator, ReviewFinding, ReviewSynthesis
// @tasks: TSK-176

/** @purpose Agent observation tied to an immutable source and addressable artifact fragment. */
export type ReviewEvidence = {
  /** @purpose Stable evidence identity. */
  evidenceId: string;
  /** @purpose Contract slot addressed by this observation. */
  slotId: string;
  /** @purpose Owning contract identity. */
  contractId: string;
  /** @purpose Exact owning contract version. */
  contractVersion: string;
  /** @purpose Exact sealed manifest reference. */
  manifestRef: string;
  /** @purpose Canonical immutable source identity. */
  sourceId: string;
  /** @purpose Exact immutable source version. */
  sourceVersion: string;
  /** @purpose Digest of the immutable source bytes. */
  sourceDigest: string;
  /** @purpose Addressable artifact identity. */
  artifactId: string;
  /** @purpose Immutable artifact revision. */
  artifactRevision: number;
  /** @purpose Addressable fragment identity within the artifact. */
  fragmentId: string;
  /** @purpose Agent runtime session provenance. */
  producerSessionId: string;
  /** @purpose Producing model provenance. */
  producerModel: string;
  /** @purpose Observation creation time. */
  producedAt: string;
  /** @purpose Trusted source-use receipts supporting this evidence. */
  receiptIds: string[];
  /** @purpose Durable explicit reuse consumptions. */
  reuseConsumptionIds: string[];
  /** @purpose Schema-addressed semantic fields. */
  fields: Record<string, unknown>;
};
