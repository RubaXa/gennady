// @file: Node stack preset — canonical npm-script gate names/commands, moved verbatim from
//   shared/sdd/phase-verification-plan.ts (V-04) so `resolvePreset('node', ...)` is the one source
//   of truth; behavior is byte-identical to the pre-V-04 hardcoded lists (V-01 golden).
// @consumers: phase-verification-plan.ts
// @tasks: N/A

import {
  isDeclaredArgumentForwardingRepairBrick,
  isVacuousScript,
  resolveProjectScriptName,
} from '../../sdd/readiness.ts';
import type { VerificationProfile } from '../../sdd/phase-verification-plan.ts';
import type { StackConfig, StackId } from '../verify.types.ts';
import { resolveAnystackPreset } from './anystack.ts';

/**
 * @purpose Node preset's canonical gate names for a profile and coverage-owner state.
 * @param profile Structurally derived phase profile, or explicit project-level `full`.
 * @param producesCoverage Whether this test phase owns the coverage producer.
 * @returns Gate names in execution order.
 */
export function nodeGateNames(
  profile: VerificationProfile,
  producesCoverage: boolean
): readonly string[] {
  if (profile === 'full') return ['type-check', 'test:coverage', 'lint', 'format', 'yagni'];
  if (profile === 'test' && producesCoverage) return ['fix', 'type-check', 'test:coverage'];
  return ['fix', 'type-check', 'test'];
}

/**
 * @purpose One stack's gate-name/command policy — the shape `resolvePreset` returns.
 * @invariant `environmentStateSource` is REQUIRED, never optional: a preset lacking one is refused
 *   fail-closed by the environmentState engine (V-04a splits `phase-receipt.ts` into engine + this).
 */
export type StackPreset = {
  /** @purpose Which built-in stack this preset governs. */
  readonly stack: StackId;
  /**
   * @purpose Canonical gate names for a profile and coverage-owner state.
   * @param profile Structurally derived phase profile, or explicit full profile.
   * @param producesCoverage Whether this test phase owns the coverage producer.
   * @returns Gate names in execution order.
   */
  gateNames(profile: VerificationProfile, producesCoverage: boolean): readonly string[];
  /**
   * @purpose Required gate names for a profile and coverage-owner state.
   * @param profile Structurally derived phase profile, or explicit full profile.
   * @param producesCoverage Whether this test phase owns the coverage producer.
   * @returns Required gate names in canonical order.
   */
  requiredGateNames(profile: VerificationProfile, producesCoverage: boolean): readonly string[];
  /**
   * @purpose Runnable command for one gate, or null until one exists.
   * @param name Canonical gate/script name.
   * @param scripts Project `package.json` scripts map.
   * @param targets Exact phase Target Files.
   * @returns Runnable command string, or null.
   */
  commandForGate(
    name: string,
    scripts: Readonly<Record<string, string>>,
    targets: readonly string[]
  ): string | null;
  /**
   * @purpose Declarative label of this preset's environmentState source. Not read yet: V-04a
   *   fails closed via `resolvePreset(...) !== null`; a consumer arrives with non-node presets.
   */
  readonly environmentStateSource: string;
};

/**
 * @purpose Resolve the stack preset governing gate names/commands for one repository.
 * @invariant `profile` is accepted (V-04's declared shape) but unused by node/anystack — a
 *   profile-shaped preset (V-09+) uses it for real. `root`/`config` are used by anystack (V-08);
 *   golang still resolves to null (arrives in V-09).
 * @param stack Which built-in stack to resolve.
 * @param _profile Selected verification profile; reserved for a future profile-shaped preset.
 * @param root Absolute repository root; passed through to config-aware presets (anystack, V-08).
 * @param [config] Merged `gennady.yaml` `stack:` section, when one exists (V-07's loader; anystack
 *   reads its own slice via `pluginConfigOf`).
 * @returns The stack's preset, or null when no preset is implemented for that stack yet.
 */
export function resolvePreset(
  stack: StackId,
  _profile: VerificationProfile,
  root: string,
  config?: StackConfig | null
): StackPreset | null {
  if (stack === 'anystack') return resolveAnystackPreset(root, config);
  if (stack !== 'node') return null;
  return {
    stack: 'node',
    gateNames: nodeGateNames,
    requiredGateNames: (profile, producesCoverage) =>
      profile === 'setup' ? [] : nodeGateNames(profile, producesCoverage),
    commandForGate: (name, scripts, targets) => {
      if (name === 'fix') {
        if (targets.length === 0) return null;
        const leaves = ['format:fix', 'lint:fix'];
        return leaves.every(
          (leaf) =>
            scripts[leaf] !== undefined &&
            !isVacuousScript(scripts, leaf) &&
            isDeclaredArgumentForwardingRepairBrick(scripts, leaf)
        )
          ? 'target-repair'
          : null;
      }
      const script = resolveProjectScriptName(scripts as Record<string, string>, name);
      return script ? `npm run ${script}` : null;
    },
    environmentStateSource: 'shared/sdd/phase-receipt.ts#phaseVerificationEnvironmentFromScripts',
  };
}
