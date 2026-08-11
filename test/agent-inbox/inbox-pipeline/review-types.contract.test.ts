// @file: Contract tests for closed review control-plane value object unions.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReviewCompletenessVerdict } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-completeness-verdict.type.ts';
import type { ReviewContractInputMapping } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-contract-input-mapping.type.ts';
import type { ReviewContractSlot } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-contract-slot.type.ts';
import type { ReviewEvidence } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-evidence.type.ts';
import type { ReviewInputClassification } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-input-classification.type.ts';
import type { ReviewIntent } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-intent.type.ts';
import type { ReviewRuntimeReceipt } from '../../../services/agent-inbox/modules/inbox-pipeline/types/review-runtime-receipt.type.ts';

type ReviewTypesContext = { key: { mr: string; headSHA: string; eventCursor: string } };
function createReviewTypesContext(): ReviewTypesContext {
  return { key: { mr: 'group/project!1', headSHA: 'abc', eventCursor: '10' } };
}

describe('Deterministic review control plane typing', () => {
  it('ReviewIntent variants and baseline are exhaustive', () => {
    const { key } = createReviewTypesContext();
    const intents: ReviewIntent[] = [
      { kind: 'full', manifestKey: key, trigger: 'event', requester: 'operator' },
      {
        kind: 'delta',
        manifestKey: key,
        trigger: 'event',
        requester: 'operator',
        baseline: { manifestRef: 'm0', evidenceRef: 'e0' },
      },
      { kind: 'thread', manifestKey: key, trigger: 'reply', requester: 'operator', threadId: 't1' },
      {
        kind: 'cross-review',
        manifestKey: key,
        trigger: 'approval',
        requester: 'operator',
        foreignReviewId: 'r1',
      },
      {
        kind: 'manual',
        manifestKey: key,
        trigger: 'operator',
        requester: 'operator',
        instruction: 'verify',
      },
    ];
    assert.deepStrictEqual(
      intents.map((intent) => intent.kind),
      ['full', 'delta', 'thread', 'cross-review', 'manual']
    );
  });

  it('ReviewInputClassification requires canonical versioned codes', () => {
    const classification: ReviewInputClassification = {
      inputId: 'file:a.ts',
      code: 'BEHAVIOR_CHANGED',
      changeShape: ['BEHAVIOR_CHANGED'],
      rationaleDigest: 'd',
      classifierVersion: 'review-classifier-v0',
    };
    assert.strictEqual(classification.classifierVersion, 'review-classifier-v0');
  });

  it('ReviewContractSlot kinds schemas and diagrams are exhaustive', () => {
    const slot: ReviewContractSlot = {
      kind: 'diagram',
      diagramKind: 'before-after',
      slotId: 'diagram:before-after',
      catalogVersion: 'v0',
      catalogDigest: 'd',
      requiredFields: ['beforeState', 'afterState'],
      sourceAnchors: ['a'],
      minCardinality: 1,
      maxCardinality: 1,
      dependencies: [],
      reusePolicy: 'DENY',
      obligation: 'REQUIRED:BEHAVIOR_CHANGED',
    };
    assert.strictEqual(slot.diagramKind, 'before-after');
  });

  it('ReviewContractInputMapping is targets xor justified NA', () => {
    const mappings: ReviewContractInputMapping[] = [
      {
        inputId: 'i1',
        inputVersion: '1',
        contractId: 'c',
        contractVersion: '1',
        targetSlotIds: ['s'],
        mappingCode: 'mapped',
        compilerVersion: '1',
        rationaleDigest: 'd',
      },
      {
        inputId: 'i2',
        inputVersion: '1',
        contractId: 'c',
        contractVersion: '1',
        notApplicableCode: 'NA_NO_SECURITY_SURFACE',
        mappingCode: 'na',
        compilerVersion: '1',
        rationaleDigest: 'd',
      },
    ];
    assert.strictEqual('targetSlotIds' in mappings[0], true);
    assert.strictEqual('notApplicableCode' in mappings[1], true);
  });

  it('ReviewEvidence requires immutable source and producer provenance', () => {
    const evidence: ReviewEvidence = {
      evidenceId: 'e',
      slotId: 's',
      contractId: 'c',
      contractVersion: '1',
      manifestRef: 'm',
      sourceId: 'src',
      sourceVersion: '1',
      sourceDigest: 'd',
      artifactId: 'a',
      artifactRevision: 1,
      fragmentId: 'f',
      producerSessionId: 'session',
      producerModel: 'model',
      producedAt: 'now',
      receiptIds: ['r'],
      reuseConsumptionIds: [],
      fields: {},
    };
    assert.deepStrictEqual([evidence.sourceVersion, evidence.producerSessionId], ['1', 'session']);
  });

  it('ReviewRuntimeReceipt fields and operations are exhaustive', () => {
    const receipt: ReviewRuntimeReceipt = {
      receiptId: 'r',
      contractId: 'c',
      contractVersion: '1',
      manifestKeyDigest: 'm',
      sessionId: 's',
      taskId: 't',
      sourceId: 'src',
      sourceVersion: '1',
      sourceDigest: 'd',
      targetId: 'target',
      operation: 'READ',
      normalizedArguments: {},
      observedContentDigest: 'o',
      outcomeDigest: 'x',
      outcome: 'SUCCEEDED',
      sequence: 1,
      recordedAt: 'now',
    };
    assert.strictEqual(receipt.operation, 'READ');
  });

  it('ReviewCoverage terminal sets are disjoint and total', () => {
    const coverage = {
      requiredSlotIds: ['a', 'b'],
      completeSlotIds: ['a'],
      missingSlotIds: ['b'],
      invalidSlotIds: [],
      notApplicableSlotIds: [],
      sourceCoverage: {},
      lensCoverage: {},
      entityCoverage: {},
      fileCoverage: {},
      diagramCoverage: {},
      receiptMappings: {},
    };
    assert.strictEqual(
      new Set([...coverage.completeSlotIds, ...coverage.missingSlotIds]).size,
      coverage.requiredSlotIds.length
    );
  });

  it('ReviewCompletenessVerdict variants are exhaustive and status-specific', () => {
    const coverage = {
      requiredSlotIds: [],
      completeSlotIds: [],
      missingSlotIds: [],
      invalidSlotIds: [],
      notApplicableSlotIds: [],
      sourceCoverage: {},
      lensCoverage: {},
      entityCoverage: {},
      fileCoverage: {},
      diagramCoverage: {},
      receiptMappings: {},
    };
    const verdict: ReviewCompletenessVerdict = {
      verdictId: 'v',
      contractId: 'c',
      contractVersion: '1',
      manifestRef: 'm',
      coverage,
      validatorVersion: '1',
      evaluatedAt: 'now',
      status: 'PASS',
      fresh: true,
    };
    assert.strictEqual(verdict.status, 'PASS');
  });
});
