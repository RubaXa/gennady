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
import { parseInvocation, stackConfigError } from './sdd-verify.types.ts';
import { resolvePhaseContext } from './phase-context.ts';
import { runPhaseVerification } from './phase-run.ts';
import { selectCoverageAdapter } from '../testcov/coverage-adapter-registry.ts';
import { createCoverageArtifactBoundary } from '../testcov/coverage-artifact.ts';
import { loadStackConfig, type StackConfigLoad } from '../../../shared/verify/stack-config.ts';
import { BUILTIN_GATE_IDS } from '../../../shared/verify/stack-registry.ts';
import { resolveAssembledFullProfile } from './full-profile-plan.ts';
import { resolveTreeGuard } from '../../../shared/verify/tree-guard.ts';

// Consume this one-process hook channel before any gate subprocess is created. Nested commands and
// tests must not inherit permission to select an index baseline in their own repositories.
const preCommitIndexMode = process.env.GENNADY_INTERNAL_PRECOMMIT_INDEX === '1';
delete process.env.GENNADY_INTERNAL_PRECOMMIT_INDEX;

const invocation = parseInvocation(process.argv);
if (!invocation.ok) {
  console.error(invocation.message);
  process.exit(4);
}

// The same registry entry drives testcov and sdd-verify. Unsupported/ambiguous platforms remain a
// dormant teaching failure until a test:coverage rung actually needs the probe; setup/code profiles
// do not acquire an irrelevant coverage dependency.
const projectRoot = resolve('.');

// V-07: the `stack:` config section is a real gate here, ahead of any gate execution — a
// malformed gennady.yaml/.gennadyrc must never let verify run on a config it cannot trust
// (config.spec §4.1). No section present at all is not an error (config: null, errors: []).
const stackConfigLoad: StackConfigLoad = loadStackConfig(projectRoot, BUILTIN_GATE_IDS);
if (stackConfigLoad.errors.length > 0) {
  const outcome = stackConfigError(stackConfigLoad.errors);
  console.error(outcome.message);
  process.exit(outcome.exitCode);
}
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
    return read.ok
      ? { ok: true }
      : {
          ok: false,
          detail: `adapter=${coverageSelection.kind === 'selected' ? coverageSelection.adapter.id : 'unknown'} expected=${coverageBoundary!.reportRelative}: ${read.detail}`,
        };
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
  let fullPlan;
  try {
    fullPlan = resolveAssembledFullProfile(projectRoot, stackConfigLoad.config);
  } catch (cause) {
    console.error(`[sdd-verify] ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exit(1);
  }
  // The hook proves and the guard independently re-proves that worktree == index. This internal
  // channel lets pre-commit verify the exact staged candidate; it is intentionally not a CLI flag.
  const tree = resolveTreeGuard(projectRoot, undefined, {
    staged: preCommitIndexMode,
  });
  if (tree.kind === 'error') {
    outcome = {
      ok: false as const,
      code: 'ERR_CLI_SDD_VERIFY_TREE_GUARD',
      exitCode: 4 as const,
      message: `[sdd-verify] ${tree.message}`,
    };
  } else {
    try {
      outcome = await run(
        defaultAsyncRunner,
        'full',
        coverageProbe,
        { targets: [], only: invocation.only, skip: invocation.skip, fullPlan },
        undefined,
        undefined,
        tree
      );
    } finally {
      if (tree.kind === 'guard') tree.guard.release();
    }
  }
}
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
