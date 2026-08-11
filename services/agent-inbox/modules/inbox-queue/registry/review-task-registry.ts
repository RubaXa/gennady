// @file: ReviewTaskRegistry — closed catalog of task kinds, dependencies, exclusions, dedup and session policies.
// @consumers: TaskExecutorPort, ReviewEffectCoordinator
// @tasks: TSK-177

import { logger } from '#logger';

/**
 * @purpose Session policy for a task kind — how to route to an opencode session.
 */
export type ReviewTaskSessionPolicy =
  | 'engine'
  | 'task'
  | 'new_fresh'
  | 'reuse_producer'
  | 'operator_chat';

/**
 * @purpose Priority tier constants for queue scheduling.
 * @invariant operator=90 > event=50 > pipeline=10.
 */
export const REVIEW_TASK_PRIORITY = {
  pipeline: 10,
  event: 50,
  operator: 90,
} as const;

/**
 * @purpose Definition of one registered task kind.
 */
export type ReviewTaskDefinition = Readonly<{
  /** @purpose Unique task kind identifier (may include glob suffix e.g. track_*) */
  kind: string;
  /** @purpose Task kind IDs that can run in parallel with this kind */
  parallelWith: readonly string[];
  /** @purpose Task kind IDs that cannot run concurrently with this kind */
  exclusiveWith: readonly string[];
  /** @purpose Task kind IDs that must be done before this kind can start */
  dependsOn: readonly string[];
  /** @purpose Session routing policy */
  sessionPolicy: ReviewTaskSessionPolicy;
  /** @purpose Default numeric priority | @invariant 1–100, higher = more urgent */
  priority: number;
}>;

/**
 * @purpose Dedup key computation result.
 */
export type ReviewDedupKey = string;

/**
 * @purpose Closed catalog of task kinds — loaded once at boot, never mutated.
 * @invariant Registry is immutable after construction.
 * @invariant Unknown kind or cycle is rejected before enqueue.
 */
export class ReviewTaskRegistry {
  /** @purpose Internal kind map. */
  protected _kinds: Map<string, ReviewTaskDefinition>;

  /** @purpose Build the registry with all spec-defined task kinds. */
  constructor() {
    this._kinds = new Map();
    this._populateKinds();
    logger.debug('[ReviewTaskRegistry#constructor] [init → ready]', { count: this._kinds.size });
  }

