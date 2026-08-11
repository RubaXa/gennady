// @file: Integration tests for deterministic immutable review manifest sealing.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ReviewInputManifestBuilder,
  type ReviewManifestCapture,
} from '../../../services/agent-inbox/modules/inbox-pipeline/planning/review-input-manifest-builder.ts';
import type { ReviewIntent } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-intent.type.ts';

type ManifestBuilderContext = {
  builder: ReviewInputManifestBuilder;
  intent: ReviewIntent;
  capture: ReviewManifestCapture;
  persisted: unknown[];
};
function createManifestBuilderContext(): ManifestBuilderContext {
  const persisted: unknown[] = [];
  const intent: ReviewIntent = {
    kind: 'full',
    manifestKey: { mr: 'g/p!1', headSHA: 'abc', eventCursor: '1' },
    trigger: 'event',
    requester: 'operator',
  };
  const capture: ReviewManifestCapture = {
    inputs: [
      {
        inputId: 'file:a.ts',
        kind: 'file',
        canonicalIdentity: 'a.ts',
        version: 'abc',
        digest: 'file-digest',
      },
    ],
    classifications: [
      {
        inputId: 'file:a.ts',
        code: 'BEHAVIOR_CHANGED',
        changeShape: ['BEHAVIOR_CHANGED'],
        rationaleDigest: 'r',
        classifierVersion: 'review-classifier-v0',
      },
    ],
    provenance: ['vcs:abc'],
  };
  return {
    builder: new ReviewInputManifestBuilder((result) => persisted.push(result)),
    intent,
    capture,
    persisted,
  };
}

describe('ReviewInputManifestBuilder', () => {
  it('sealed manifest owns every versioned input classification and no contract policy', () => {
    const { builder, intent, capture } = createManifestBuilderContext();
    const result = builder.captureAndSeal(intent, capture);
    assert.strictEqual(result.status, 'SEALED');
    assert.strictEqual('slots' in result, false);
    assert.strictEqual('inputMappings' in result, false);
  });

  it('manifest gaps persist BLOCKED before contract or agent launch', () => {
    const { builder, intent, capture, persisted } = createManifestBuilderContext();
    const result = builder.captureAndSeal(intent, {
      ...capture,
      inputs: [{ ...capture.inputs[0], mutable: true }],
    });
    assert.strictEqual(result.status, 'BLOCKED');
    assert.strictEqual(persisted.length, 1);
  });

  it('manifest determinism accepts known unknown-file code but rejects unknown codes', () => {
    const first = createManifestBuilderContext();
    const unknownCapture: ReviewManifestCapture = {
      ...first.capture,
      classifications: [
        {
          ...first.capture.classifications[0],
          code: 'UNKNOWN_FILE_CLASSIFICATION',
          changeShape: ['UNKNOWN_FILE_CLASSIFICATION'],
        },
      ],
    };
    const a = first.builder.captureAndSeal(first.intent, unknownCapture);
    const second = createManifestBuilderContext();
    const b = second.builder.captureAndSeal(second.intent, unknownCapture);
    const rejected = second.builder.captureAndSeal(second.intent, {
      ...second.capture,
      classifications: [{ ...second.capture.classifications[0], code: 'NOT_A_CODE' as never }],
    });
    assert.strictEqual(a.status, 'SEALED');
    assert.deepStrictEqual(a, b);
    assert.strictEqual(rejected.status, 'BLOCKED');
  });
});
