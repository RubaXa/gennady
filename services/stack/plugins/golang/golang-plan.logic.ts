// @file: Turn a detected Go project plus a scope into an ordered, non-mutating gate plan.
// @consumers: golang-plugin, stack-config (gate id list)
// @tasks: TSK-95

import type { EnvFailPredicate, Gate, GatePlanOptions } from '../../stack.types.ts';
import { exitAbove, outputMatches } from '../../gate-runner.ts';
import { parseDuration } from '../../stack-config.ts';
import type { GoProject } from './golang-detect.logic.ts';
import type { GoScope } from './golang-scope.logic.ts';

/** Identifier of a built-in golang gate. */
export type GoGateId = 'build' | 'vet' | 'fmt' | 'lint' | 'test';

/** Built-in golang gates in run order — cheapest and most diagnostic first. */
export const GO_GATE_ORDER: readonly GoGateId[] = ['build', 'vet', 'fmt', 'lint', 'test'];

/** Human labels for each gate id. */
const GATE_LABELS: Readonly<Record<GoGateId, string>> = {
  build: 'go build',
  vet: 'go vet',
  fmt: 'gofmt -l (check only)',
  lint: 'golangci-lint run',
  test: 'go test',
};

/** Default per-gate timeouts in ms (spec D-STACK-007). */
const GATE_TIMEOUTS_MS: Readonly<Record<GoGateId, number>> = {
  build: 5 * 60_000,
  vet: 5 * 60_000,
  fmt: 60_000,
  lint: 5 * 60_000,
  test: 10 * 60_000,
};

/** A Go panic trace is never a finding — the analyser aborted. */
const PANIC_RE = /^panic: /m;

/** Dependency fetch failures — sandboxed/corp environments; the code was never compiled. */
const MODULE_FETCH_RE =
  /^go: .*(?:Forbidden|403|410 Gone|dial tcp|i\/o timeout|no such host|connection refused|certificate|module lookup disabled|proxy\.golang\.org|unrecognized import path)/m;

/** Predicates shared by every go-toolchain gate. */
const GO_TOOL_ENV_FAIL: readonly EnvFailPredicate[] = [
  outputMatches(PANIC_RE),
  outputMatches(MODULE_FETCH_RE),
];

/**
 * @purpose Build the shared module-resolution flags so vendored repos never reach the network.
 * @param project Detected project.
 * @returns `-mod=vendor` when the repo vendors its dependencies, otherwise no flags.
 */
function moduleFlags(project: GoProject): string[] {
  // A go.work file takes precedence over vendoring and rejects -mod=vendor outright.
  if (project.workspace !== null) {
    return [];
  }
  return project.vendored ? ['-mod=vendor'] : [];
}

/**
 * @purpose Create a gate that is reported but never executed, with the reason recorded.
 * @param id Gate identifier.
 * @param cwd Working directory the gate would have used.
 * @param reason Why the gate cannot run.
 * @returns A skipped gate carrying the reason.
 */
function skippedGate(id: GoGateId, cwd: string, reason: string): Gate {
  return {
    id,
    stack: 'golang',
    label: GATE_LABELS[id],
    argv: [],
    cwd,
    timeoutMs: GATE_TIMEOUTS_MS[id],
    outputMeansFailure: false,
    skipped: reason,
  };
}

/**
 * @purpose Plan the golang gate list for a project and scope.
 * @invariant Gates never mutate the tree: `gofmt -l`, never `go fmt`; drift checks are an extraGates recipe.
 * @invariant Emitted gates follow GO_GATE_ORDER; unrunnable gates carry a skip reason.
 * @invariant The test gate renders its effective timeout into `go test -timeout`.
 * @param project Detected Go project.
 * @param scope Resolved scope determining which packages and files gates apply to.
 * @param options Planning options; overrideGates.test.timeout is read so the `-timeout` flag matches.
 * @returns Ordered gate plan.
 */
