// @file: Immutable captured review input inventory and persisted sealing outcome.
// @consumers: ReviewInputManifestBuilder, ReviewContractCompiler, ReviewStructuralValidator
// @tasks: TSK-176

import type {
  ReviewInputClassification,
  ReviewChangeShapeCode,
} from '../types/review-input-classification.type.ts';
import type { ReviewManifestKey } from '../types/review-intent.type.ts';

/** @purpose One immutable file, entity, discussion or required-source input. */
export type ReviewManifestInput = {
  /** @purpose Stable identity within the closed inventory. */
  inputId: string;
  /** @purpose Closed source category. */
  kind: 'file' | 'entity' | 'discussion' | 'source';
  /** @purpose Canonical provider-independent source identity. */
  canonicalIdentity: string;
  /** @purpose Exact immutable source version. */
  version: string;
  /** @purpose Digest of immutable source bytes. */
  digest: string;
  /** @purpose Captured bytes when no external version address exists. */
  capturedBytes?: string;
  /** @purpose Explicit mutable-source rejection marker. */
  mutable?: boolean;
};

/** @purpose Sealed deterministic input inventory with no contract policy fields. */
export type ReviewInputManifest = Readonly<{
  status: 'SEALED';
  manifestId: string;
  manifestVersion: string;
  key: ReviewManifestKey;
  ref: string;
  inputs: readonly ReviewManifestInput[];
  classifications: readonly ReviewInputClassification[];
  changeShape: readonly ReviewChangeShapeCode[];
  provenance: readonly string[];
}>;

/** @purpose Persistable fail-closed manifest capture result. */
export type ReviewInputManifestBlocked = Readonly<{
  status: 'BLOCKED';
  manifestId: string;
  manifestVersion: string;
  key: ReviewManifestKey;
  blockedInputIds: readonly string[];
  reasons: readonly string[];
  persisted: true;
}>;

/** @purpose Exhaustive manifest-builder outcome before contract compilation. */
export type ReviewInputManifestResult = ReviewInputManifest | ReviewInputManifestBlocked;
