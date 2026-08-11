// @file: Deterministic capture, classification and sealing of review inputs.
// @consumers: ReviewOrchestrator, inbox-eval
// @tasks: TSK-176

import { createHash } from 'node:crypto';
import type {
  ReviewInputClassification,
  ReviewChangeShapeCode,
} from '../types/review-input-classification.type.ts';
import type { ReviewIntent } from '../types/review-intent.type.ts';
import type {
  ReviewInputManifestResult,
  ReviewManifestInput,
} from '../model/review-input-manifest.ts';

const CHANGE_SHAPE_CODES = new Set<ReviewChangeShapeCode>([
  'GOAL_CHANGED',
  'ARCHITECTURE_CHANGED',
  'SPECIFICATION_TOUCHED',
  'BEHAVIOR_CHANGED',
  'TEST_SURFACE_CHANGED',
  'SECURITY_SURFACE_CHANGED',
  'OPTIMALITY_RELEVANT',
  'ENTITY_SET_CHANGED',
  'RUNTIME_FLOW_CHANGED',
  'DISCUSSION_CHANGED',
  'UNKNOWN_FILE_CLASSIFICATION',
]);

/** @purpose Complete capture input for one manifest sealing attempt. */
export type ReviewManifestCapture = {
  /** @purpose Complete immutable input inventory. */
  inputs: readonly ReviewManifestInput[];
  /** @purpose One versioned classification per inventory input. */
  classifications: readonly ReviewInputClassification[];
  /** @purpose Trusted capture provenance. */
  provenance: readonly string[];
};

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * @purpose Seal one complete immutable input inventory or return a persisted BLOCKED result.
 * @invariant Manifest output never contains slots, mappings, fallback or NA policy.
 */
export class ReviewInputManifestBuilder {
  /** @purpose Exact manifest format release. */
  readonly manifestVersion = 'review-manifest-v0';
  /** @purpose Exact deterministic classifier release. */
  readonly classifierVersion = 'review-classifier-v0';
  /** @purpose Journal callback persisting every public terminal result. */
  protected readonly _persist: (result: ReviewInputManifestResult) => void;

  /**
   * @purpose Configure manifest terminal-result persistence.
   * @param [persist] Journal persistence callback.
   */
  constructor(persist: (result: ReviewInputManifestResult) => void = () => undefined) {
    this._persist = persist;
  }

  /**
   * @purpose Capture and deterministically seal a complete versioned inventory.
   * @param intent Valid role-invariant review request.
   * @param capture Complete version-addressable source capture.
   * @returns Persisted sealed manifest or fail-closed BLOCKED result.
   */
  captureAndSeal(intent: ReviewIntent, capture: ReviewManifestCapture): ReviewInputManifestResult {
    const orderedInputs = [...capture.inputs].sort((a, b) => a.inputId.localeCompare(b.inputId));
    const orderedClassifications = [...capture.classifications].sort((a, b) =>
      a.inputId.localeCompare(b.inputId)
    );
    const classificationByInput = new Map(
      orderedClassifications.map((item) => [item.inputId, item])
    );
    const blockedInputIds = orderedInputs
      .filter(
        (input) =>
          !input.version ||
          !input.digest ||
          input.mutable ||
          !classificationByInput.has(input.inputId)
      )
      .map((input) => input.inputId);
    const invalidClassifications = orderedClassifications
      .filter(
        (item) =>
          item.classifierVersion !== this.classifierVersion ||
          !CHANGE_SHAPE_CODES.has(item.code) ||
          item.changeShape.some((code) => !CHANGE_SHAPE_CODES.has(code))
      )
      .map((item) => item.inputId);
    const duplicateInputIds = orderedInputs
      .map((input) => input.inputId)
      .filter((inputId, index, all) => all.indexOf(inputId) !== index);
    const keyDigest = digest(intent.manifestKey);
    const manifestId = `manifest:${keyDigest}`;
    if (
      blockedInputIds.length ||
      invalidClassifications.length ||
      duplicateInputIds.length ||
      orderedInputs.length === 0
    ) {
      const result: ReviewInputManifestResult = Object.freeze({
        status: 'BLOCKED',
        manifestId,
        manifestVersion: this.manifestVersion,
        key: intent.manifestKey,
        blockedInputIds: [
          ...new Set([...blockedInputIds, ...invalidClassifications, ...duplicateInputIds]),
        ],
        reasons: [
          'inventory is incomplete, mutable, duplicated or carries an unknown classification',
        ],
        persisted: true,
      });
      this._persist(result);
      return result;
    }
    const changeShape = [
      ...new Set(orderedClassifications.flatMap((item) => item.changeShape)),
    ].sort() as ReviewChangeShapeCode[];
    const semantic = {
      key: intent.manifestKey,
      inputs: orderedInputs,
      classifications: orderedClassifications,
      changeShape,
    };
    const result: ReviewInputManifestResult = Object.freeze({
      status: 'SEALED',
      manifestId,
      manifestVersion: this.manifestVersion,
      key: intent.manifestKey,
      ref: `${manifestId}:${digest(semantic)}`,
      inputs: orderedInputs,
      classifications: orderedClassifications,
      changeShape,
      provenance: [...capture.provenance],
    });
    this._persist(result);
    return result;
  }
}
