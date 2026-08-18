// @file: Closed-world types of the stack plugin system — plugin interface, gates, config, report.
// @consumers: stack-registry, stack-config, gate-runner, node-plugin, golang-plugin, verify.cmd
// @tasks: TSK-95

/** Identifier of a built-in stack plugin. */
export type StackId = 'node' | 'golang';

/**
 * @purpose An environment problem surfaced before any gate runs — actionable, never silent.
 * @consumer gate-runner, verify.cmd
 */
export type StackDiagnostic = {
  /** @purpose Stable machine-readable identifier of the problem. */
  readonly code: string;
  /** @purpose What is wrong. */
  readonly message: string;
  /** @purpose Concrete action that resolves it. */
  readonly fix: string;
};

/**
 * @purpose Detection result — carries the facts gathered along the way so later facets
 *   do not re-read the disk (spec §4.1).
 * @consumer stack-registry, verify.cmd
 */
export type StackDetection = {
  /** @purpose Which plugin produced this detection. */
  readonly stack: StackId;
  /** @purpose Absolute repository root the detection applies to. */
  readonly root: string;
  /** @purpose Human-readable `key: value` lines shown by `verify --plan`. */
  readonly summary: readonly string[];
  /** @purpose Environment problems found during detection. */
  readonly diagnostics: readonly StackDiagnostic[];
  /** @purpose Plugin-owned payload threaded back into resolveScope/planGates. */
  readonly details: unknown;
};

/**
 * @purpose How the operator asked to narrow the run.
 * @consumer verify.cmd, plugins
 */
export type ScopeRequest = {
  /** @purpose Scoping strategy: explicit targets, changed-vs-base, or whole repo. */
  readonly mode: 'files' | 'changed' | 'all';
  /** @purpose Explicit file or directory targets; only meaningful in `files` mode. */
  readonly targets: readonly string[];
};

/**
 * @purpose A plugin's resolved scope for one run.
 * @consumer verify.cmd, plugins
 */
export type StackScope = {
  /** @purpose Scoping strategy that was actually applied. */
  readonly mode: ScopeRequest['mode'];
  /** @purpose Human-readable note explaining how the scope was derived. */
  readonly note: string;
  /** @purpose Plugin-owned payload threaded into planGates. */
  readonly details: unknown;
};

/**
 * @purpose Failure-classification predicate: true = ENV_FAIL (environment), false = the code.
 *   Composed from gate-runner combinators: exitAbove, outputMatches, spawnFailed.
 * @consumer gate-runner, plugins
 */
export type EnvFailPredicate = (exitCode: number | null, output: string) => boolean;

/**
 * @purpose A planned verification gate — pure data, executed without a shell by the runner.
 * @consumer gate-runner, stack-config, verify.cmd
 */
export type Gate = {
  /** @purpose Gate identifier, unique within its stack (e.g. `build`, `lint`). */
  readonly id: string;
  /** @purpose Stack the gate belongs to; qualified name in reports and CLI: `stack:id`. */
  readonly stack: StackId;
  /** @purpose Short human label shown in reports. */
  readonly label: string;
  /** @purpose argv, executed without a shell. Empty when skipped. */
  readonly argv: readonly string[];
  /** @purpose Working directory for the gate. */
  readonly cwd: string;
  /** @purpose Environment variables merged over process.env; config-supplied wins. */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * @purpose MANDATORY per-gate timeout in ms; exceeding it → TIMEOUT. No global timeout
   *   exists — the run's bound is the plan's sum (D-STACK-007).
   */
  readonly timeoutMs: number;
  /** @purpose When true, any stdout on exit 0 means failure (gofmt -l contract). */
  readonly outputMeansFailure: boolean;
  /** @purpose Run in an ephemeral working-tree replica; resulting drift = FAIL (spec §2, D-STACK-011). */
  readonly sandbox?: boolean;
  /** @purpose ENV_FAIL predicates; absent/empty means every failure implicates the code. */
  readonly envFail?: readonly EnvFailPredicate[];
  /** @purpose Populated when the gate cannot run; it is then reported, not executed. */
  readonly skipped: string | null;
};

/**
 * @purpose Outcome of one gate: `fail` implicates the code; `env-fail` the environment —
 *   never a reason to edit sources.
 * @consumer gate-runner, verify.cmd
 */
export type GateResult = {
  /** @purpose The gate that produced this result. */
  readonly gate: Gate;
  /** @purpose Verdict of the execution. */
  readonly status: 'pass' | 'fail' | 'env-fail' | 'skipped' | 'timeout';
  /** @purpose Process exit code, or null when skipped or killed. */
  readonly exitCode: number | null;
  /** @purpose Wall-clock duration in milliseconds. */
  readonly durationMs: number;
  /** @purpose Combined stdout+stderr, retained only for non-passing gates. */
  readonly output: string;
};

/**
 * @purpose One stack's contribution to a verify run: detection, scope and gate plan.
 * @consumer gate-runner, verify.cmd
 */
export type StackRun = {
  /** @purpose Detection the plan was derived from. */
  readonly detection: StackDetection;
  /** @purpose Scope the gates apply to. */
  readonly scope: StackScope;
  /** @purpose Ordered gate plan after config application. */
  readonly gates: readonly Gate[];
};

/**
 * @purpose Aggregate result of a full verify run across all active stacks.
 * @consumer verify.cmd
 */
