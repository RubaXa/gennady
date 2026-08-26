// @file: Deterministic control-plane review execution owned by PipelineRuntime — runs every
//   trust boundary (manifest/contract preparation, slot fan-out through the AI seam, receipt
//   recording, structural validation, freshness-gated verdict/synthesis publication) before a
//   review DAG becomes queue-eligible.
// @consumers: pipeline-runtime.ts
// @tasks: N/A

import { logger } from '#logger';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { JournalPort } from '../../inbox-core/event-journal.ts';
import type { OpenCodePort } from '../../inbox-opencode/opencode.port.ts';
import type { ReviewManifestCapture } from '../planning/review-input-manifest-builder.ts';
import type { ReviewIntent, ReviewManifestKey } from '../types/review-intent.type.ts';
import type { ReviewArtifact } from '../model/review-artifact.ts';
import type { ReviewEvidence } from '../types/review-evidence.type.ts';
import { writeArtifact, writeArtifactBytes, reportRef } from './artifact-io.ts';
import type {
  PipelineControlPlaneAuthorization,
  PipelineControlPlaneComposition,
  PipelineControlPlanePreparation,
} from './pipeline-runtime.types.ts';

/**
 * @purpose Normalize one immutable manifest key into the freshness transaction revision.
 * @param key Exact observed MR key supplied by the control-plane caller.
 * @returns Canonical head and event cursor revision.
 */
export function manifestRevision(key: ReviewManifestKey): string {
  return `${key.headSHA}:${key.eventCursor}`;
}

/**
 * @purpose Resolve the profile namespace owned by this runtime's receipt store.
 * @param identity Exact runtime identity string (`pipeline-runtime:<namespace>:<uuid>`).
 * @returns Exact namespace embedded in the runtime identity.
 */
export function runtimeNamespace(identity: string): string {
  const prefix = 'pipeline-runtime:';
  return identity.slice(prefix.length, identity.lastIndexOf(':'));
}

/** @purpose Injected dependencies for one deterministic control-plane review execution. */
export type ControlPlaneReviewDeps = {
  /** @purpose Reachable concrete control-plane instances owned by the runtime. */
  controlPlane: PipelineControlPlaneComposition | undefined;
  /** @purpose Separate durable generic journal for control records, never canonical review events. */
  controlJournal: JournalPort | undefined;
  /** @purpose Profile-rooted state directory owning canonical persisted review artifacts. */
  stateDir: string | undefined;
  /** @purpose Production AI seam used by slot fan-out; absent only for deterministic/unit runtimes. */
  opencode: OpenCodePort | undefined;
  /** @purpose Operator-selected model for deterministic control-plane agent turns. */
  controlPlaneModel: string | undefined;
  /** @purpose Stable runtime identity used to derive the receipt-store namespace. */
  identity: string;
  /**
   * @purpose Runtime's manifest/contract preparation seam.
   * @param intent Role-invariant review intent with exact manifest identity.
   * @param capture Complete immutable source capture.
   * @returns Persisted manifest and optional compiled contract.
   */
  prepareControlPlaneReview: (
    intent: ReviewIntent,
    capture: ReviewManifestCapture
  ) => Promise<PipelineControlPlanePreparation>;
};

/**
 * @purpose Execute every deterministic trust boundary before queue eligibility.
 * @param input Exact intent and immutable capture for one round.
 * @param deps Injected control-plane composition, journal, state, AI seam and preparation seam.
 * @returns Authorized manifest and contract after fresh synthesis publication.
 */
