// @file: Built-in provider-owned read-only CI observation step factory.
// @spec: CLI-VERIFY
// @consumers: Node, Go, Swift and anystack presets

import type { PluginId } from './plugin-id.type.ts';
import type { VerifyStep } from './verify-step.type.ts';

/**
 * @purpose Declare one repository pipeline observation node without provider mutation controls.
 * @param plugin Provider plugin that owns this qualified remote observation node.
 * @returns Immutable built-in step consumed by the common Verify planner and remote executor.
 */
export function createRemoteCiStep(plugin: PluginId): VerifyStep {
  return {
    id: 'remote-ci',
    plugin,
    tags: ['remote-ci'],
    needs: [],
    executor: 'vcs-pipeline',
    effect: 'remote-watch',
    requires: [],
    timeoutMs: 30 * 60_000,
    onFailure: 'stop-phase',
  };
}

/** @purpose Declare the shared exact-SHA trust selector used by every built-in provider preset. */
export const REMOTE_CI_SELECTOR = Object.freeze({
  include: ['remote-ci'] as readonly string[],
  trust: 'remote-provider' as const,
  trustSource: 'builtin:remote-ci',
});
