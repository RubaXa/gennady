// @file: Typed boundary of the pure SDD v2 file-relations resolver.
// @spec: SHARED
// @consumers: file-relations

import type { FlowVersion } from './flow.ts';

/** @purpose The seven evidence classes fixed by FO-1. */
export type FileRelationEvidence =
  | 'declared'
  | 'active'
  | 'verified-target'
  | 'git-attributed'
  | 'deleted'
  | 'declared-only-closed'
  | 'unknown';

/** @purpose Stable finding codes fixed by the closed FO-1 ADR registry. */
export type FileRelationFindingCode =
  | 'SDD_FILE_SPEC_OWNER_UNRESOLVED'
  | 'SDD_FILE_SPEC_OWNER_AMBIGUOUS'
  | 'SDD_FILE_ACTIVE_WRITERS_COLLISION'
  | 'SDD_FILE_ACTIVE_SPEC_MISMATCH'
  | 'SDD_FILE_TARGET_PATH_INVALID'
  | 'SDD_FILE_PROVENANCE_UNKNOWN'
  | 'SDD_FILE_V2_TASKS_FORBIDDEN'
  | 'SDD_FILE_ACTIVE_PLANNED_OVERLAP';

/** @purpose Caller-resolved canonical `@spec` identity; FO-2 does not invent a registry format. */
export type FileSpecResolution =
  | { status: 'resolved'; id: string; path: string }
  | { status: 'unresolved'; id: string | null }
  | { status: 'ambiguous'; id: string; candidates: readonly string[] };

/** @purpose Mechanical lifecycle state of one parsed ticket. */
export type FileRelationTicketStatus = 'todo' | 'in-progress' | 'blocked' | 'done' | 'unknown';

/** @purpose Mechanical lifecycle state of one parsed phase row. */
export type FileRelationPhaseState = 'todo' | 'in-progress' | 'blocked' | 'done' | 'unknown';

/** @purpose Stronger evidence already validated by canonical receipt/Git adapters. */
export type FileRelationEvidenceInput = {
  /** @purpose Exact repo-relative path supported by this evidence. */
  path: string;
  /** @purpose Validated evidence class, including explicit unsupported provenance. */
  kind: 'verified-target' | 'git-attributed' | 'deleted' | 'unknown';
};

/** @purpose One phase parsed by canonical ticket helpers, before relation classification. */
export type FileRelationPhaseInput = {
  /** @purpose Canonical phase identifier inside the ticket. */
  id: string;
  /** @purpose Mechanically parsed phase lifecycle state. */
  state: FileRelationPhaseState;
  /** @purpose Exact declared Target Files paths. */
  targetFiles: readonly string[];
  /** @purpose Exact declared Deleted Files paths. */
  deletedFiles: readonly string[];
  /** @purpose Canonical spec IDs resolved from the phase or ticket references. */
  specIds: readonly string[];
  /** @purpose Receipt/Git evidence already validated by caller-owned adapters. */
  evidence?: readonly FileRelationEvidenceInput[];
};

/** @purpose One structured ticket consumed by the resolver core. */
export type FileRelationTicketInput = {
  /** @purpose Repo-relative source ticket path. */
  file: string;
  /** @purpose Canonical Task-ID. */
  taskId: string;
  /** @purpose Explicit Task-ID dependencies used to prove writer serialization. */
  dependencies: readonly string[];
  /** @purpose Detected flow contract of this ticket. */
  flow: FlowVersion;
  /** @purpose Mechanically parsed ticket lifecycle state. */
  status: FileRelationTicketStatus;
  /** @purpose Whether canonical execution-log parsing found an active blocker. */
  blockerActive: boolean;
  /** @purpose Canonically parsed phases of this ticket. */
  phases: readonly FileRelationPhaseInput[];
};

