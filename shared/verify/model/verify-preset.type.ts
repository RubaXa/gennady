// @file: Plugin-owned verify DAG and phase-selection contract.
// @consumers: stack plugins, verify planner, config overlay
// @spec: CLI-VERIFY

import type { PluginId } from './plugin-id.type.ts';
import type { Requirement, VerifyStep, WriteBoundary } from './verify-step.type.ts';

/** @purpose Select an explainable slice of a preset DAG by step tags. */
export type PhaseSelector = {
  /** @purpose Tags that make a step eligible for the phase. */
  readonly include: readonly string[];
  /** @purpose Tags removed from the eligible set after inclusion. */
  readonly exclude?: readonly string[];
};

/** @purpose Describe the fields project config may override on a built-in step. */
export type VerifyStepOverride = {
  /** @purpose Explicitly include or waive the step. */
  readonly enabled?: boolean;
  /** @purpose Required explanation when a step is explicitly disabled. */
  readonly reason?: string;
  /** @purpose Replacement phase-selection tags. */
  readonly tags?: readonly string[];
  /** @purpose Replacement dependency ids. */
  readonly needs?: readonly string[];
  /** @purpose Replacement local command. */
  readonly command?: VerifyStep['command'];
  /** @purpose Replacement readiness requirements. */
  readonly requires?: readonly Requirement[];
  /** @purpose Replacement mutation boundary. */
  readonly writes?: WriteBoundary;
  /** @purpose Replacement invalidation set. */
  readonly invalidates?: readonly string[];
  /** @purpose Replacement end-to-end timeout. */
  readonly timeoutMs?: number;
  /** @purpose Replacement failure policy. */
  readonly onFailure?: VerifyStep['onFailure'];
};

/** @purpose Supply one plugin's complete verify DAG and its phase/rule defaults. */
export type VerifyPreset = {
  /** @purpose Plugin that owns every unqualified step in this preset. */
  readonly plugin: PluginId;
  /** @purpose Complete immutable DAG before phase selection and config overlay. */
  readonly steps: readonly VerifyStep[];
  /** @purpose Named phase selectors over the common DAG. */
  readonly phases: Readonly<Record<string, PhaseSelector>>;
  /** @purpose Preset-level capabilities considered only when their slice is selected. */
  readonly requirements: readonly Requirement[];
  /** @purpose Rule ids contributed by the plugin to later rule resolution. */
  readonly rules: readonly string[];
};
