// @file: Total manifest-input to contract-slot mapping forms.
// @consumers: ReviewContractCompiler, ReviewStructuralValidator
// @tasks: TSK-176

/** @purpose Closed compiler-owned reasons for a manifest input to be not applicable. */
export type ReviewNotApplicableCode =
  | 'NA_NO_ARCHITECTURE_CHANGE'
  | 'NA_NO_SPECIFICATION_SURFACE'
  | 'NA_NO_SECURITY_SURFACE'
  | 'NA_NO_RUNTIME_FLOW'
  | 'NA_NO_OPTIMALITY_SIGNAL';

/** @purpose Input mapping that terminates in one or more required slot targets. */
export type ReviewTargetInputMapping = {
  /** @purpose Canonical manifest input identity. */
  inputId: string;
  /** @purpose Exact immutable input version. */
  inputVersion: string;
  /** @purpose Owning contract identity. */
  contractId: string;
  /** @purpose Exact owning contract version. */
  contractVersion: string;
  /** @purpose Non-empty compiler-selected slot targets. */
  targetSlotIds: [string, ...string[]];
  /** @purpose Closed deterministic mapping code. */
  mappingCode: string;
  /** @purpose Exact compiler release. */
  compilerVersion: string;
  /** @purpose Digest of compiler-owned mapping rationale. */
  rationaleDigest: string;
  /** @purpose Excludes simultaneous NA terminal form. */
  notApplicableCode?: never;
};

/** @purpose Input mapping that terminates in one justified compiler-owned NA decision. */
export type ReviewNotApplicableInputMapping = {
  /** @purpose Canonical manifest input identity. */
  inputId: string;
  /** @purpose Exact immutable input version. */
  inputVersion: string;
  /** @purpose Owning contract identity. */
  contractId: string;
  /** @purpose Exact owning contract version. */
  contractVersion: string;
  /** @purpose Excludes simultaneous target terminal form. */
  targetSlotIds?: never;
  /** @purpose Closed deterministic mapping code. */
  mappingCode: string;
  /** @purpose Exact compiler release. */
  compilerVersion: string;
  /** @purpose Digest of compiler-owned mapping rationale. */
  rationaleDigest: string;
  /** @purpose Compiler-owned closed NA reason. */
  notApplicableCode: ReviewNotApplicableCode;
};

/** @purpose XOR terminal mapping for every immutable manifest input. */
export type ReviewContractInputMapping = ReviewTargetInputMapping | ReviewNotApplicableInputMapping;
