// @file: StackPlugin for repositories with no stack plugin — every gate comes from config.
// @consumers: plugins/index.ts
// @tasks: TSK-96

import type { ScopeRequest, StackDetection, StackPlugin, StackScope } from 'gennady/stack';

/** No built-in gates: the whole gate list is authored as `extraGates` (spec §2). */
export const ANYSTACK_GATE_IDS: readonly string[] = [];

/**
 * @purpose Placeholder plugin: recognizes any repository once selected, and contributes no gates
 *   of its own so an exotic stack can be verified entirely through `extraGates`.
 * @implements {StackPlugin} in plugins/anystack/specs/anystack.spec.md
 * @invariant `optIn` keeps it out of auto-detection: a repository belonging to no stack must
 *   still exit 5, not silently match this plugin.
 * @consumer stack-registry
 */
export const anystackPlugin: StackPlugin = {
  id: 'anystack',
  marker: 'any repository',
  description: 'no stack detection; every gate comes from stack.anystack.extraGates',
  gateIds: ANYSTACK_GATE_IDS,
  optIn: true,

  detect(root: string): StackDetection | null {
    return {
      stack: 'anystack',
      root,
      summary: [
        'stack:     none — selected explicitly via stack.use',
        'gates:     from gennady.yaml (stack.anystack.extraGates)',
      ],
      diagnostics: [],
      details: null,
    };
  },

  verify: {
    resolveScope(_detection: StackDetection, request: ScopeRequest): StackScope {
      // Scope is recorded for the report but narrows nothing: an extra gate is a fixed argv,
      // so only its own command decides what it reads.
      return {
        mode: request.mode,
        note: 'config-authored gates — scope flags do not narrow them',
        details: null,
      };
    },

    planGates(): [] {
      // Every gate arrives from config; applyStackConfig appends them (stack.spec §4.5).
      return [];
    },
  },
};
