// @file: Per-phase capability readiness projected into verify reports.
// @consumers: verify presets, readiness resolver, reporters
// @spec: CLI-VERIFY

import type { PluginId } from './plugin-id.type.ts';
import type { QualifiedStepId } from './verify-step.type.ts';

/** @purpose Classify whether a selected phase may execute honestly. */
export type VerifyReadinessStatus = 'READY' | 'DEGRADED' | 'BLOCKED';

/** @purpose Explain one selected capability's readiness for one plugin and phase. */
export type VerifyReadiness = {
  /** @purpose Plugin whose selected slice requires the capability. */
  readonly plugin: PluginId;
  /** @purpose Selected phase. */
  readonly phase: string;
  /** @purpose Stable requirement identifier from the preset. */
  readonly requirementId: string;
  /** @purpose Exact selected step this fact governs; omitted only for plugin-wide capabilities. */
  readonly stepId?: QualifiedStepId;
  /** @purpose Explicit reason a selected node must not spawn despite non-blocking readiness. */
  readonly disposition?: 'waived' | 'not-applicable' | 'optional-unavailable';
  /** @purpose Capability outcome visible to planners and operators. */
  readonly status: VerifyReadinessStatus | 'WAIVED';
  /** @purpose Human-readable outcome explanation. */
  readonly message: string;
  /** @purpose Actionable installation or configuration instruction when not ready. */
  readonly fix?: string;
  /** @purpose Whether this entry contributes a blocking terminal readiness outcome. */
  readonly blocking?: boolean;
  /** @purpose Explicit project explanation when this plugin is informational. */
  readonly policyReason?: string;
  /** @purpose Config file that supplied the explicit blocking value. */
  readonly policySource?: string;
  /** @purpose Config file that supplied the explicit informational reason. */
  readonly policyReasonSource?: string;
};

/** @purpose Aggregate selected-slice readiness without probing unrelated phases. */
export type CapabilityMatrix = {
  /** @purpose Worst readiness state across selected non-waived entries. */
  readonly status: VerifyReadinessStatus;
  /** @purpose Per-plugin and per-phase capability outcomes. */
  readonly entries: readonly VerifyReadiness[];
};