export type VerifyReport = {
  /** @purpose Per-stack runs in detection order. */
  readonly runs: readonly StackRun[];
  /** @purpose Detection-level diagnostics carried into the report. */
  readonly diagnostics: readonly StackDiagnostic[];
  /** @purpose Per-gate results in plan order. */
  readonly results: readonly GateResult[];
  /** @purpose Number of executed gates that passed. */
  readonly passed: number;
  /** @purpose Number of gates actually executed; skipped gates are excluded. */
  readonly total: number;
  /** @purpose True only when every executed gate passed. */
  readonly ok: boolean;
};

/**
 * @purpose Options a plugin receives when planning gates.
 * @consumer plugins, verify.cmd
 */
export type GatePlanOptions = {
  /** @purpose Plugin's slice of the merged config, or null — golang reads it to render `go test -timeout`. */
  readonly pluginConfig: StackPluginConfig | null;
};

/**
 * @purpose Gate override/extension from config; one schema per config.spec §3.4 —
 *   overrides inherit unset fields, extraGates require id+argv.
 * @consumer stack-config
 */
export type GateSpec = {
  /** @purpose Gate id (required in extraGates/fixers; the map key in overrideGates). */
  readonly id?: string;
  /** @purpose argv, executed without a shell. */
  readonly argv?: readonly string[];
  /** @purpose Working directory relative to the repo root. */
  readonly cwd?: string;
  /** @purpose Environment variables merged over process.env. */
  readonly env?: Readonly<Record<string, string>>;
  /** @purpose Duration string (`"90s"`, `"5m"`, `"1h"`); extraGates default: `"10m"`. */
  readonly timeout?: string;
  /** @purpose Stdout contract; extraGates default: false. */
  readonly outputMeansFailure?: boolean;
};

/**
 * @purpose Per-plugin section of the stack config (config.spec §3.3).
 * @consumer stack-config, plugins
 */
export type StackPluginConfig = {
  /** @purpose Gate ids excluded from the plan — visibly, as skip entries. */
  readonly skipGates?: readonly string[];
  /** @purpose Overrides of built-in gates, keyed by gate id. */
  readonly overrideGates?: Readonly<Record<string, GateSpec>>;
  /** @purpose Repo-specific gates appended after the built-ins. */
  readonly extraGates?: readonly GateSpec[];
  /** @purpose Reserved for `gennady fix` (spec §4.4); validated, not executed in v1. */
  readonly fixers?: readonly GateSpec[];
};

/**
 * @purpose The merged `stack` section of the config files (config.spec §1.2).
 * @consumer stack-config, stack-registry
 */
export type StackConfig = {
  /** @purpose Restrict the plugin registry to these ids; default is full auto-detection. */
  readonly use?: readonly string[];
  /** @purpose Per-plugin configuration, keyed by plugin id. */
  readonly [pluginId: string]: unknown;
};

/**
 * @purpose The mandatory verify facet: scope resolution and gate planning (spec §4.2).
 * @consumer verify.cmd, plugins
 */
export type StackVerifyCapability = {
  /**
   * @purpose Narrow a run to the packages/files the request covers.
   * @param detection Detection previously produced by this plugin.
   * @param request Operator's scoping request.
   * @returns Resolved scope.
   */
  resolveScope(detection: StackDetection, request: ScopeRequest): StackScope;
  /**
   * @purpose Plan the ordered, non-mutating gate list for a scope.
   * @param detection Detection previously produced by this plugin.
   * @param scope Scope previously resolved by this plugin.
   * @param options Planning options including the plugin's config slice.
   * @returns Gates in deterministic order; unrunnable gates carry a skip reason.
   */
  planGates(detection: StackDetection, scope: StackScope, options: GatePlanOptions): Gate[];
};

/**
 * @purpose The fix facet: mutating operations executed in the REAL tree by `gennady fix` (§4.4).
 * @consumer fix.cmd, plugins
 */
export type StackFixCapability = {
  /**
   * @purpose Plan the plugin's built-in fixers for a scope (v1 golang: `generate`).
   * @param detection Detection previously produced by this plugin.
   * @param scope Scope previously resolved by this plugin.
   * @returns Fixers as Gate data; mutation is expected, `sandbox` is never set.
   */
  planFixers(detection: StackDetection, scope: StackScope): Gate[];
};

/**
 * @purpose Common interface every stack implements; `verify` is the only mandatory facet,
 *   optional facets arrive as optional fields (spec §4.3).
 * @invariant No operation mutates the working tree; detect may only run short probe commands.
 * @consumer stack-registry, verify.cmd
 */
export type StackPlugin = {
  /** @purpose Unique plugin identifier. */
  readonly id: StackId;
  /** @purpose Root marker file the detection checks (e.g. `go.mod`) — rendered in rosters. */
  readonly marker: string;
  /** @purpose One-line human description rendered in help and error rosters. */
  readonly description: string;
  /**
   * @purpose Recognize a repository by its root marker file (spec §3); null when not this stack.
   * @param root Absolute repository root.
   * @returns Detection payload, or null.
   */
  detect(root: string): StackDetection | null;
  /** @purpose The mandatory verify facet. */
  readonly verify: StackVerifyCapability;
  /** @purpose Optional fix facet: built-in mutating fixers for `gennady fix`. */
  readonly fix?: StackFixCapability;
};
