// @file: Entry point for the gennady verify command — read-only plan printer, never runs a gate.
// @consumers: gennady.ts
// @tasks: N/A

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
// Mirrors sdd-verify's own entry gate (V-07): a broken `stack:` section refuses BOTH commands
// alike, even though the `full` profile does not read the parsed value today (30-…md §3.0).
const stackConfigLoad = loadStackConfig(projectRoot, BUILTIN_GATE_IDS);
if (stackConfigLoad.errors.length > 0) {
  const outcome = stackConfigError(stackConfigLoad.errors);
  console.error(outcome.message);
  process.exit(outcome.exitCode);
}

console.log(JSON.stringify(resolveVerifyPlan(projectRoot), null, 2));
process.exit(0);
