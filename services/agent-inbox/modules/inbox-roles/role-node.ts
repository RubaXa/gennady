// @file: RoleNode — typed graph nodes (prep/session/gate/ask/effect) and edges for role definitions.
// @consumers: role-engine, role-instance, role-scheduler, reviewer.role.ts, author.role.ts
// @tasks: TSK-113, TSK-121

import type { MrContext, VcsInboxPort } from '../inbox-core/vcs-inbox.port.ts';
import type { StateStore } from '../inbox-core/state-store.ts';

/**
 * @purpose Result of a deterministic gate check — pass or fail with reason.
 * @consumer GateNode.verify
 */
export type GateResult = { pass: true } | { pass: false; reason: string };

/**
 * @purpose Question posed to the operator at an ask node.
 * @consumer AskNode.question
 */
export type OperatorQuestion = {
  /** @purpose Short title for dashboard display */
  title: string;
  /** @purpose Full question text */
  body: string;
  /** @purpose Allowed answer choices | @invariant At least one choice */
  choices: string[];
};

/**
 * @purpose Accumulated artifacts across the graph execution — checkpointed state.
 * @invariant Artifacts serve as checkpoints: on restart, the instance resumes from the last checkpoint.
 */
export type RoleArtifacts = Record<string, unknown>;

/** @purpose One file's diff stats between `NodeContext.base` and HEAD. */
export type ChangesetFile = {
  /** @purpose Repo-relative file path */
  path: string;
  /** @purpose Git status letter (A/M/D/R...) */
  status: string;
  /** @purpose Added line count */
  plus: number;
  /** @purpose Removed line count */
  minus: number;
};

/** @purpose File-level changeset between `NodeContext.base` and HEAD, from a live worktree. */
export type Changeset = {
  /** @purpose Changed files with per-file diff stats */
  files: ChangesetFile[];
};

/**
 * @purpose Context passed to every node in the graph — MR data, workspace path, and accumulated outputs.
 * @invariant `base`/`changeset` are set only for a live-built NodeContext (TSK-121); test-seeded
 *   contexts may leave them absent and drive branching purely through `artifacts`.
 */
export type NodeContext = {
  /** @purpose MR metadata from VCS */
  mr: MrContext;
  /** @purpose Path to the local workspace directory for this MR | @invariant Rooted under StateStore.getStateDir() (NFC-05) — never /tmp or os.tmpdir() */
  workspace: string;
  /** @purpose Accumulated artifacts from previous nodes */
  artifacts: RoleArtifacts;
  /** @purpose Diff base SHA | @invariant ALWAYS `diff_refs.base_sha` from the VCS API — never a locally recomputed merge-base */
  base?: string;
  /** @purpose File-level changeset between `base` and HEAD, when a live worktree is available */
  changeset?: Changeset;
  /** @purpose VCS handle for effect-node execution (NFC-SV-07) | @invariant Populated by the live context builder; wired into EffectExecutor calls starting TSK-121 P2 */
  vcs?: VcsInboxPort;
  /** @purpose State store handle for effect-node idempotency checks (audit log) */
  store?: StateStore;
};

/**
 * @purpose Retry policy for session nodes — bounds the recovery ladder.
 * @consumer SessionNode.policy
 */
export type SessionPolicy = {
  /** @purpose Timeout for a single agentic session call | @invariant Unit is minutes (3–10) — an agent turn is multi-step, not sub-second */
  promptTimeout: number;
  /** @purpose Max continue attempts before switching to restart */
  continueMax: number;
  /** @purpose Max restart attempts before escalating to AWAITING_OPERATOR */
  restartMax: number;
};

/**
 * @purpose JSON Schema descriptor for structured output validation.
 */
export type JsonSchema = Record<string, unknown>;

// ─── Discriminated node variants ──────────────────────────────────────────────

/**
 * @purpose Outcome of a deterministic prep node — selects the graph branch to follow.
 * @invariant `branch` feeds `Edge.on` matching — role graphs define their own branch
 *   vocabulary (e.g. 'review_needed', 'reply_needed', 'update-review').
 */
export type PrepResult = {
  /** @purpose Edge condition selecting the next branch */
  branch: string;
  /** @purpose Artifacts merged into ctx.artifacts (worktree paths, plan, discussions, vectors) */
  artifacts?: RoleArtifacts;
};

/**
 * @purpose Deterministic entry node: prepares workspace/context and selects a graph branch.
 * @invariant No LLM involvement. Reads discussions via `vcs-*` (read-only) and writes to disk,
 *   never to VCS — `vcs-*` mutations are EffectExecutor's exclusive job (NFC-SV-07).
 */
export type PrepNode = {
  /** @purpose Discriminant — identifies this node as a deterministic prep node. */
  kind: 'prep';
  /** @purpose Stable node identifier */
  id: string;
  /**
   * @purpose Prepare workspace/context and choose the branch to follow.
   * @param ctx MR context and accumulated artifacts.
   * @returns Branch selector and any artifacts to merge.
   * @sideEffect Filesystem writes under ctx.workspace; read-only `vcs-*` calls.
   */
  run(ctx: NodeContext): Promise<PrepResult>;
};