export async function executeControlPlaneReview(
  input: Readonly<{ intent: ReviewIntent; capture: ReviewManifestCapture }>,
  deps: ControlPlaneReviewDeps
): Promise<PipelineControlPlaneAuthorization> {
  if (!deps.controlPlane || !deps.controlJournal) {
    throw new Error('[PipelineRuntime#_executeControlPlaneReview] Control plane is unavailable');
  }
  const prepared = await deps.prepareControlPlaneReview(input.intent, input.capture);
  if (prepared.manifest.status !== 'SEALED' || prepared.contract?.status !== 'COMPILED') {
    throw new Error('[PipelineRuntime#_executeControlPlaneReview] Manifest or contract BLOCKED');
  }
  const manifest = prepared.manifest;
  const contract = prepared.contract;
  if (!deps.stateDir || !deps.opencode) {
    throw new Error(
      '[PipelineRuntime#_executeControlPlaneReview] Actual agent runtime evidence is required'
    );
  }
  const reportDir = mrReportsDir(deps.stateDir, reportRef(input.intent.manifestKey.mr));
  const controlDir = join(reportDir, 'control-plane');
  await mkdir(controlDir, { recursive: true });
  await writeArtifact(controlDir, 'manifest.json', manifest as unknown as Record<string, unknown>);
  const artifacts: ReviewArtifact[] = [];
  const evidence: ReviewEvidence[] = [];
  let sequence = 0;
  const execution = await deps.controlPlane.orchestrator.execute(contract, async (slotId) => {
    const slot = contract.slots.find((candidate) => candidate.slotId === slotId);
    if (!slot) return { status: 'FAILED' as const, provenance: ['missing-contract-slot'] };
    const mappedSourceId = contract.inputMappings.find((mapping) =>
      mapping.targetSlotIds?.includes(slotId)
    )?.inputId;
    const dimensionSourceId = slotId.startsWith('dimension:')
      ? `source:${slotId.slice('dimension:'.length)}`
      : slotId === 'lens:general'
        ? 'source:review-lens'
        : undefined;
    const source =
      manifest.inputs.find(
        (candidate) => candidate.inputId === (mappedSourceId ?? dimensionSourceId)
      ) ?? manifest.inputs[0];
    if (!source) return { status: 'FAILED' as const, provenance: ['mapped-source-missing'] };
    const sourceTarget = `control-plane/sources/${createHash('sha256').update(source.inputId).digest('hex')}.txt`;
    const observedSourceBytes = source.capturedBytes ?? source.digest;
    await writeArtifactBytes(reportDir, sourceTarget, observedSourceBytes);
    const operationTitle = `pipeline_control_slot_${createHash('sha256').update(source.inputId).digest('hex')}`;
    const session = await deps.opencode!.createSession({
      title: operationTitle,
      directory: reportDir,
      tools: { read: true, grep: true },
      model: deps.controlPlaneModel,
    });
    const result = await deps.opencode!.prompt(session.sid, {
      system:
        `Execute one review contract slot. First read ${sourceTarget} with the read tool. ` +
        `Then return one JSON object with exactly these three top-level keys and no markdown: ` +
        `{"sourceId":${JSON.stringify(source.inputId)},"content":"concise grounded conclusion","fields":{${slot.requiredFields
          .map((field) => `${JSON.stringify(field)}:"grounded value or explicitly unavailable"`)
          .join(',')}}}. ` +
        `Do not return slotId, kind, evidence, groundedSourceContent, or any other top-level key. ` +
        `Do not invent facts absent from the immutable source.`,
      text: JSON.stringify({
        slotId: slot.slotId,
        kind: slot.kind,
        requiredFields: slot.requiredFields,
        sourceAnchors: slot.sourceAnchors,
        sourceId: source.inputId,
        sourceTarget,
      }),
      format: {
        type: 'json_schema',
        schema: {
          title: 'pipeline_control_slot',
          type: 'object',
          required: ['sourceId', 'content', 'fields'],
          properties: {
            sourceId: { type: 'string' },
            content: { type: 'string' },
            fields: { type: 'object' },
          },
        },
      },
    });
    if (!result.ok && result.error.details?.retryable === false) {
      await deps.opencode!.close(session.sid);
      const error = new Error(
        `[PipelineRuntime#_executeControlPlaneReview] Non-retryable ${result.error.class} for ${deps.controlPlaneModel ?? 'server-default'}: ${result.error.signal ?? 'No provider diagnostic'}`,
        { cause: result.error }
      );
      logger.error('[PipelineRuntime#_executeControlPlaneReview] [executing → provider_failed]', {
        mr: input.intent.manifestKey.mr,
        slotId,
        sourceId: source.inputId,
        sessionId: session.sid,
        model: deps.controlPlaneModel ?? 'server-default',
        provider: result.error.details?.providerID,
        modelID: result.error.details?.modelID,
        statusCode: result.error.details?.statusCode,
        retryable: result.error.details?.retryable,
        error,
      });
      throw error;
    }
    if (!result.ok) {
      logger.warn('[PipelineRuntime#_executeControlPlaneReview] [executing → slot_failed]', {
        mr: input.intent.manifestKey.mr,
        slotId,
        sourceId: source.inputId,
        sessionId: session.sid,
        model: deps.controlPlaneModel ?? 'server-default',
        outcome: result.error.class,
        signal: result.error.signal,
        retryable: result.error.details?.retryable,
      });
    }
    const calls = await deps.opencode!.toolCalls(session.sid);
    const trace = await deps.opencode!.toolCallTrace(session.sid);
    await deps.opencode!.close(session.sid);
    if (!result.ok || calls.length === 0 || trace.length === 0) {
      return { status: 'FAILED' as const, provenance: ['agent-output-or-tool-receipt-missing'] };
    }
    const content = typeof result.output.content === 'string' ? result.output.content.trim() : '';
    const fields =
      result.output.fields && typeof result.output.fields === 'object'
        ? (result.output.fields as Record<string, unknown>)
        : {};
    if (
      !content ||
      slot.requiredFields.some((field) => !(field in fields)) ||
      !calls.some((call) => call.tool === 'read' && call.path.endsWith(sourceTarget)) ||
      !trace.some(
        (entry) =>
          entry.tool === 'read' &&
          entry.input.endsWith(sourceTarget) &&
          entry.status === 'completed'
      )
    ) {
      return { status: 'FAILED' as const, provenance: ['agent-evidence-invalid'] };
    }
    sequence += 1;
    const recorded = await deps.controlPlane!.receiptRecorder.recordTrustedOperation(
      {
        namespace: runtimeNamespace(deps.identity),
        contractId: contract.contractId,
        manifestKeyDigest: contract.manifestKeyDigest,
        contractVersion: contract.contractVersion,
        sessionId: session.sid,
        taskId: `slot:${slotId}`,
        nextSequence: sequence,
      },
      async () => {
        const observedBytes = await readFile(join(reportDir, sourceTarget), 'utf8');
        const observedSourceDigest = createHash('sha256').update(observedBytes).digest('hex');
        if (observedSourceDigest !== source.digest) {
          throw new Error(
            '[PipelineRuntime#_executeControlPlaneReview] Observed source digest mismatch'
          );
        }
        return {
          sourceId: source.inputId,
          sourceVersion: source.version,
          sourceDigest: observedSourceDigest,
          targetId: sourceTarget,
          operation: 'READ' as const,
          normalizedArguments: {
            path: sourceTarget,
            toolCalls: JSON.stringify(calls),
            trace: JSON.stringify(trace),
          },
          semanticAnchor: source.canonicalIdentity,
          content: observedBytes,
          outcome: trace.map((entry) => ({
            seq: entry.seq,
            tool: entry.tool,
            status: entry.status,
            outputBytes: entry.outputBytes ?? 0,
          })),
          status: 'SUCCEEDED' as const,
          observedAt: new Date().toISOString(),
        };
      }
    );
    if (recorded.status !== 'ELIGIBLE') {
      return { status: 'FAILED' as const, provenance: [`receipt-rejected:${recorded.reason}`] };
    }
    const artifactId = `artifact:${contract.contractId}:${slotId}`;
    const fragmentId = `fragment:${contract.contractId}:${slotId}`;
    artifacts.push({
      artifactId,
      revision: 1,
      manifestRef: manifest.ref,
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      producerSessionId: session.sid,
      producerModel: 'opencode-control-plane',
      fragments: [
        {
          fragmentId,
          slotId,
          anchor: source.canonicalIdentity,
          content,
          fields,
        },
      ],
      createdAt: new Date().toISOString(),
    });
    evidence.push({
      evidenceId: `evidence:${contract.contractId}:${slotId}`,
      slotId,
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      manifestRef: manifest.ref,
      sourceId: source.inputId,
      sourceVersion: source.version,
      sourceDigest: source.digest,
      artifactId,
      artifactRevision: 1,
      fragmentId,
      producerSessionId: session.sid,
      producerModel: 'opencode-control-plane',
      producedAt: new Date().toISOString(),
      receiptIds: [recorded.receipt.receiptId],
      reuseConsumptionIds: [],
      fields,
    });
    return { status: 'COMPLETE' as const, provenance: [recorded.durableDigest] };
  });
  if (execution.status !== 'COMPLETED') {
    throw new Error('[PipelineRuntime#_executeControlPlaneReview] Slot execution BLOCKED');
  }
  await writeArtifact(controlDir, 'artifacts.json', { artifacts });
  await writeArtifact(controlDir, 'evidence.json', { evidence });
  const persistedArtifacts = JSON.parse(
    await readFile(join(controlDir, 'artifacts.json'), 'utf8')
  ) as {
    artifacts?: ReviewArtifact[];
  };
  const persistedEvidence = JSON.parse(
    await readFile(join(controlDir, 'evidence.json'), 'utf8')
  ) as {
    evidence?: ReviewEvidence[];
  };
  const verdict = deps.controlPlane.structuralValidator.validate({
    manifest,
    contract,
    artifacts: persistedArtifacts.artifacts ?? [],
    evidence: persistedEvidence.evidence ?? [],
    storeContext: {
      namespace: runtimeNamespace(deps.identity),
      contractId: contract.contractId,
      manifestKeyDigest: contract.manifestKeyDigest,
    },
    attempt: 0,
    maxAttempts: 3,
  });
  if (verdict.status !== 'PASS') {
    await deps.controlPlane
      .repairCoordinator(input.intent.manifestKey, contract.contractId)
      .planTargetedRepair(contract, verdict);
    await deps.controlJournal.append({
      ts: new Date().toISOString(),
      mr: input.intent.manifestKey.mr,
      kind: 'system',
      actor: 'review-control-plane',
      payload: { event: 'validation_terminal', status: verdict.status, verdict },
    });
    throw new Error('[PipelineRuntime#_executeControlPlaneReview] Structural validation BLOCKED');
  }
  const guardedVerdict = await deps.controlPlane.freshnessGate.guard(
    'VERDICT',
    input.intent.manifestKey,
    () => manifestRevision(input.intent.manifestKey),
    () => verdict
  );
  if (guardedVerdict.status !== 'FRESH') {
    throw new Error(
      `[PipelineRuntime#_executeControlPlaneReview] Verdict ${guardedVerdict.status}`
    );
  }
  const synthesis = deps.controlPlane.synthesis.construct(contract.ref, verdict, evidence, {
    facts: [`contract:${contract.contractId}`],
    risks: [],
    conflicts: [],
    recommendationInputs: [],
    provenance: execution.provenance,
  });
  if ('status' in synthesis) {
    throw new Error(`[PipelineRuntime#_executeControlPlaneReview] Synthesis ${synthesis.status}`);
  }
  const publication = await deps.controlPlane.freshnessGate.guard(
    'SYNTHESIS_PUBLICATION',
    input.intent.manifestKey,
    () => manifestRevision(input.intent.manifestKey),
    async () => {
      await deps.controlJournal!.append({
        ts: new Date().toISOString(),
        mr: input.intent.manifestKey.mr,
        kind: 'system',
        actor: 'review-control-plane',
        payload: { event: 'synthesis_terminal', status: 'PASS', synthesis },
      });
      return synthesis;
    }
  );
  if (publication.status !== 'FRESH') {
    throw new Error(
      `[PipelineRuntime#_executeControlPlaneReview] Publication ${publication.status}`
    );
  }
  return Object.freeze({ intent: input.intent, manifest, contract });
}
