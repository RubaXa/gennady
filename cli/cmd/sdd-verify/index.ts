// @file: Entry point for the gennady sdd-verify command — runs the gates and exits (kept out of cmd.ts so importing run() never executes gates).
// @consumers: gennady.ts
// @tasks: N/A

import { run, defaultRunner } from './sdd-verify.cmd.ts';
import { parseInvocation } from './sdd-verify.types.ts';

const invocation = parseInvocation(process.argv);
if (!invocation.ok) {
  console.error(invocation.message);
  process.exit(4);
}

const outcome = await run(defaultRunner, invocation.profile);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
