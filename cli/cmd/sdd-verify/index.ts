// @file: Entry point for the gennady sdd-verify command — runs the gates and exits (kept out of cmd.ts so importing run() never executes gates).
// @consumers: gennady.ts
// @tasks: N/A

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  run,
  defaultAsyncRunner,
  GATE_MAX_BUFFER_BYTES,
  type CoverageProbe,
} from './sdd-verify.cmd.ts';
import { parseInvocation } from './sdd-verify.types.ts';
import { resolvePhaseContext } from './phase-context.ts';
import { runPhaseVerification } from './phase-run.ts';
import { createRepairMutationBoundary } from './workspace-mutation.ts';
import { selectCoverageAdapter } from '../testcov/coverage-adapter-registry.ts';
import { createCoverageArtifactBoundary } from '../testcov/coverage-artifact.ts';

const invocation = parseInvocation(process.argv);
if (!invocation.ok) {
  console.error(invocation.message);
  process.exit(4);
}

// The same registry entry drives testcov and sdd-verify. Unsupported/ambiguous platforms remain a
// dormant teaching failure until a test:coverage rung actually needs the probe; setup/code profiles
// do not acquire an irrelevant coverage dependency.
const projectRoot = resolve('.');
const coverageSelection = selectCoverageAdapter(projectRoot);
const coverageBoundaryResult =
  coverageSelection.kind === 'selected'
    ? createCoverageArtifactBoundary(projectRoot, coverageSelection.adapter)
    : null;
const coverageBoundary = coverageBoundaryResult?.ok ? coverageBoundaryResult.boundary : null;
const coverageIssue =
  coverageSelection.kind === 'unsupported'
    ? `no coverage adapter matches this project (available: ${coverageSelection.available.join(', ') || 'none'})`
    : coverageSelection.kind === 'ambiguous'
      ? `coverage adapter selection is ambiguous: ${coverageSelection.matches.map(({ id }) => id).join(', ')}`
      : coverageBoundaryResult && !coverageBoundaryResult.ok
        ? coverageBoundaryResult.detail
        : null;
const coverageProbe: CoverageProbe = {
  writableArtifactDirectories: coverageBoundary?.writableDirectories ?? [],
  clear: () =>
    coverageIssue
      ? { ok: false, detail: coverageIssue }
      : coverageBoundary!.clearProducerArtifacts(),
  wroteFresh: () => {
    if (coverageIssue) return { ok: false, detail: coverageIssue };
    const read = coverageBoundary!.readReport();
    return read.ok ? { ok: true } : read;
  },
};

let outcome;
if (invocation.mode === 'phase') {
  const context = resolvePhaseContext(invocation.task, invocation.phase);
  if (!context.ok) {
    console.error(context.message);
    process.exit(1);
  }
  outcome = await runPhaseVerification(
    resolve('.'),
    context.context,
    defaultAsyncRunner,
    (command) => {
      const result = spawnSync(command, {
        encoding: 'utf-8',
        shell: true,
        maxBuffer: GATE_MAX_BUFFER_BYTES,
      });
      if (result.error) return { exitCode: 127, output: `${command}: ${result.error.message}` };
      return {
        exitCode: result.status ?? 1,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      };
    },
    coverageProbe
  );
} else {
  outcome = await run(defaultAsyncRunner, 'full', coverageProbe, { targets: [] }, undefined, {
    // `full` never enters repair, but the complete project verdict is still runtime-enforced
    // read-only. Coverage alone receives its narrow generated-artifact transaction.
    repair: createRepairMutationBoundary(resolve('.')),
    foundation: createRepairMutationBoundary(resolve('.'), 'full-profile gate'),
  });
}
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
