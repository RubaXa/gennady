// @file: Entry point for the gennady sdd-verify command — runs the gates and exits (kept out of cmd.ts so importing run() never executes gates).
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { run, defaultRunner, type CoverageProbe } from './sdd-verify.cmd.ts';
import { parseInvocation } from './sdd-verify.types.ts';

const invocation = parseInvocation(process.argv);
if (!invocation.ok) {
  console.error(invocation.message);
  process.exit(4);
}

// Real single-producer freshness probe: clear the stale coverage report before test:coverage runs,
// confirm a fresh one appeared after — so a suite that exits 0 without writing coverage reds the gate.
const coverageFile = join(resolve('.'), 'coverage', 'coverage-final.json');
const coverageProbe: CoverageProbe = {
  clear: () => {
    try {
      rmSync(coverageFile, { force: true });
    } catch {
      /* nothing to clear */
    }
  },
  wroteFresh: () => existsSync(coverageFile),
};

const outcome = await run(defaultRunner, invocation.profile, coverageProbe);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
