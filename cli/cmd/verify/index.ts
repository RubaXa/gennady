// @file: Entry point for the gennady verify command — read-only plan printer, never runs a gate.
// @spec: CLI-VERIFY
// @consumers: gennady.ts

import { resolve } from 'node:path';
import { loadStackConfig } from '../../../shared/verify/stack-config.ts';
import { BUILTIN_GATE_IDS } from '../../../shared/verify/stack-registry.ts';
import { stackConfigError } from '../sdd-verify/sdd-verify.types.ts';
import { parseVerifyInvocation } from './verify.types.ts';
import { resolveVerifyPlan } from './verify.cmd.ts';

const invocation = parseVerifyInvocation(process.argv);
if (!invocation.ok) {
  console.error(invocation.message);
  process.exit(4);
}

const projectRoot = resolve('.');
// Mirrors sdd-verify's own entry gate (V-07/D-64): a broken `stack:` section refuses BOTH commands
// alike; the validated value feeds their one shared assembled full-profile model.
const stackConfigLoad = loadStackConfig(projectRoot, BUILTIN_GATE_IDS);
if (stackConfigLoad.errors.length > 0) {
  const outcome = stackConfigError(stackConfigLoad.errors);
  console.error(outcome.message);
  process.exit(outcome.exitCode);
}

try {
  console.log(JSON.stringify(resolveVerifyPlan(projectRoot, stackConfigLoad.config), null, 2));
} catch (cause) {
  console.error(`[verify] ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
}
process.exit(0);
