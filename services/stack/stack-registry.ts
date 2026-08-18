// @file: Registry of built-in stack plugins and stack detection across the registry.
// @consumers: verify.cmd
// @tasks: TSK-95

import type { StackConfig, StackDetection, StackId, StackPlugin } from './stack.types.ts';
import { nodePlugin, NODE_GATE_IDS } from './plugins/node/node-plugin.ts';
import { golangPlugin } from './plugins/golang/golang-plugin.ts';
import { GO_GATE_ORDER } from './plugins/golang/golang-plan.logic.ts';

/** Built-in stack plugins in detection order. External plugins are deferred (spec D-STACK-001). */
export const BUILTIN_STACK_PLUGINS: readonly StackPlugin[] = [nodePlugin, golangPlugin];

/** Built-in gate ids per plugin — the vocabulary strict config validation checks against. */
export const BUILTIN_GATE_IDS: Readonly<Record<StackId, readonly string[]>> = {
  node: NODE_GATE_IDS,
  golang: GO_GATE_ORDER,
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