export function planGoGates(project: GoProject, scope: GoScope, options: GatePlanOptions): Gate[] {
  const go = project.tools.go.bin;
  const gofmt = project.tools.gofmt.bin;
  const linter = project.tools['golangci-lint'].bin;

  const testTimeoutOverride = options.pluginConfig?.overrideGates?.['test']?.timeout;
  const testTimeoutMs =
    testTimeoutOverride !== undefined
      ? (parseDuration(testTimeoutOverride) ?? GATE_TIMEOUTS_MS.test)
      : GATE_TIMEOUTS_MS.test;

  const flags = moduleFlags(project);
  const noPackages = scope.packages.length === 0;
  const gates: Gate[] = [];

  // #region START_GATE_ASSEMBLY — invariant: emitted gates follow GO_GATE_ORDER
  for (const id of GO_GATE_ORDER) {
    if (go === null && id !== 'fmt') {
      gates.push(skippedGate(id, project.root, 'go toolchain not found in PATH'));
      continue;
    }

    if (noPackages && id !== 'fmt') {
      gates.push(skippedGate(id, project.root, `no packages in scope (${scope.note})`));
      continue;
    }

    switch (id) {
      case 'build':
        gates.push({
          id,
          stack: 'golang',
          label: GATE_LABELS[id],
          argv: [go!, 'build', ...flags, ...scope.packages],
          cwd: project.root,
          timeoutMs: GATE_TIMEOUTS_MS[id],
          outputMeansFailure: false,
          envFail: GO_TOOL_ENV_FAIL,
          skipped: null,
        });
        break;

      case 'vet':
        gates.push({
          id,
          stack: 'golang',
          label: GATE_LABELS[id],
          argv: [go!, 'vet', ...flags, ...scope.packages],
          cwd: project.root,
          timeoutMs: GATE_TIMEOUTS_MS[id],
          outputMeansFailure: false,
          envFail: GO_TOOL_ENV_FAIL,
          skipped: null,
        });
        break;

      case 'fmt':
        // `gofmt -l` only lists offenders; the rewriting `go fmt` is forbidden as a gate.
        if (gofmt === null) {
          gates.push(skippedGate(id, project.root, 'gofmt not found in PATH'));
        } else if (scope.fmtTargets.length === 0) {
          gates.push(skippedGate(id, project.root, 'no Go files in scope'));
        } else {
          gates.push({
            id,
            stack: 'golang',
            label: GATE_LABELS[id],
            argv: [gofmt, '-l', ...scope.fmtTargets],
            cwd: project.root,
            timeoutMs: GATE_TIMEOUTS_MS[id],
            outputMeansFailure: true,
            skipped: null,
          });
        }
        break;

      case 'lint':
        // Config passed via -c: auto-discovery misses non-dot names like `golangci.yml`.
        if (linter === null) {
          gates.push(
            skippedGate(
              id,
              project.root,
              'golangci-lint not found (PATH or ./bin) — install it, or skip via stack.golang.skipGates'
            )
          );
        } else {
          gates.push({
            id,
            stack: 'golang',
            label: `${GATE_LABELS[id]}${project.golangciConfig === null ? ' (default config)' : ''}`,
            argv: [
              linter,
              'run',
              ...(project.golangciConfig !== null ? ['-c', project.golangciConfig] : []),
              ...scope.packages,
            ],
            cwd: project.root,
            timeoutMs: GATE_TIMEOUTS_MS[id],
            outputMeansFailure: false,
            // golangci-lint reserves exit 1 for findings; anything above is the tool breaking.
            envFail: [exitAbove(1), ...GO_TOOL_ENV_FAIL],
            skipped: null,
          });
        }
        break;

      case 'test':
        gates.push({
          id,
          stack: 'golang',
          label: GATE_LABELS[id],
          argv: [
            go!,
            'test',
            `-timeout=${Math.floor(testTimeoutMs / 1000)}s`,
            ...flags,
            ...scope.packages,
          ],
          cwd: project.root,
          timeoutMs: testTimeoutMs,
          outputMeansFailure: false,
          envFail: GO_TOOL_ENV_FAIL,
          skipped: null,
        });
        break;
    }
  }
  // #endregion END_GATE_ASSEMBLY

  return gates;
}
