// @file: Target verify config overlay, provenance and migration data contracts.
// @consumers: verify config loader, preset composer, stack migration adapter
// @spec: CLI-VERIFY

import type { PluginId } from '../model/plugin-id.type.ts';
import type { PhaseSelector, VerifyPreset } from '../model/verify-preset.type.ts';
import type {
  Requirement,
  VerifyEnvironmentFailureRule,
  VerifyStep,
  WriteBoundary,
} from '../model/verify-step.type.ts';
import type { VerifyConfigError } from './verify-config.error.ts';

/** @purpose Describe the command fields a config layer may replace on an existing step. */
export type VerifyCommandConfig = {
  /** @purpose Node-owned script shorthand resolved with package-manager facts in UV-04. */
  readonly npmScript?: string;
  /** @purpose Replacement argv; an omitted value inherits the lower layer. */
  readonly argv?: readonly string[];
  /** @purpose Absolute cwd resolved from a repo-relative authored value. */
  readonly cwd?: string;
  /** @purpose Replacement environment map; object keys deep-merge between file layers. */
  readonly env?: Readonly<Record<string, string>>;
};

/** @purpose Normalize authored step config before applying it to a concrete preset. */
export type VerifyStepConfig = {
  /** @purpose Explicitly waive or restore the step. */
  readonly enabled?: boolean;
  /** @purpose Required non-empty explanation when enabled is false. */
  readonly reason?: string;
  /** @purpose Replacement selection tags. */
  readonly tags?: readonly string[];
  /** @purpose Replacement dependency references. */
  readonly needs?: readonly string[];
  /** @purpose Partial command override merged over the concrete preset command. */
  readonly command?: VerifyCommandConfig;
  /** @purpose Replacement readiness requirements. */
  readonly requires?: readonly Requirement[];
  /** @purpose Replacement write boundary. */
  readonly writes?: WriteBoundary;
  /** @purpose Replacement invalidation references. */
  readonly invalidates?: readonly string[];
  /** @purpose Parsed replacement end-to-end timeout. */
  readonly timeoutMs?: number;
  /** @purpose Replacement failure policy. */
  readonly onFailure?: VerifyStep['onFailure'];
  /** @purpose Executor declaration required when this config adds a new step. */
  readonly executor?: VerifyStep['executor'];
  /** @purpose Effect declaration required when this config adds a new step. */
  readonly effect?: VerifyStep['effect'];
  /** @purpose Streaming exit-zero failure policy for a project-owned step. */
  readonly outputMeansFailure?: boolean;
  /** @purpose Serializable environmental failure rules for a project-owned step. */
  readonly envFail?: readonly VerifyEnvironmentFailureRule[];
};

/** @purpose Group target overrides for one known plugin preset. */
export type VerifyPluginConfig = {
  /** @purpose Overrides or complete declarative additions keyed by local step id. */
  readonly steps: Readonly<Record<string, VerifyStepConfig>>;
  /** @purpose Project-owned selectors over this preset's one shared DAG. */
  readonly phases?: Readonly<Record<string, PhaseSelector>>;
  /** @purpose Whether failures from this plugin contribute to the terminal blocking verdict. */
  readonly blocking?: boolean;
  /** @purpose Mandatory project explanation when blocking is explicitly disabled. */
  readonly reason?: string;
};

/** @purpose Preserve one plugin's effective blocking policy with exact file provenance. */
export type VerifyPluginPolicy = {
  /** @purpose Plugin governed by this policy. */
  readonly plugin: PluginId;
  /** @purpose True unless project configuration explicitly opts out with a reason. */
  readonly blocking: boolean;
  /** @purpose Project-authored explanation for an explicit non-blocking exception. */
  readonly reason?: string;
  /** @purpose Winning source of the blocking value. */
  readonly source: string;
  /** @purpose Winning source of the reason when it differs from the blocking source. */
  readonly reasonSource?: string;
};

/** @purpose Represent the normalized top-level `verify:` section. */
export type VerifyConfig = {
  /** @purpose Plugin-specific overrides over built-in presets. */
  readonly presets: Readonly<Record<PluginId, VerifyPluginConfig>>;
  /** @purpose Project overrides for the composed SDD-kind to Verify-selector mapping. */
  readonly sdd?: {
    readonly mapping: Readonly<Record<string, string>>;
  };
};