  /**
   * @purpose Populate the registry with all spec-defined kinds.
   * @sideEffect Mutates this._kinds.
   */
  protected _populateKinds(): void {
    const pipeline = REVIEW_TASK_PRIORITY.pipeline;
    const event = REVIEW_TASK_PRIORITY.event;
    const operator = REVIEW_TASK_PRIORITY.operator;

    // Pipeline stages
    this._register({
      kind: 'prepare_env',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'engine',
      priority: pipeline,
    });
    this._register({
      kind: 'plan',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['prepare_env'],
      sessionPolicy: 'engine',
      priority: pipeline,
    });
    this._register({
      kind: 'enrich',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['plan'],
      sessionPolicy: 'engine',
      priority: pipeline,
    });
    this._register({
      kind: 'gate_coverage',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['track_*', 'lens_*'],
      sessionPolicy: 'engine',
      priority: pipeline,
    });
    this._register({
      kind: 'gate_verdict',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['synthesize'],
      sessionPolicy: 'engine',
      priority: pipeline,
    });

    // Fan-out patterns
    this._register({
      kind: 'track_*',
      parallelWith: ['track_*', 'lens_*'],
      exclusiveWith: [],
      dependsOn: ['enrich'],
      sessionPolicy: 'task',
      priority: pipeline,
    });
    this._register({
      kind: 'lens_*',
      parallelWith: ['track_*', 'lens_*'],
      exclusiveWith: [],
      dependsOn: ['enrich'],
      sessionPolicy: 'task',
      priority: pipeline,
    });

    // Synthesis
    this._register({
      kind: 'synthesize',
      parallelWith: [],
      exclusiveWith: ['delta_review'],
      dependsOn: ['track_*', 'lens_*'],
      sessionPolicy: 'task',
      priority: pipeline,
    });

    // Event-driven
    this._register({
      kind: 'delta_review',
      parallelWith: [],
      exclusiveWith: ['synthesize'],
      dependsOn: [],
      sessionPolicy: 'task',
      priority: event,
    });
    this._register({
      kind: 'delta_prepare',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['delta_review'],
      sessionPolicy: 'engine',
      priority: event,
    });
    this._register({
      kind: 'delta_changeset',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['delta_prepare'],
      sessionPolicy: 'engine',
      priority: event,
    });
    this._register({
      kind: 'delta_tracks',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['delta_changeset'],
      sessionPolicy: 'task',
      priority: event,
    });
    this._register({
      kind: 'synthesize_delta',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['delta_tracks'],
      sessionPolicy: 'task',
      priority: event,
    });
    this._register({
      kind: 'gate_verdict_delta',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['synthesize_delta'],
      sessionPolicy: 'engine',
      priority: event,
    });
    this._register({
      kind: 'verify_fix',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'task',
      priority: event,
    });
    this._register({
      kind: 'thread_triage',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'task',
      priority: event,
    });

    // User/operator
    this._register({
      kind: 'fact_check',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'new_fresh',
      priority: operator,
    });
    this._register({
      kind: 'deepen',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'reuse_producer',
      priority: operator,
    });
    this._register({
      kind: 'widen_search',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'new_fresh',
      priority: operator,
    });
    this._register({
      kind: 'mutate_artifact',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'reuse_producer',
      priority: operator,
    });
    this._register({
      kind: 'chat_question',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'operator_chat',
      priority: operator,
    });

    // Effects — strictly sequential, gated by operator decision
    this._register({
      kind: 'effect_*',
      parallelWith: [],
      exclusiveWith: ['effect_*'],
      dependsOn: [],
      sessionPolicy: 'engine',
      priority: operator,
    });

    // Tail stages
    this._register({
      kind: 'tail_author',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['gate_verdict'],
      sessionPolicy: 'task',
      priority: pipeline,
    });
    this._register({
      kind: 'tail_reviewer',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: ['gate_verdict'],
      sessionPolicy: 'task',
      priority: pipeline,
    });
  }

  /**
   * @purpose Register a task kind definition.
   * @param def Kind definition.
   */
  protected _register(def: ReviewTaskDefinition): void {
    this._kinds.set(def.kind, Object.freeze(def));
  }

  /**
   * @purpose Resolve a task kind definition by exact name or pattern match.
   * @param kind Exact kind name (may be a concrete e.g. track_logic or effect_resolve).
   * @throws {Error} When the kind is not registered and matches no pattern.
   * @returns Kind definition.
   */
  resolveKind(kind: string): ReviewTaskDefinition {
    const direct = this._kinds.get(kind);
    if (direct) return direct;

    // #region START_RESOLVE_PATTERN — concrete kind names match registered glob patterns
    if (kind.startsWith('track_')) return this._kinds.get('track_*')!;
    if (kind.startsWith('lens_')) return this._kinds.get('lens_*')!;
    if (kind.startsWith('effect_')) return this._kinds.get('effect_*')!;
    // #endregion END_RESOLVE_PATTERN

    const error = new Error(`[ReviewTaskRegistry#resolveKind] Unknown task kind: ${kind}`);
    logger.error(`[ReviewTaskRegistry#resolveKind] [lookup → not_found] kind=${kind}`, { error });
    throw error;
  }

  /**
   * @purpose Compute a canonical dedup key for a task kind and its params.
   * @invariant Keys are stable across re-invocations for the same type+params.
   * @param kind Task kind.
   * @param params Task parameters.
   * @returns Canonical dedup key string.
   */
  computeDedupKey(kind: string, params: Record<string, unknown>): ReviewDedupKey {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(params).sort()) {
      sorted[key] = params[key];
    }
    return `${kind}::${JSON.stringify(sorted)}`;
  }

  /**
   * @purpose Check whether a kind is an effect task.
   * @param kind Task kind name.
   * @returns True when the kind starts with effect_.
   */
  isEffectKind(kind: string): boolean {
    return kind.startsWith('effect_');
  }

  /**
   * @purpose Enumerate all registered kind names.
   * @returns Array of kind name strings.
   */
  listKinds(): string[] {
    return [...this._kinds.keys()];
  }
}