/** @purpose One task relation emitted for an exact target claim. */
export type FileTaskRelation = {
  /** @purpose Mechanical relation class. */
  kind: 'planned' | 'active' | 'blocked' | 'history';
  /** @purpose Task-ID responsible for the relation. */
  taskId: string;
  /** @purpose Repo-relative ticket source. */
  ticketFile: string;
  /** @purpose Phase that made the exact file claim. */
  phaseId: string;
  /** @purpose Normalized exact repo-relative target. */
  target: string;
  /** @purpose Whether the phase declares a write or deletion. */
  targetKind: 'target' | 'deleted';
  /** @purpose Exactly one strongest causal evidence class. */
  evidence: FileRelationEvidence;
};

/** @purpose One stable FO-1 finding emitted by the pure resolver. */
export type FileRelationFinding = {
  /** @purpose Stable code from the FO-1 closed registry. */
  code: FileRelationFindingCode;
  /** @purpose Whether the finding must stop the future consumer. */
  blocking: boolean;
  /** @purpose Related Task-ID when the finding is ticket-local. */
  taskId?: string;
  /** @purpose Related phase ID when the finding is phase-local. */
  phaseId?: string;
  /** @purpose Exact or rejected path involved in the finding. */
  path?: string;
  /** @purpose Russian operator-facing diagnostic. */
  message: string;
};

/** @purpose Complete structured input; callers own scans, spec registry, receipt and Git adapters. */
export type FileRelationsInput = {
  /** @purpose Absolute repository root for canonical path policy. */
  repoRoot: string;
  /** @purpose Queried repo-relative file path. */
  file: string;
  /** @purpose Flow contract of the queried file scope. */
  flow: FlowVersion;
  /** @purpose Canonical owner resolution supplied by the future registry adapter. */
  spec: FileSpecResolution;
  /** @purpose Whether the queried V2 header still contains forbidden legacy @tasks. */
  hasLegacyTasks: boolean;
  /** @purpose Structured corpus tickets supplied without resolver-side I/O. */
  tickets: readonly FileRelationTicketInput[];
};

/** @purpose Deterministic typed result shared by future orient/check/workflow consumers. */
export type FileRelationsResult = {
  /** @purpose Normalized queried file path. */
  file: string;
  /** @purpose Flow contract used for strictness. */
  flow: FlowVersion;
  /** @purpose Canonical semantic-owner relation. */
  semanticOwner: {
    /** @purpose Stable relation discriminator. */
    kind: 'semantic-owner';
    /** @purpose Caller-resolved canonical spec identity. */
    spec: FileSpecResolution;
    /** @purpose Whether the canonical owner is known. */
    evidence: 'declared' | 'unknown';
  };
  /** @purpose Deterministically sorted planned relations. */
  planned: FileTaskRelation[];
  /** @purpose Deterministically sorted active relations. */
  active: FileTaskRelation[];
  /** @purpose Deterministically sorted blocked relations. */
  blocked: FileTaskRelation[];
  /** @purpose Deterministically sorted historical relations. */
  history: FileTaskRelation[];
  /** @purpose Deterministically sorted FO-1 findings. */
  findings: FileRelationFinding[];
};

/** @purpose Input to the no-I/O canonical ticket adapter. */
export type FileRelationTicketContentInput = {
  /** @purpose Repo-relative ticket source path. */
  file: string;
  /** @purpose Detected flow contract of the ticket. */
  flow: FlowVersion;
  /** @purpose In-memory ticket bytes parsed without resolver-side reads. */
  content: string;
  /**
   * @purpose Caller-owned canonical spec-reference resolver.
   * @param reference Parsed spec reference name or anchor.
   * @param ticketFile Repo-relative ticket path that owns the reference.
   * @returns Canonical spec ID, or null when the caller cannot resolve it.
   */
  resolveSpecReference: (reference: string, ticketFile: string) => string | null;
  /** @purpose Caller-validated evidence grouped by phase. */
  evidence?: Readonly<Record<string, readonly FileRelationEvidenceInput[]>>;
};

/** @purpose Fail-closed result of adapting canonical parsed ticket sections. */
export type FileRelationTicketParseResult =
  | { ok: true; ticket: FileRelationTicketInput }
  | {
      ok: false;
      reason: 'meta-missing' | 'overview-missing' | 'identity-missing' | 'phase-missing';
      phaseId?: string;
    };
