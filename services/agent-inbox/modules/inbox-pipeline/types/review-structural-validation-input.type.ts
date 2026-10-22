// @file: Immutable structural review validation input.
// @spec: AGENT-INBOX-INBOX-PIPELINE
// @consumers: ReviewStructuralValidator

import type { ReviewArtifact } from '../model/review-artifact.ts';
import type { ReviewContract } from '../model/review-contract.ts';
import type { ReviewInputManifest } from '../model/review-input-manifest.ts';
import type { ReviewReceiptStoreContext } from '../ports/review-runtime-receipt-store.port.ts';
import type { ReviewEvidence } from './review-evidence.type.ts';

/** @purpose Complete immutable validation input for one contract attempt. */
export type ReviewStructuralValidationInput = {
  /** @purpose Sealed immutable inputs whose provenance must match the artifacts. */
  manifest: ReviewInputManifest;
  /** @purpose Compiled slot obligations for this review attempt. */
  contract: ReviewContract;
  /** @purpose Addressable artifact revisions containing candidate slot fragments. */
  artifacts: readonly ReviewArtifact[];
  /** @purpose Source observations supported by trusted runtime receipts. */
  evidence: readonly ReviewEvidence[];
  /** @purpose Isolated namespace and immutable round identity for receipt operations. */
  storeContext: ReviewReceiptStoreContext;
  /** @purpose Current persisted repair attempt attached to the resulting verdict. */
  attempt: number;
  /** @purpose Explicit repair limit exposed to downstream coordination. */
  maxAttempts: number;
};
