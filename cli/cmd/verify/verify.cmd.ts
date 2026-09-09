// @file: VerifyCommand — the read-only `gennady verify` planner/CI-reporter (V-16a, D-13). Never
//   runs a gate; reports the exact same dispatch `sdd-verify --profile full` would run today.
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveProjectScriptName } from '../../../shared/sdd/readiness.ts';
import { gatesFor, requiredGatesFor, type Gate } from '../sdd-verify/sdd-verify.types.ts';
import { gennadyGateCommand } from '../sdd-verify/sdd-verify.cmd.ts';
import type { VerifyPlanDocument, VerifyPlanGate } from './verify.types.ts';

/** @purpose Read the project's `package.json` `scripts` map — mirrors sdd-verify's own reader. */
function readProjectScripts(root: string): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * @purpose Exact dispatch command one full-profile gate would run, without running it.
 * @invariant Mirrors `sdd-verify.cmd.ts`'s own resolution: `via: 'gennady'` dispatches through
 *   `gennadyGateCommand` (self-hosting-aware) unconditionally; every other gate is an npm script,
 *   `npm run <resolved-name>` once one exists.
 * @param gate One `full`-profile gate.
 * @param scripts Project `package.json` scripts map.
 * @returns The would-run command line, or null until a real script exists (non-gennady gates).
 */
function planCommandForGate(gate: Gate, scripts: Readonly<Record<string, string>>): string | null {
  if (gate.via === 'gennady') {
    const { command, args } = gennadyGateCommand(gate.name);
    return `${command} ${args.join(' ')}`;
  }
  const script = resolveProjectScriptName(scripts, gate.name);
  return script ? `npm run ${script}` : null;
}

/**
 * @purpose Resolve the read-only `full` profile plan for one repository — no execution, no mutation.
 * @invariant The `full` profile is node-only today (`GATES`/`gatesFor`, unaffected by
 *   `stack:`/extraGates) — this facade reports exactly that, not an aspirational per-stack plan;
 *   see 30-TRACK-VERIFY.md §3.0 for why `stack.use` does not reach the full profile yet.
 * @param root Absolute repository root.
 * @returns The plan document, in canonical ladder order.
 */
export function resolveVerifyPlan(root: string): VerifyPlanDocument {
  const scripts = readProjectScripts(root);
  const required = new Set(requiredGatesFor('full', false));
  return {
    profile: 'full',
    stack: 'node',
    gates: gatesFor('full', false).map(
      (gate): VerifyPlanGate => ({
        name: gate.name,
        command: planCommandForGate(gate, scripts),
        required: required.has(gate.name),
      })
    ),
  };
}
