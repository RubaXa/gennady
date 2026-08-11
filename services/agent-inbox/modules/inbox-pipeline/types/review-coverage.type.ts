// @file: Explainable terminal coverage projection for one review contract.
// @consumers: ReviewCompletenessVerdict, ReviewPlan, dashboard projections
// @tasks: TSK-176

/** @purpose Total disjoint accounting of contract slots and trusted source use. */
export type ReviewCoverage = {
  /** @purpose Complete required slot target. */
  requiredSlotIds: string[];
  /** @purpose Slots closed by structurally valid trusted evidence. */
  completeSlotIds: string[];
  /** @purpose Slots with no addressable evidence. */
  missingSlotIds: string[];
  /** @purpose Slots with present but invalid evidence. */
  invalidSlotIds: string[];
  /** @purpose Compiler-justified NA slots. */
  notApplicableSlotIds: string[];
  /** @purpose Source-to-slot coverage projection. */
  sourceCoverage: Record<string, string[]>;
  /** @purpose Review-lens-to-slot coverage projection. */
  lensCoverage: Record<string, string[]>;
  /** @purpose Entity-to-slot coverage projection. */
  entityCoverage: Record<string, string[]>;
  /** @purpose File-to-slot coverage projection. */
  fileCoverage: Record<string, string[]>;
  /** @purpose Typed-diagram-to-slot coverage projection. */
  diagramCoverage: Record<string, string[]>;
  /** @purpose Durable trusted receipt mappings by slot. */
  receiptMappings: Record<string, string[]>;
};
