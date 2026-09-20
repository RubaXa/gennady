// @file: Registry of built-in stack plugins and stack detection across the registry.
// @consumers: verify.cmd
// @tasks: TSK-95

import type { StackConfig, StackDetection, StackId, StackPlugin } from './verify.types.ts';
import { BUILTIN_PLUGINS } from '../../plugins/index.ts';

/**
 * Built-in stack plugins, ordered by id so reports and plans never depend on the order
 * a directory happened to be read in (plugins.spec §5). External plugins: D-STACK-001.
 */
export const BUILTIN_STACK_PLUGINS: readonly StackPlugin[] = [...BUILTIN_PLUGINS].sort((a, b) =>
  a.id.localeCompare(b.id)
);

/**
 * Built-in gate ids per plugin — the vocabulary strict config validation checks against.
 * Derived from the plugins themselves: the registry must not reach into plugin internals.
 */
const PLUGIN_GATE_IDS = Object.fromEntries(
  BUILTIN_STACK_PLUGINS.map((plugin) => [plugin.id, plugin.gateIds])
) as Partial<Record<StackId, readonly string[]>>;

/**
 * Closed config vocabulary also includes the RC-native node preset. Plugin gate vocabularies are
 * derived from their literal implementations, including Swift (V-11).
 */
export const BUILTIN_GATE_IDS: Readonly<Record<StackId, readonly string[]>> = {
  swift: PLUGIN_GATE_IDS.swift ?? [],
  golang: PLUGIN_GATE_IDS.golang ?? [],
  // Node's RC-native preset is not a StackPlugin: `use` may name it, while plugin-style
  // override/skip of its blocking ladder stays outside D-64/Variant-C convergence.
  node: [],
  anystack: PLUGIN_GATE_IDS.anystack ?? [],
};

/**
 * @purpose One active plugin paired with its detection.
 * @consumer verify.cmd
 */
export type ActiveStack = {
  /** @purpose The plugin that recognized the repository. */
  readonly plugin: StackPlugin;
  /** @purpose Its detection payload. */
  readonly detection: StackDetection;
};

/**
 * @purpose Detect which stacks a repository belongs to, honouring the config's `use` restriction.
 * @invariant `use` restricts the candidate set; detection still decides (spec §3). Unknown ids
 *   in `use` are rejected earlier by strict config validation.
 * @param root Absolute repository root.
 * @param config Merged stack config, or null for pure auto-detection.
 * @param [registry] Registry to detect against; defaults to the built-ins.
 * @returns Active plugin+detection pairs in registry order.
 */
export function detectStacks(
  root: string,
  config: StackConfig | null,
  registry?: readonly StackPlugin[]
): ActiveStack[] {
  const plugins = registry ?? BUILTIN_STACK_PLUGINS;
  const use = config?.use;
  const candidates = Array.isArray(use)
    ? plugins.filter((plugin) => use.includes(plugin.id))
    : plugins;

  const active: ActiveStack[] = [];
  for (const plugin of candidates) {
    const detection = plugin.detect(root);
    if (detection !== null) {
      active.push({ plugin, detection });
    }
  }

  return active;
}
