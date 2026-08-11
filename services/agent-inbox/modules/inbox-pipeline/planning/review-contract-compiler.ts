// @file: Atomic deterministic compiler from sealed manifest to total Review Contract.
// @consumers: ReviewOrchestrator, inbox-eval
// @tasks: TSK-176

import { createHash } from 'node:crypto';
import type { ReviewInputManifest } from '../model/review-input-manifest.ts';
import type { ReviewContract, ReviewContractCompilationResult } from '../model/review-contract.ts';
import { ReviewSlotSchemaCatalog } from '../model/review-slot-schema-catalog.ts';
import type { ReviewContractInputMapping } from '../types/review-contract-input-mapping.type.ts';
import type {
  ReviewContractSlot,
  ReviewContractSlotKind,
  ReviewDiagramKind,
} from '../types/review-contract-slot.type.ts';
import type { ReviewIntent } from '../types/review-intent.type.ts';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const DIMENSIONS: readonly Exclude<
  ReviewContractSlotKind,
  'diagram' | 'file' | 'entity' | 'discussion' | 'review-lens' | 'artifact-section'
>[] = ['goal', 'architecture', 'specification', 'tests', 'security', 'optimality'];

/**
 * @purpose Compile all review obligations without consulting agent output.
 * @invariant A mapping gap, collision or unknown classification publishes no partial contract.
 */
export class ReviewContractCompiler {
  /** @purpose Exact deterministic compiler release. */
  readonly compilerVersion = 'review-contract-compiler-v0';
  /** @purpose Exact released schema and policy catalog. */
  protected readonly _catalog: ReviewSlotSchemaCatalog;
  /** @purpose Journal callback persisting every atomic terminal result. */
  protected readonly _persist: (result: ReviewContractCompilationResult) => void;

  /**
   * @purpose Configure deterministic compilation against one exact catalog.
   * @param catalog Exact released schema and policy catalog.
   * @param [persist] Journal persistence callback.
   */
  constructor(
    catalog: ReviewSlotSchemaCatalog,
    persist: (result: ReviewContractCompilationResult) => void = () => undefined
  ) {
    this._catalog = catalog;
    this._persist = persist;
  }

  /**
   * @purpose Atomically compile stable slots and total input mappings from one sealed manifest.
   * @param manifest Complete sealed immutable source inventory.
   * @param intent Valid role-invariant review request.
   * @returns Atomic compiled contract or persisted BLOCKED result.
   */
  compileAtomically(
    manifest: ReviewInputManifest,
    intent: ReviewIntent
  ): ReviewContractCompilationResult {
    const contractVersion = 'review-contract-v0';
    const contractSeed = digest({
      manifestRef: manifest.ref,
      intent,
      compilerVersion: this.compilerVersion,
      catalog: this._catalog.digest,
    });
    const contractId = `contract:${contractSeed}`;
    const slots: ReviewContractSlot[] = DIMENSIONS.map((kind) =>
      this._contentSlot(kind, `dimension:${kind}`, manifest)
    );
    for (const input of manifest.inputs) {
      const slotKind = input.kind === 'source' ? 'artifact-section' : input.kind;
      slots.push(
        this._contentSlot(slotKind, `${slotKind}:${input.canonicalIdentity}`, manifest, [
          input.canonicalIdentity,
        ])
      );
    }
    slots.push(this._contentSlot('review-lens', 'lens:general', manifest));
    for (const diagramKind of this._diagramKinds(manifest))
      slots.push(this._diagramSlot(diagramKind, manifest));
    const slotIds = slots.map((slot) => slot.slotId);
    const duplicateSlots = slotIds.filter((slotId, index) => slotIds.indexOf(slotId) !== index);
    const classificationByInput = new Map(
      manifest.classifications.map((item) => [item.inputId, item])
    );
    const inputMappings: ReviewContractInputMapping[] = [];
    const mappingGaps: string[] = [];
    for (const input of manifest.inputs) {
      const classification = classificationByInput.get(input.inputId);
      if (!classification) {
        mappingGaps.push(input.inputId);
        continue;
      }
      const kind = input.kind === 'source' ? 'artifact-section' : input.kind;
      const targetSlotId = `${kind}:${input.canonicalIdentity}`;
      inputMappings.push({
        inputId: input.inputId,
        inputVersion: input.version,
        contractId,
        contractVersion,
        targetSlotIds: [targetSlotId],
        mappingCode:
          classification.code === 'UNKNOWN_FILE_CLASSIFICATION'
            ? `file-fallback:${input.canonicalIdentity}`
            : `mapped:${classification.code}`,
        compilerVersion: this.compilerVersion,
        rationaleDigest: classification.rationaleDigest,
      });
    }
    if (
      duplicateSlots.length ||
      mappingGaps.length ||
      inputMappings.length !== manifest.inputs.length
    ) {
      const blocked: ReviewContractCompilationResult = Object.freeze({
        status: 'BLOCKED',
        manifestRef: manifest.ref,
        reasons: [
          `duplicateSlots=${duplicateSlots.join(',')}`,
          `mappingGaps=${mappingGaps.join(',')}`,
        ],
        persisted: true,
      });
      this._persist(blocked);
      return blocked;
    }
    const semantic = {
      contractId,
      contractVersion,
      manifestRef: manifest.ref,
      intent,
      slots,
      inputMappings,
      catalogVersion: this._catalog.version,
      catalogDigest: this._catalog.digest,
      compilerVersion: this.compilerVersion,
    };
    const contract: ReviewContract = Object.freeze({
      status: 'COMPILED',
      ...semantic,
      ref: `${contractId}:${digest(semantic)}`,
      manifestKeyDigest: digest(manifest.key),
      semanticDigest: digest(semantic),
    });
    this._persist(contract);
    return contract;
  }

