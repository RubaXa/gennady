// @file: VerifyCommand — the read-only `gennady verify` planner/CI-reporter (V-16a, D-13). Never
//   runs a gate; reports the exact same dispatch `sdd-verify --profile full` would run today.
// @spec: CLI-VERIFY
// @consumers: gennady.ts

import type { StackConfig } from '../../../shared/verify/verify.types.ts';
import { resolveAssembledFullProfile } from '../sdd-verify/full-profile-plan.ts';
import type { VerifyPlanDocument, VerifyPlanGate } from './verify.types.ts';

/**
 * @purpose Resolve the read-only `full` profile plan for one repository — no execution, no mutation.
 * @invariant Uses the exact D-64 assembled model that `sdd-verify --profile full` executes.
 * @param root Absolute repository root.
 * @param [config] Valid merged stack configuration, or null.
 * @returns The plan document, in canonical ladder order.
 */
export function resolveVerifyPlan(
  root: string,
  config: StackConfig | null = null
): VerifyPlanDocument {
  const full = resolveAssembledFullProfile(root, config);
  return {
    kind: 'plan',
    evidence: false,
    profile: 'full',
    stack: full.primary,
    stacks: full.detection.stacks,
    gates: full.gates.map(
      (gate): VerifyPlanGate => ({
        name: gate.name,
        stack: gate.stack,
        command: gate.command,
        required: gate.required,
        blocking: !gate.nonBlocking,
      })
    ),
  };
}
