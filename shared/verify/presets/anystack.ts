// @file: anystack preset — the phase model's read-only, config-authored gate list (V-08). No
//   builtin gates: everything comes from `stack.anystack.extraGates` (gennady.yaml), in the exact
//   declaration order (fixed order, И-2 §3.0).
// @consumers: presets/node.ts (resolvePreset dispatch)
// @tasks: V-08

import { ANYSTACK_GATE_IDS } from '../../../plugins/anystack/anystack-plugin.ts';
import { pluginConfigOf } from '../stack-config.ts';
import type { StackConfig, GateSpec } from '../verify.types.ts';
import type { StackPreset } from './node.ts';

/**
 * @purpose Quote one argv token for a shell command string, only when it needs it.
 * @param token Raw argv token.
 * @returns The token verbatim, or single-quoted (embedded `'` escaped) when it holds whitespace
 *   or shell-meaningful characters.
 */
function quoteToken(token: string): string {
  if (/^[A-Za-z0-9_.\-/:=]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/**
 * @purpose Resolve the anystack preset for one repository — read-only gates from config only.
 * @invariant Gate names are `BUILTIN_GATE_IDS.anystack` (empty today) followed by `extraGates` in
 *   declaration order; nothing is ever required — a repo verified only through anystack is never
 *   made not-ready by an unconfigured or absent extraGate (V-08 acceptance).
 * @param _root Absolute repository root; reserved — anystack gates take no project-relative input yet.
 * @param config Merged `stack:` config section, or null/undefined when none exists.
 * @returns The anystack preset — same `StackPreset` shape node/golang return.
 */
export function resolveAnystackPreset(
  _root: string,
  config: StackConfig | null | undefined
): StackPreset {
  const pluginConfig = pluginConfigOf(config ?? null, 'anystack');
  const extraGates: readonly GateSpec[] = pluginConfig?.extraGates ?? [];
  const names: readonly string[] = [...ANYSTACK_GATE_IDS, ...extraGates.map((spec) => spec.id!)];

  return {
    stack: 'anystack',
    gateNames: () => names,
    // Read-only, config-authored gates never make the ladder fail-closed on absence — there is no
    // "infrastructure not ready" concept for a stack whose entire gate list is optional by design.
    requiredGateNames: () => [],
    commandForGate: (name) => {
      const spec = extraGates.find((entry) => entry.id === name);
      return spec ? spec.argv!.map(quoteToken).join(' ') : null;
    },
    environmentStateSource:
      'shared/verify/presets/anystack.ts#config-extraGates (no fingerprint — read-only)',
  };
}