  /**
   * @purpose Materialize one content obligation from released schema policy.
   * @param kind Closed content slot kind.
   * @param slotId Stable deterministic slot identity.
   * @param manifest Complete sealed source inventory.
   * @param [sourceAnchors] Immutable required source anchors.
   * @returns Exact content slot definition.
   */
  protected _contentSlot(
    kind: Exclude<ReviewContractSlotKind, 'diagram'>,
    slotId: string,
    manifest: ReviewInputManifest,
    sourceAnchors: string[] = [manifest.ref]
  ): ReviewContractSlot {
    const schema = this._catalog.resolveContentSchema(kind);
    return {
      kind,
      slotId,
      catalogVersion: this._catalog.version,
      catalogDigest: this._catalog.digest,
      requiredFields: [...schema.requiredFields],
      sourceAnchors,
      minCardinality: schema.minCardinality,
      maxCardinality: schema.maxCardinality,
      dependencies: [],
      reusePolicy: 'DENY',
      obligation: this._catalog.resolveDimensionObligation(kind, manifest.changeShape),
    };
  }

  /**
   * @purpose Materialize one typed diagram obligation.
   * @param kind Closed diagram kind.
   * @param manifest Complete sealed source inventory.
   * @returns Exact typed diagram slot.
   */
  protected _diagramSlot(
    kind: ReviewDiagramKind,
    manifest: ReviewInputManifest
  ): ReviewContractSlot {
    const schema = this._catalog.resolveDiagramSchema(kind);
    return {
      kind: 'diagram',
      diagramKind: kind,
      slotId: `diagram:${kind}`,
      catalogVersion: this._catalog.version,
      catalogDigest: this._catalog.digest,
      requiredFields: [...schema.requiredFields],
      sourceAnchors: [manifest.ref],
      minCardinality: schema.minCardinality,
      maxCardinality: schema.maxCardinality,
      dependencies: [],
      reusePolicy: 'DENY',
      obligation: `REQUIRED:${kind}`,
    };
  }

  /**
   * @purpose Derive independently required diagram kinds.
   * @param manifest Complete sealed source inventory.
   * @returns Distinct typed diagram obligations.
   */
  protected _diagramKinds(manifest: ReviewInputManifest): ReviewDiagramKind[] {
    const kinds: ReviewDiagramKind[] = ['entity-dependency'];
    if (
      manifest.changeShape.includes('ARCHITECTURE_CHANGED') ||
      manifest.changeShape.includes('BEHAVIOR_CHANGED')
    )
      kinds.push('before-after');
    if (manifest.changeShape.includes('RUNTIME_FLOW_CHANGED')) kinds.push('runtime-event-flow');
    return kinds;
  }
}
