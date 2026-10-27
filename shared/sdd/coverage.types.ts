// @file: Explicit read-only inputs and outputs for declared SDD coverage, without repository snapshots.
// @spec: SHARED
// @consumers: coverage resolver, future orient/check/phase adapters

/** @purpose Invocation context determines when a missing implementation header blocks progress. */
export type CoverageStage = 'authoring' | 'preflight' | 'phase-exit' | 'audit';

/** @purpose Canonical ownership declarations; children are structural edges, never arbitrary links. */
export type CoverageSpec = {
  /** @purpose Stable explicit Spec-ID. */
  readonly id: string;
  /** @purpose Canonical repo-relative specification path. */
  readonly path: string;
  /** @purpose Structurally declared child IDs only. */
  readonly children: readonly string[];
  /** @purpose Literal implementation paths declared by File Mapping. */
  readonly files: readonly string[];
};

/** @purpose One explicit phase claim; read-only context does not acquire ownership. */
export type CoverageTarget = {
  /** @purpose Canonical task identity. */
  readonly task: string;
  /** @purpose Exact phase identity within the task. */
  readonly phase: string;
  /** @purpose Declared expected implementation owner. */
  readonly specId: string;
  /** @purpose Literal repo-relative target path. */
  readonly path: string;
  /** @purpose Read context versus an implementation or deletion obligation. */
  readonly operation: 'read' | 'write' | 'delete';
};

/** @purpose Fresh caller-owned observations; adapters must inspect paths without following symlinks. */
export type CoverageObservation = {
  /** @purpose Observed literal repo-relative path. */
  readonly path: string;
  /** @purpose File materialization or failure of safe path inspection. */
  readonly state: 'file' | 'missing' | 'unsafe';
  /** @purpose Every current header occurrence; duplicates remain visible. */
  readonly specIds: readonly string[];
  /** @purpose Prior Git header claims for removal/disappearance detection. */
  readonly previousSpecIds?: readonly string[];
};

/** @purpose A bounded projection, not a request to enumerate every implementation file. */
export type CoverageSelection =
  | { readonly kind: 'project' }
  | { readonly kind: 'spec'; readonly id: string }
  | { readonly kind: 'phase'; readonly task: string; readonly phase: string };

/** @purpose Fully supplied evidence; the pure core performs no filesystem, process or network I/O. */
export type CoverageInput = {
  /** @purpose Lifecycle boundary being diagnosed. */
  readonly stage: CoverageStage;
  /** @purpose Requested bounded projection. */
  readonly selection: CoverageSelection;
  /** @purpose Canonical current specification declarations. */
  readonly specs: readonly CoverageSpec[];
  /** @purpose Current phase claims, not an unqualified union of historical edits. */
  readonly targets: readonly CoverageTarget[];
  /** @purpose Fresh observations for every selected declared path. */
  readonly observations: readonly CoverageObservation[];
};

/** @purpose Stable diagnostic identity; pending is visible incompleteness, never successful verification. */
export type CoverageFinding = {
  /** @purpose Stable machine-readable diagnosis. */
  readonly code: string;
  /** @purpose Blocking inconsistency or visible incomplete obligation. */
  readonly severity: 'error' | 'pending';
  /** @purpose Affected source/spec identity, or empty for request-level errors. */
  readonly path: string;
  /** @purpose Actionable explanation without invented verification evidence. */
  readonly detail: string;
};

/** @purpose One exact path and explainable provenance, independent from model-generated explanations. */
export type CoverageRow = {
  /** @purpose One selected implementation path. */
  readonly path: string;
  /** @purpose Expected canonical owners; more than one is conflicting. */
  readonly owners: readonly string[];
  /** @purpose Sorted declaration/header origins explaining inclusion. */
  readonly sources: readonly string[];
  /** @purpose Diagnosed consistency, incompleteness, deletion or error. */
  readonly state: 'consistent' | 'pending' | 'deleted' | 'invalid';
};

/** @purpose Ownership diagnosis only; never a substitute for a runner-owned Verify report. */
export type CoverageResult = {
  /** @purpose Lifecycle boundary of this diagnosis. */
  readonly stage: CoverageStage;
  /** @purpose No error or pending obligation remains in the selected projection. */
  readonly complete: boolean;
  /** @purpose Preparation may proceed with pending; completion/audit may not. */
  readonly canProceed: boolean;
  /** @purpose Path-sorted coverage rows, not the repository's entire file list. */
  readonly rows: readonly CoverageRow[];
  /** @purpose Deterministically sorted actionable findings. */
  readonly findings: readonly CoverageFinding[];
};
