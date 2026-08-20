// @file: Registry of built-in stack plugins and stack detection across the registry.
// @consumers: verify.cmd
// @tasks: TSK-95

import type { StackConfig, StackDetection, StackId, StackPlugin } from './stack.types.ts';
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
export const BUILTIN_GATE_IDS = Object.fromEntries(
  BUILTIN_STACK_PLUGINS.map((plugin) => [plugin.id, plugin.gateIds])
) as Readonly<Record<StackId, readonly string[]>>;

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
 * @invariant `use` restricts the candidate set; detection still decides (spec §3). Opt-in
 *   plugins are candidates only when `use` names them.
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
  // An opt-in plugin matches anything, so auto-detection must never consider it: a repository
  // belonging to no stack has to keep failing loudly instead of silently matching a placeholder.
  const candidates = Array.isArray(use)
    ? plugins.filter((plugin) => use.includes(plugin.id))
    : plugins.filter((plugin) => plugin.optIn !== true);

  const active: ActiveStack[] = [];
  for (const plugin of candidates) {
    const detection = plugin.detect(root);
    if (detection !== null) {
      active.push({ plugin, detection });
    }
  }

  return active;
}
