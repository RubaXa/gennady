// @file: StackPlugin for repositories with no stack plugin — every gate comes from config.
// @spec: CLI-VERIFY
// @consumers: plugins/index.ts

import type {
  CapabilityMatrix,
  ScopeRequest,
  StackDetection,
  StackPlugin,
  StackScope,
  VerifyPreset,
} from 'gennady/stack';

/** No built-in gates: the whole gate list is authored as `extraGates` (spec §2). */
export const ANYSTACK_GATE_IDS: readonly string[] = [];

/**
 * @purpose Placeholder plugin: recognizes any repository once selected, and contributes no gates
 *   of its own so an exotic stack can be verified entirely through `extraGates`.
 * @implements {StackPlugin} in plugins/anystack/specs/anystack.spec.md
 * @invariant Matches every repository, so it coexists with a real stack rather than replacing
 *   it: `anystack` + `golang` is a normal multi-stack run (spec §3).
 * @consumer stack-registry
 */
export const anystackPlugin: StackPlugin = {
  id: 'anystack',
  marker: 'any repository',
  description: 'no stack detection; every gate comes from stack.anystack.extraGates',
  gateIds: ANYSTACK_GATE_IDS,

  detect(root: string): StackDetection | null {
    return {
      stack: 'anystack',
      root,
      // Active in every repository, so it must stay silent unless it has gates: a stack that
      // planned nothing is dropped from the report entirely (stack.spec §8).
      summary: ['gates:     from gennady.yaml (stack.anystack.extraGates)'],
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
        note: 'config-authored gates',
        details: null,
      };
    },

    planGates(): [] {
      // Every gate arrives from config; applyStackConfig appends them (stack.spec §4.6, FR-STACK-05).
      return [];
    },
  },
  target: {
    affectsScope() {
      return true;
    },
    createPreset(): VerifyPreset {
      return {
        plugin: 'anystack',
        steps: [],
        phases: Object.fromEntries(
          ['code', 'unit', 'integration', 'coverage', 'full'].map((phase) => [
            phase,
            { include: [] },
          ])
        ),
        requirements: [
          {
            id: 'anystack:declarative-steps',
            kind: 'config',
            description: 'anystack requires project-owned declarative target steps',
            required: true,
            fix: 'keep the legacy extraGates runner until custom target steps ship in UV-22',
          },
        ],
        rules: [],
      };
    },
    evaluateReadiness(_detection, preset, plan): CapabilityMatrix {
      const requirement = preset.requirements[0]!;
      return {
        status: 'BLOCKED',
        entries: [
          {
            plugin: 'anystack',
            phase: plan.phase,
            requirementId: requirement.id,
            status: 'BLOCKED',
            message: requirement.description,
            fix: requirement.fix,
          },
        ],
      };
    },
  },
};
