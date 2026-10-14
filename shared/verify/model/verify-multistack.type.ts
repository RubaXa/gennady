// @file: Scope-aware multistack planning projection shared with later executors/reporters.
// @consumers: multistack planner, verify reporters
// @spec: CLI-VERIFY

import type { ComposedVerifyPresets } from '../config/verify-config.type.ts';
import type { StackDetection } from '../verify.types.ts';
import type { PluginId } from './plugin-id.type.ts';
import type { VerifyScope } from './verify-context.type.ts';
import type { CapabilityMatrix } from './verify-readiness.type.ts';
import type { VerifyPlan } from './verify-report.type.ts';

/** @purpose Explain why one detected plugin does or does not participate in the selected plan. */
export type VerifyStackParticipation = {
  /** @purpose Detected plugin identity in configured/default detection order. */
  readonly plugin: PluginId;
  /** @purpose Scope seed, explicit dependency closure, or a detected but omitted plugin. */
  readonly participation: 'affected' | 'dependency' | 'unaffected';
  /** @purpose Whether this plugin's failures contribute to the terminal verdict. */
  readonly blocking: boolean;
  /** @purpose Mandatory explanation for an explicit non-blocking policy. */
  readonly policyReason?: string;
  /** @purpose Winning config or builtin source of the blocking policy. */
  readonly policySource: string;
  /** @purpose Winning source of an explicit non-blocking reason. */
  readonly policyReasonSource?: string;
};

/** @purpose Return the complete read-only product of one scope-aware multistack planning pass. */
export type MultistackVerifyPlan = {
  /** @purpose Normalized conservative scope used for affected-stack selection. */
  readonly scope: VerifyScope;
  /** @purpose Actual plugin detections in stack.use/default order. */
  readonly detections: readonly StackDetection[];
  /** @purpose Visible affected/dependency/unaffected and blocking policy projection. */
  readonly stacks: readonly VerifyStackParticipation[];
  /** @purpose One composition of every selected detected preset and its provenance. */
  readonly composed: ComposedVerifyPresets;
  /** @purpose One dependency-closed phase slice seeded only by affected plugins. */
  readonly plan: VerifyPlan;
  /** @purpose Policy-aware readiness across every participating plugin. */
  readonly readiness: CapabilityMatrix;
};
