// @file: Trusted control-plane tool receipt contract.
// @consumers: ReviewRuntimeReceiptRecorder, ReviewRuntimeReceiptStorePort, ReviewStructuralValidator
// @tasks: TSK-176

/** @purpose Closed tool operation vocabulary observed by the review control plane. */
export type ReviewRuntimeOperation = 'READ' | 'SEARCH' | 'DIFF' | 'TEST' | 'INSPECT';

/** @purpose Immutable proof that a control-plane-owned operation actually observed content. */
export type ReviewRuntimeReceipt = {
  /** @purpose Stable trusted receipt identity. */
  receiptId: string;
  /** @purpose Owning contract identity. */
  contractId: string;
  /** @purpose Exact owning contract version. */
  contractVersion: string;
  /** @purpose Digest of the immutable manifest key. */
  manifestKeyDigest: string;
  /** @purpose Agent runtime session identity. */
  sessionId: string;
  /** @purpose Control-plane task identity. */
  taskId: string;
  /** @purpose Canonical immutable source identity. */
  sourceId: string;
  /** @purpose Exact immutable source version. */
  sourceVersion: string;
  /** @purpose Digest of immutable source bytes. */
  sourceDigest: string;
  /** @purpose Canonical operation target identity. */
  targetId: string;
  /** @purpose Closed observed tool operation. */
  operation: ReviewRuntimeOperation;
  /** @purpose Canonical arguments fixed before callback execution. */
  normalizedArguments: Record<string, string | number | boolean>;
  /** @purpose Exact observed byte or line interval. */
  range?: { start: number; end: number };
  /** @purpose Versioned semantic source anchor. */
  semanticAnchor?: string;
  /** @purpose Digest of content observed by the control plane. */
  observedContentDigest: string;
  /** @purpose Digest of normalized tool outcome. */
  outcomeDigest: string;
  /** @purpose Tool callback terminal outcome. */
  outcome: 'SUCCEEDED' | 'FAILED';
  /** @purpose Monotonic receipt log sequence. */
  sequence: number;
  /** @purpose Trusted receipt recording time. */
  recordedAt: string;
};
