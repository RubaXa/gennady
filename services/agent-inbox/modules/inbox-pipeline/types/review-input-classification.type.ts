// @file: Versioned review input classification and closed change-shape codes.
// @consumers: ReviewInputManifestBuilder, ReviewContractCompiler
// @tasks: TSK-176

/** @purpose Closed deterministic change-shape vocabulary for review contract compilation. */
export type ReviewChangeShapeCode =
  | 'GOAL_CHANGED'
  | 'ARCHITECTURE_CHANGED'
  | 'SPECIFICATION_TOUCHED'
  | 'BEHAVIOR_CHANGED'
  | 'TEST_SURFACE_CHANGED'
  | 'SECURITY_SURFACE_CHANGED'
  | 'OPTIMALITY_RELEVANT'
  | 'ENTITY_SET_CHANGED'
  | 'RUNTIME_FLOW_CHANGED'
  | 'DISCUSSION_CHANGED'
  | 'UNKNOWN_FILE_CLASSIFICATION';

/** @purpose Compiler-independent classification of one immutable manifest input. */
export type ReviewInputClassification = {
  /** @purpose Canonical input identity within the manifest. */
  inputId: string;
  /** @purpose Closed classification code selected by the deterministic classifier. */
  code: ReviewChangeShapeCode;
  /** @purpose Normalized change-shape contributions. */
  changeShape: ReviewChangeShapeCode[];
  /** @purpose Stable rationale digest for reproducibility. */
  rationaleDigest: string;
  /** @purpose Exact classifier release. */
  classifierVersion: string;
};
