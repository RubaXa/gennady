// @file: Closed machine-readable review contract slot definitions.
// @consumers: ReviewContract, ReviewContractCompiler, ReviewStructuralValidator
// @tasks: TSK-176

/** @purpose Closed slot kind catalog for the v0 review contract. */
export type ReviewContractSlotKind =
  | 'goal'
  | 'architecture'
  | 'specification'
  | 'tests'
  | 'security'
  | 'optimality'
  | 'file'
  | 'entity'
  | 'discussion'
  | 'review-lens'
  | 'artifact-section'
  | 'diagram';

/** @purpose Distinct structural diagram contracts that cannot substitute for each other. */
export type ReviewDiagramKind = 'entity-dependency' | 'before-after' | 'runtime-event-flow';

/** @purpose Compiler-owned evidence reuse policy for one slot. */
export type ReviewEvidenceReusePolicy = 'DENY' | 'EXPLICIT_SEPARATE_CONSUMPTION';

/** @purpose Shared deterministic acceptance constraints for any contract slot. */
export type ReviewContractSlotBase = {
  /** @purpose Stable address used by artifacts, receipts and repair tasks. */
  slotId: string;
  /** @purpose Exact released catalog version. */
  catalogVersion: string;
  /** @purpose Exact released catalog digest. */
  catalogDigest: string;
  /** @purpose Schema field names that evidence must contain. */
  requiredFields: string[];
  /** @purpose Immutable source anchors the worker must inspect. */
  sourceAnchors: string[];
  /** @purpose Minimum accepted evidence fragments. */
  minCardinality: number;
  /** @purpose Maximum accepted evidence fragments. */
  maxCardinality: number;
  /** @purpose Slot dependencies that must precede this obligation. */
  dependencies: string[];
  /** @purpose Compiler-selected cross-slot reuse policy. */
  reusePolicy: ReviewEvidenceReusePolicy;
  /** @purpose Compiler-owned required or NA terminal policy code. */
  obligation: `REQUIRED:${string}` | `NA_${string}`;
};

/** @purpose Non-diagram review obligation with its exact v0 kind. */
export type ReviewContentSlot = ReviewContractSlotBase & {
  kind: Exclude<ReviewContractSlotKind, 'diagram'>;
};

/** @purpose Diagram obligation with a distinct typed structural predicate. */
export type ReviewDiagramSlot = ReviewContractSlotBase & {
  kind: 'diagram';
  diagramKind: ReviewDiagramKind;
};

/** @purpose Exhaustive closed union of content and typed diagram obligations. */
export type ReviewContractSlot = ReviewContentSlot | ReviewDiagramSlot;