/**
 * @purpose AI-node: sends a system+user prompt to an LLM session and expects structured output.
 * @invariant One session node = one LLM call through OpenCodePort.
 */
export type SessionNode = {
  /** @purpose Discriminant — identifies this node as a session (LLM) node. */
  kind: 'session';
  /** @purpose Stable node identifier — used for seeding mock responses */
  id: string;
  /**
   * @purpose Build the concrete task text (file addresses, tracks, diff range) for this turn.
   * @invariant System instruction is NOT built here — the engine assembles it via
   *   `services/ai-kit` `buildNodePrompt(node.id, ctx)` from directive files.
   * @param ctx MR context and accumulated artifacts.
   * @returns Concrete, addressable task instruction for this turn.
   */
  buildTaskText(ctx: NodeContext): string;
  /**
   * @purpose Determine the working directory for the session.
   * @param ctx MR context and accumulated artifacts.
   * @returns Absolute path to the session directory.
   */
  dir(ctx: NodeContext): string;
  /**
   * @purpose Optional JSON Schema for structured output validation.
   */
  resultSchema?: JsonSchema;
  /**
   * @purpose Retry policy: timeout, continue max, restart max.
   */
  policy: SessionPolicy;
};

/**
 * @purpose Deterministic code gate: validates artifacts without LLM involvement.
 * @invariant Gates are pure functions — no side effects, no I/O, no LLM calls.
 */
export type GateNode = {
  /** @purpose Discriminant — identifies this node as a gate (deterministic) node. */
  kind: 'gate';
  /** @purpose Stable node identifier */
  id: string;
  /**
   * @purpose Verify accumulated artifacts and return pass/fail.
   * @param ctx MR context and accumulated artifacts.
   * @returns Gate result — pass with no data or fail with reason.
   */
  verify(ctx: NodeContext): GateResult;
};

/**
 * @purpose Operator interaction node: asks a question and waits for operator decision.
 * @invariant The instance pauses at this node until the operator responds.
 */
export type AskNode = {
  /** @purpose Discriminant — identifies this node as an operator-ask node. */
  kind: 'ask';
  /** @purpose Stable node identifier */
  id: string;
  /**
   * @purpose Pose a question to the operator based on current artifacts.
   * @param ctx MR context and accumulated artifacts.
   * @returns Operator question with title, body, and answer choices.
   */
  question(ctx: NodeContext): OperatorQuestion;
};

/**
 * @purpose Side-effect node: performs a public action (vcs-reply, approve, ping).
 * @invariant Effect idempotency: `effect_applied` marker in audit log before execution;
 *   on restart, effect nodes that already fired are skipped.
 */
export type EffectNode = {
  /** @purpose Discriminant — identifies this node as a side-effect node. */
  kind: 'effect';
  /** @purpose Stable node identifier */
  id: string;
  /**
   * @purpose Execute the side effect — post comment, approve MR, send notification.
   * @param ctx MR context and accumulated artifacts.
   * @returns Promise that resolves when the effect completes.
   * @sideEffect VCS write, notification send.
   */
  run(ctx: NodeContext): Promise<void>;
};

/**
 * @purpose Union type of all role graph nodes — discriminated by `kind`.
 */
export type RoleNode = PrepNode | SessionNode | GateNode | AskNode | EffectNode;

// ─── Edge and graph ───────────────────────────────────────────────────────────

/**
 * @purpose Transition condition evaluated after a node completes.
 * @invariant Well-known: 'ok'|'pass'|'fail'|'timeout'|'error'|'retry_exhausted'|'answered'.
 *   Prep nodes emit per-role branch names (e.g. 'review_needed') — kept open (string).
 */
export type EdgeCondition = string;

/**
 * @purpose Directed edge between nodes — triggered when the source node completes with a given condition.
 */
export type Edge = {
  /** @purpose Source node identifier */
  from: string;
  /** @purpose Target node identifier (or the sentinel 'done' for terminal state) */
  to: string;
  /** @purpose Condition that triggers this transition */
  on: EdgeCondition;
};

/**
 * @purpose Complete role definition — a graph of typed nodes connected by conditional edges.
 * @invariant Every node except terminal nodes has at least one outgoing edge.
 * @invariant 'done' is a terminal sentinel — edges to 'done' mark graph completion.
 */
export type RoleGraph = {
  /** @purpose All nodes in the graph — order-independent; edges define the topology */
  nodes: RoleNode[];
  /** @purpose Directed edges between nodes */
  edges: Edge[];
};

/**
 * @purpose Full role definition — graph + metadata for engine registration.
 * @consumer RoleEngine.register
 */
export type RoleDefinition = {
  /** @purpose Unique role name (e.g. 'reviewer', 'author') */
  name: string;
  /** @purpose Human-readable role description */
  description: string;
  /** @purpose The graph definition — nodes and edges */
  graph: RoleGraph;
};
