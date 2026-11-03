// @file: Request and resolved context shared by verify planning and reporting.
// @consumers: verify planner, rules resolver, verify report
// @spec: CLI-VERIFY

import type { PluginId } from './plugin-id.type.ts';

/** @purpose Identify the files and derivation mode covered by a verify request. */
export type VerifyScope = {
  /** @purpose How the file set was selected. */
  readonly mode: 'files' | 'changed' | 'all';
  /** @purpose Repository-relative files in the resolved scope. */
  readonly files: readonly string[];
  /** @purpose Exact non-empty VCS base identity required when mode is changed. */
  readonly changedFrom?: string;
};

/** @purpose Capture one explainable rule choice without coupling the model to a resolver. */
export type VerifyRuleSelection = {
  /** @purpose Stable rule identifier. */
  readonly id: string;
  /** @purpose Why this rule was selected or skipped for the request. */
  readonly reason: string;
  /** @purpose Registry or project source that supplied the rule. */
  readonly provenance: string;
};

/** @purpose Preserve the immutable rule selection shared by plan, run, and optional receipt sink. */
export type VerifyRuleSnapshot = {
  /** @purpose Deterministic digest of normalized resolver inputs and selections. */
  readonly digest: string;
  /** @purpose Mechanically required rules. */
  readonly required: readonly VerifyRuleSelection[];
  /** @purpose Explained semantic candidates accepted for the run. */
  readonly suggested: readonly VerifyRuleSelection[];
  /** @purpose Available rules excluded from the snapshot with their reason. */
  readonly skipped: readonly VerifyRuleSelection[];
};

/** @purpose Describe operator and workflow inputs to one verify run. */
export type VerifyRequest = {
  /** @purpose Absolute repository root. */
  readonly root: string;
  /** @purpose Named phase whose preset slice is requested. */
  readonly phase: string;
  /** @purpose Requested or VCS-derived file scope. */
  readonly scope: VerifyScope;
  /** @purpose SDD ticket path when verify runs in task context. */
  readonly task?: string;
  /** @purpose SDD phase id when verify runs in task context. */
  readonly sddPhase?: string;
  /** @purpose Exact SDD tombstones whose continued absence belongs to this report identity. */
  readonly deletedFiles?: readonly string[];
};

/** @purpose Carry immutable facts resolved before readiness and execution. */
export type VerificationContext = {
  /** @purpose Original verify request. */
  readonly request: VerifyRequest;
  /** @purpose Detected plugins participating in the selected scope. */
  readonly plugins: readonly PluginId[];
  /** @purpose Detected framework identifiers used by rule selection. */
  readonly frameworks: readonly string[];
  /** @purpose Exact local commit identity observed for this run. */
  readonly headSha: string;
  /** @purpose Rule selection shared verbatim with plan, report, and receipt consumers. */
  readonly rules: VerifyRuleSnapshot;
};
