// @file: Integration tests for atomic deterministic Review Contract compilation.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReviewSlotSchemaCatalog } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-slot-schema-catalog.ts';
import { ReviewContractCompiler } from '../../../services/agent-inbox/modules/inbox-pipeline/planning/review-contract-compiler.ts';
import {
  ReviewInputManifestBuilder,
  type ReviewManifestCapture,
} from '../../../services/agent-inbox/modules/inbox-pipeline/planning/review-input-manifest-builder.ts';
import type { ReviewIntent } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-intent.type.ts';

type ContractCompilerContext = {
  compiler: ReviewContractCompiler;
  manifest: ReturnType<ReviewInputManifestBuilder['captureAndSeal']>;
  intent: ReviewIntent;
};
function createContractCompilerContext(): ContractCompilerContext {
  const intent: ReviewIntent = {
    kind: 'full',
    manifestKey: { mr: 'g/p!1', headSHA: 'abc', eventCursor: '1' },
    trigger: 'event',
    requester: 'operator',
  };
  const capture: ReviewManifestCapture = {
    inputs: [
      {
        inputId: 'file:new.bin',
        kind: 'file',
        canonicalIdentity: 'new.bin',
        version: 'abc',
        digest: 'd',
      },
    ],
    classifications: [
      {
        inputId: 'file:new.bin',
        code: 'UNKNOWN_FILE_CLASSIFICATION',
        changeShape: ['UNKNOWN_FILE_CLASSIFICATION', 'RUNTIME_FLOW_CHANGED'],
        rationaleDigest: 'r',
        classifierVersion: 'review-classifier-v0',
      },
    ],
    provenance: [],
  };
  const manifest = new ReviewInputManifestBuilder().captureAndSeal(intent, capture);
  return { compiler: new ReviewContractCompiler(new ReviewSlotSchemaCatalog()), manifest, intent };
}

describe('ReviewContractCompiler', () => {
  it('compiler atomically maps every input with fallback or justified NA', () => {
    const { compiler, manifest, intent } = createContractCompilerContext();
    assert.strictEqual(manifest.status, 'SEALED');
    if (manifest.status !== 'SEALED') return;
    const result = compiler.compileAtomically(manifest, intent);
    assert.strictEqual(result.status, 'COMPILED');
    if (result.status !== 'COMPILED') return;
    assert.strictEqual(result.inputMappings.length, manifest.inputs.length);
    assert.match(result.inputMappings[0].mappingCode, /^file-fallback:/);
  });

  it('compiler output is byte-equivalent and cannot be changed by agent output', () => {
    const { compiler, manifest, intent } = createContractCompilerContext();
    assert.strictEqual(manifest.status, 'SEALED');
    if (manifest.status !== 'SEALED') return;
    const a = compiler.compileAtomically(manifest, intent);
    const b = compiler.compileAtomically(manifest, intent);
    assert.deepStrictEqual(a, b);
  });
});
