// @file: Turn a detected Go project plus a scope into an ordered, non-mutating gate plan.
// @consumers: golang-plugin, stack-config (gate id list)
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import type { EnvFailPredicate, Gate, GatePlanOptions } from '../../stack.types.ts';
import { exitCodeMatches, outputMatches } from '../../env-fail.ts';
import { parseDuration } from '../../stack-config.ts';
import { execFileTrimSafe } from '../../../../shared/common/exec.ts';
import type { GoProject } from './golang-detect.logic.ts';
import type { GoScope } from './golang-scope.logic.ts';

/** Identifier of a built-in golang gate. */
export type GoGateId = 'generate' | 'build' | 'vet' | 'fmt' | 'lint' | 'test';

/** Built-in golang gates in run order — codegen is a build prerequisite, so it goes first. */
export const GO_GATE_ORDER: readonly GoGateId[] = [
  'generate',
  'build',
  'vet',
  'fmt',
  'lint',
  'test',
];

/** Human labels for each gate id. */
const GATE_LABELS: Readonly<Record<GoGateId, string>> = {
  generate: 'go generate (sandboxed drift check)',
  build: 'go build',
  vet: 'go vet',
  fmt: 'gofmt -l (check only)',
  lint: 'golangci-lint run',
  test: 'go test',
};

/** Default per-gate timeouts in ms (spec D-STACK-007). */
const GATE_TIMEOUTS_MS: Readonly<Record<GoGateId, number>> = {
  generate: 5 * 60_000,
  build: 5 * 60_000,
  vet: 5 * 60_000,
  fmt: 60_000,
  lint: 5 * 60_000,
  test: 10 * 60_000,
};

/** Directive that marks a file as carrying code generation instructions. */
const GO_GENERATE_DIRECTIVE_RE = /^\/\/go:generate /m;

/**
 * @purpose Detect whether the scope carries any //go:generate directive.
 * @invariant Scoped modes read only the scope's files; `all` mode asks `git grep` (index-fast)
 *   and falls back to an early-exit walk for non-git checkouts.
 * @param project Detected project (root for the all-mode search).
 * @param scope Resolved scope; `files` is authoritative when non-empty.
 * @returns True when at least one directive exists in scope.
 */
export function scopeHasGoGenerate(project: GoProject, scope: GoScope): boolean {
  if (scope.files.length > 0) {
    return scope.files.some((file) => {
      try {
        return GO_GENERATE_DIRECTIVE_RE.test(fs.readFileSync(file, 'utf-8'));
      } catch {
        return false;
      }
    });
  }

  const hits = execFileTrimSafe(
    'git',
    // --untracked: a newly added generator file is not in the index yet, and skipping the
    // drift gate for it would hide exactly the codegen a change is introducing.
    ['grep', '-l', '--untracked', '-E', '^//go:generate ', '--', '*.go'],
    project.root
  );
  if (hits.length > 0) {
    return true;
  }

  // Non-git checkout (git grep failed silently) or genuinely no hits: cheap walk, early exit.
  const walk = (dir: string): boolean => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.go')) {
        try {
          if (GO_GENERATE_DIRECTIVE_RE.test(fs.readFileSync(child, 'utf-8'))) {
            return true;
          }
        } catch {
          continue;
        }
      } else if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !['vendor', 'testdata', 'node_modules'].includes(entry.name)
      ) {
        if (walk(child)) {
          return true;
        }
      }
    }
    return false;
  };
  const isGitRepo = execFileTrimSafe('git', ['rev-parse', '--git-dir'], project.root).length > 0;
  return isGitRepo ? false : walk(project.root);
}

/**
 * @purpose Build the `go generate` argv for a scope — shared by the drift gate and the fixer.
 * @param project Detected project.
 * @param scope Resolved scope.
 * @returns argv, or null when the go toolchain is unavailable.
 */
export function buildGoGenerateArgv(project: GoProject, scope: GoScope): readonly string[] | null {
  const go = project.tools.go.bin;
  if (go === null) {
    return null;
  }
  return [go, 'generate', ...moduleFlags(project), ...scope.packages];
}

/** A Go panic trace is never a finding — the analyser aborted. */
const PANIC_RE = /^panic: /m;

/** Dependency fetch failures — sandboxed/corp environments; the code was never compiled. */
const MODULE_FETCH_RE =
  /^go: .*(?:Forbidden|403|410 Gone|dial tcp|i\/o timeout|no such host|connection refused|certificate|module lookup disabled|proxy\.golang\.org|unrecognized import path)/m;

/** Predicates for gates where a panic means the TOOL crashed (build/vet/lint — not test). */
const GO_TOOL_ENV_FAIL: readonly EnvFailPredicate[] = [
  outputMatches(PANIC_RE),
  outputMatches(MODULE_FETCH_RE),
];

/** Predicates for the test gate: a panic there is the code under test failing — a genuine FAIL. */
const GO_TEST_ENV_FAIL: readonly EnvFailPredicate[] = [outputMatches(MODULE_FETCH_RE)];

/** Predicates for the generate gate: a missing generator binary is the environment (D-STACK-012). */
const GO_GENERATE_ENV_FAIL: readonly EnvFailPredicate[] = [
  outputMatches(MODULE_FETCH_RE),
  outputMatches(
    /executable file not found/,
    'the generator binary is not in PATH — `go install` it or declare it as a go.mod `tool` directive; gitignored binaries are not replicated into the sandbox (D-STACK-012)'
  ),
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
 * @invariant Gates never mutate: `gofmt -l` never `go fmt`; `build` discards output (`-o /dev/null`).
 * @invariant Emitted gates follow GO_GATE_ORDER; unrunnable gates carry a skip reason.
 * @invariant The test gate renders its effective timeout into `go test -timeout`; `generate`
 *   carries its fixer — the same work in the real tree (§4.4).
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
      case 'generate':
        // Sandboxed drift check before build (§4.4, D-STACK-011); fixer: gennady fix golang:generate.
        if (!scopeHasGoGenerate(project, scope)) {
          gates.push(skippedGate(id, project.root, 'no //go:generate directives in scope'));
        } else {
          gates.push({
            id,
            stack: 'golang',
            label: GATE_LABELS[id],
            argv: buildGoGenerateArgv(project, scope)!,
            cwd: project.root,
            timeoutMs: GATE_TIMEOUTS_MS[id],
            outputMeansFailure: false,
            driftMeansFailure: true,
            envFail: GO_GENERATE_ENV_FAIL,
            fixer: {
              argv: buildGoGenerateArgv(project, scope)!,
              cwd: project.root,
              timeoutMs: GATE_TIMEOUTS_MS[id],
            },
            skipped: null,
          });
        }
        break;

      case 'build':
        gates.push({
          id,
          stack: 'golang',
          label: GATE_LABELS[id],
          argv: [go!, 'build', '-o', '/dev/null', ...flags, ...scope.packages],
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
            envFail: [exitCodeMatches('>1'), ...GO_TOOL_ENV_FAIL],
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
          envFail: GO_TEST_ENV_FAIL,
          skipped: null,
        });
        break;
    }
  }
  // #endregion END_GATE_ASSEMBLY

  return gates;
}
