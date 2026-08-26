// @file: Entry point for the gennady sdd-verify command — runs the gates and exits (kept out of cmd.ts so importing run() never executes gates).
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { run, defaultRunner, type CoverageProbe } from './sdd-verify.cmd.ts';
import { parseInvocation } from './sdd-verify.types.ts';

const invocation = parseInvocation(process.argv);
if (!invocation.ok) {
  console.error(invocation.message);
  process.exit(4);
}

// Real single-producer freshness probe, FAIL-CLOSED. `clear` removes the stale report before
// test:coverage; if removal fails (read-only dir, permissions) it remembers the survivor's mtime so
// `wroteFresh` demands a STRICTLY NEWER file — a producer that writes nothing leaves the old mtime and
// reds the gate. Only a genuinely fresh (removed-then-recreated, or newer) report passes.
const coverageFile = join(resolve('.'), 'coverage', 'coverage-final.json');
let staleMtimeMs: number | null = null;
const coverageProbe: CoverageProbe = {
  clear: () => {
    try {
      rmSync(coverageFile, { force: true });
    } catch {
      /* removal failed — handled below by remembering the survivor's mtime */
    }
    // If the report still exists (could not be removed), remember its mtime as the stale baseline.
    staleMtimeMs = existsSync(coverageFile) ? statSync(coverageFile).mtimeMs : null;
  },
  wroteFresh: () => {
    if (!existsSync(coverageFile)) return false;
    if (staleMtimeMs === null) return true; // was absent / successfully cleared → this file is fresh
    return statSync(coverageFile).mtimeMs > staleMtimeMs; // survived clear → must be newer to count
  },
};

const outcome = await run(defaultRunner, invocation.profile, coverageProbe);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
