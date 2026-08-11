// @file: Closed versioned schemas and deterministic slot policies for review contracts.
// @consumers: ReviewContractCompiler, ReviewStructuralValidator
// @tasks: TSK-176

import { createHash } from 'node:crypto';
import type { ReviewChangeShapeCode } from '../types/review-input-classification.type.ts';
import type {
  ReviewContractSlotKind,
  ReviewDiagramKind,
} from '../types/review-contract-slot.type.ts';

/** @purpose Mechanical field/cardinality predicate for one slot kind. */
export type ReviewSlotSchema = Readonly<{
  requiredFields: readonly string[];
  minCardinality: number;
  maxCardinality: number;
}>;

const SLOT_SCHEMAS: Record<Exclude<ReviewContractSlotKind, 'diagram'>, ReviewSlotSchema> = {
  goal: {
    requiredFields: ['objective', 'acceptance', 'outOfScope', 'sourceAnchors'],
    minCardinality: 1,
    maxCardinality: 1,
  },
  architecture: {
    requiredFields: ['components', 'dependencies', 'invariants', 'decisions', 'sourceAnchors'],
    minCardinality: 1,
    maxCardinality: 1,
  },
  specification: {
    requiredFields: ['requirementIds', 'behavior', 'observedDrift', 'sourceAnchors'],
    minCardinality: 1,
    maxCardinality: 1,
  },
  tests: {
    requiredFields: [
      'changedBehavior',
      'positiveScenarios',
      'negativeScenarios',
      'coverageGaps',
      'sourceAnchors',
    ],
    minCardinality: 1,
    maxCardinality: 1,
  },
  security: {
    requiredFields: ['trustBoundaries', 'assets', 'threats', 'mitigations', 'sourceAnchors'],
    minCardinality: 1,
    maxCardinality: 1,
  },
  optimality: {
    requiredFields: ['resources', 'bottlenecks', 'alternatives', 'sourceAnchors'],
    minCardinality: 1,
    maxCardinality: 1,
  },
  file: {
    requiredFields: [
      'identity',
      'purpose',
      'observedChanges',
      'dependencies',
      'risks',
      'testImpact',
    ],
    minCardinality: 1,
    maxCardinality: 1,
  },
  entity: {
    requiredFields: ['identity', 'responsibility', 'dependencies', 'risks', 'testImpact'],
    minCardinality: 1,
    maxCardinality: 1,
  },
  discussion: {
    requiredFields: [
      'threadVersion',
      'claims',
      'codeContext',
      'independentAssessment',
      'recommendationInput',
    ],
    minCardinality: 1,
    maxCardinality: 1,
  },
  'review-lens': {
    requiredFields: ['lensId', 'lensVersion', 'observations', 'evidenceRefs', 'conclusion'],
    minCardinality: 1,
    maxCardinality: 1,
  },
  'artifact-section': {
    requiredFields: ['sectionId', 'schema', 'fragments', 'anchors', 'evidenceRefs'],
    minCardinality: 1,
    maxCardinality: 1,
  },
};

const DIAGRAM_FIELDS: Record<ReviewDiagramKind, readonly string[]> = {
  'entity-dependency': ['diagramType', 'typedNodes', 'dependencyEdges', 'sourceAnchors'],
  'before-after': ['diagramType', 'beforeState', 'afterState', 'changedRelations', 'sourceAnchors'],
  'runtime-event-flow': [
    'diagramType',
    'orderedActors',
    'orderedEvents',
    'branches',
    'terminalOutcomes',
    'sourceAnchors',
  ],
};

/** @purpose Released deterministic source of slot schemas, NA rules and diagram predicates. */
export class ReviewSlotSchemaCatalog {
  /** @purpose Exact released catalog version. */
  readonly version = 'review-slot-catalog-v0';
  /** @purpose Digest of all released structural predicates. */
  readonly digest: string;

  /** @purpose Construct one immutable released catalog. */
  constructor() {
    this.digest = createHash('sha256')
      .update(JSON.stringify({ SLOT_SCHEMAS, DIAGRAM_FIELDS }))
      .digest('hex');
  }

  /**
   * @purpose Resolve one exact content slot schema or fail closed for unknown kind.
   * @param kind Closed content slot kind.
   * @returns Exact released structural schema.
   */
  resolveContentSchema(kind: Exclude<ReviewContractSlotKind, 'diagram'>): ReviewSlotSchema {
    const schema = SLOT_SCHEMAS[kind];
    if (!schema)
      throw new Error(`[ReviewSlotSchemaCatalog#resolveContentSchema] Unknown slot kind ${kind}`);
    return schema;
  }

  /**
   * @purpose Resolve a diagram-specific field predicate that cannot be generically substituted.
   * @param kind Closed typed diagram kind.
   * @returns Exact diagram structural schema.
   */
  resolveDiagramSchema(kind: ReviewDiagramKind): ReviewSlotSchema {
    const requiredFields = DIAGRAM_FIELDS[kind];
    if (!requiredFields)
      throw new Error(
        `[ReviewSlotSchemaCatalog#resolveDiagramSchema] Unknown diagram kind ${kind}`
      );
    return { requiredFields, minCardinality: 1, maxCardinality: 1 };
  }

  /**
   * @purpose Derive the closed NA code for one optional review dimension.
   * @param kind Review contract slot kind.
   * @param shape Normalized deterministic change shape.
   * @returns Compiler-owned required or NA obligation code.
   */
  resolveDimensionObligation(
    kind: ReviewContractSlotKind,
    shape: readonly ReviewChangeShapeCode[]
  ): `REQUIRED:${string}` | `NA_${string}` {
    if (kind === 'goal' || kind === 'tests' || kind === 'file' || kind === 'entity')
      return 'REQUIRED:BASELINE';
    if (kind === 'architecture')
      return shape.includes('ARCHITECTURE_CHANGED')
        ? 'REQUIRED:ARCHITECTURE_CHANGED'
        : 'NA_NO_ARCHITECTURE_CHANGE';
    if (kind === 'specification')
      return shape.includes('SPECIFICATION_TOUCHED')
        ? 'REQUIRED:SPECIFICATION_TOUCHED'
        : 'NA_NO_SPECIFICATION_SURFACE';
    if (kind === 'security')
      return shape.includes('SECURITY_SURFACE_CHANGED')
        ? 'REQUIRED:SECURITY_SURFACE_CHANGED'
        : 'NA_NO_SECURITY_SURFACE';
    if (kind === 'optimality')
      return shape.includes('OPTIMALITY_RELEVANT')
        ? 'REQUIRED:OPTIMALITY_RELEVANT'
        : 'NA_NO_OPTIMALITY_SIGNAL';
    return 'REQUIRED:INPUT';
  }
}
