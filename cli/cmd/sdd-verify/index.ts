// @file: Entry point for the gennady sdd-verify command — runs the gates and exits (kept out of cmd.ts so importing run() never executes gates).
// @consumers: gennady.ts
// @tasks: N/A

import { run, defaultRunner } from './sdd-verify.cmd.ts';
import { isProfile } from './sdd-verify.types.ts';

const argv = process.argv.slice(2);
const flagIdx = argv.indexOf('--profile');
const rawProfile = flagIdx >= 0 ? argv[flagIdx + 1] : argv.find((a) => a.startsWith('--profile='))?.slice('--profile='.length);
const profile = rawProfile ?? 'full';
if (!isProfile(profile)) {
  console.error(`[verify] unknown --profile '${profile}' (expected: code | test | full)`);
  process.exit(4);
}

const outcome = await run(defaultRunner, profile);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