/** @purpose Return an all-or-nothing target verify config load. */
export type VerifyConfigLoad = {
  /** @purpose Normalized config, null when absent or any fatal error exists. */
  readonly config: VerifyConfig | null;
  /** @purpose Fatal typed errors; non-empty forbids composition. */
  readonly errors: readonly VerifyConfigError[];
  /** @purpose Contributing files in highest-priority-first order. */
  readonly sources: readonly string[];
  /** @purpose Winning file per authored section-relative key. */
  readonly provenance: ReadonlyMap<string, string>;
};

/** @purpose Supply detected facts as the only pre-file overlay layer. */
export type DetectedVerifyConfigLayer = {
  /** @purpose Stable detector/fact source label. */
  readonly source: string;
  /** @purpose Normalized overrides derived from project facts. */
  readonly config: VerifyConfig;
  /** @purpose Optional per-key source refinement within the detected layer. */
  readonly provenance?: ReadonlyMap<string, string>;
};

/** @purpose Explain one explicit disable without deleting its DAG node. */
export type VerifyStepWaiver = {
  /** @purpose Qualified identity of the waived step. */
  readonly stepId: `${string}:${string}`;
  /** @purpose Required authored or migration explanation. */
  readonly reason: string;
  /** @purpose Winning source that disabled the step. */
  readonly source: string;
};

/** @purpose Preserve target path and source for one lossless legacy translation. */
export type VerifyMigrationDiagnostic = {
  /** @purpose Exact legacy input path. */
  readonly path: string;
  /** @purpose Winning legacy source. */
  readonly source: string;
  /** @purpose Equivalent target `verify:` path. */
  readonly targetPath: string;
  /** @purpose Actionable replacement instruction. */
  readonly message: string;
};

/** @purpose Carry an all-or-nothing temporary legacy overlay. */
export type LegacyVerifyConfigAdapter = {
  /** @purpose Translated target config, null when any migration error exists. */
  readonly config: VerifyConfig | null;
  /** @purpose Target-key provenance attributed to legacy sources. */
  readonly provenance: ReadonlyMap<string, string>;
  /** @purpose Successful lossless translations and their replacement paths. */
  readonly diagnostics: readonly VerifyMigrationDiagnostic[];
  /** @purpose Fatal non-lossless migration errors. */
  readonly errors: readonly VerifyConfigError[];
};

/** @purpose Define explicit composition inputs without exposing arbitrary layer order. */
export type ComposeVerifyPresetsInput = {
  /** @purpose Built-in preset DAGs; their fields own the lowest provenance layer. */
  readonly presets: readonly VerifyPreset[];
  /** @purpose Detected project facts applied in stable source order before file config. */
  readonly detected?: readonly DetectedVerifyConfigLayer[];
  /** @purpose Temporary lossless stack-config translation, applied before target verify files. */
  readonly legacy?: LegacyVerifyConfigAdapter;
  /** @purpose Target file overlay already merged using personal-highest policy. */
  readonly files?: VerifyConfigLoad;
};

/** @purpose Return composed preset data plus every non-preset fact needed by later reporting. */
export type ComposedVerifyPresets = {
  /** @purpose Concrete immutable preset DAGs ready for planner validation and slicing. */
  readonly presets: readonly VerifyPreset[];
  /** @purpose Winning source per target model key. */
  readonly provenance: ReadonlyMap<string, string>;
  /** @purpose Explicit disabled-step facts retained outside the executable DAG. */
  readonly waivers: readonly VerifyStepWaiver[];
  /** @purpose Lossless legacy translations that still need operator migration. */
  readonly migrationDiagnostics: readonly VerifyMigrationDiagnostic[];
  /** @purpose Effective per-plugin blocking policy, including explicit reason/provenance. */
  readonly policies: readonly VerifyPluginPolicy[];
  /** @purpose Composed zero-YAML defaults plus project overrides, keyed by open SDD kind. */
  readonly sddMapping: Readonly<Record<string, string>>;
  /** @purpose Exact winning source for every composed SDD-kind mapping. */
  readonly sddMappingProvenance: ReadonlyMap<string, string>;
};
