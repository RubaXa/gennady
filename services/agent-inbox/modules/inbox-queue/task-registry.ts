// @file: TaskRegistry — 19 task types (pipeline, pattern, event, user, effect), formal reference grammar (type-name/glob/allOf/producerOf/external), dedup key computation, supersede logic
// @consumers: Executor, InMemoryTaskQueue
// @tasks: TSK-159, TSK-161

import { logger } from '#logger';

/**
 * @purpose Formal grammar for task type references used in dependsOn/parallelWith/exclusiveWith.
 * @invariant Five kinds: type_name (exact), glob (wildcard pattern), all_of (aggregate), producer_of (artifact), external (operator decision).
 */
export type TaskReference =
  | { kind: 'type_name'; name: string }
  | { kind: 'glob'; pattern: string }
  | { kind: 'all_of'; refs: TaskReference[]; filter?: Record<string, unknown> }
  | { kind: 'producer_of'; artifact: string }
  | { kind: 'external'; precondition: string };

/**
 * @purpose Construct a type-name reference.
 * @param name Exact type name to reference.
 * @returns TaskReference of kind `type_name`.
 */
export function typeRef(name: string): TaskReference {
  return { kind: 'type_name', name };
}

/**
 * @purpose Construct a glob reference (e.g. `track_*`, `lens_*`).
 * @param pattern Glob pattern for matching type names.
 * @returns TaskReference of kind `glob`.
 */
export function globRef(pattern: string): TaskReference {
  return { kind: 'glob', pattern };
}

/**
 * @purpose Construct an allOf reference — all nested refs must be satisfied.
 * @param refs Nested references that must all be satisfied.
 * @param [filter] Optional params filter — only tasks matching the filter count.
 * @returns TaskReference of kind `all_of`.
 */
export function allOfRef(refs: TaskReference[], filter?: Record<string, unknown>): TaskReference {
  return { kind: 'all_of', refs, filter };
}

/**
 * @purpose Construct a producerOf reference — the producing task must be done.
 * @param artifact Artifact identifier produced by the target task.
 * @returns TaskReference of kind `producer_of`.
 */
export function producerOfRef(artifact: string): TaskReference {
  return { kind: 'producer_of', artifact };
}

/**
 * @purpose Construct an external reference — requires operator action to resolve.
 * @param precondition Human-readable description of the required action.
 * @returns TaskReference of kind `external`.
 */
export function externalRef(precondition: string): TaskReference {
  return { kind: 'external', precondition };
}

/** @purpose Lifecycle status a task instance traverses — queued → running → done/failed, plus waiting_dep and cancelled. */
export type TaskStatus = 'queued' | 'running' | 'waiting_dep' | 'done' | 'failed' | 'cancelled';

/** @purpose Session action assigned by the routing table — what session to use for this task. */
export type SessionPolicy = 'engine' | 'task' | 'new_fresh' | 'reuse_producer' | 'operator_chat';

/**
 * @purpose Configuration record for a task type — rules for parallelism, exclusivity, dependencies, session routing, and default priority.
 */
export type TaskType = {
  /** @purpose Unique type identifier (e.g. `prepare_env`, `fact_check`) */
  name: string;
  /** @purpose Task types that can run in parallel with this type */
  parallelWith: TaskReference[];
  /** @purpose Task types that cannot run concurrently with this type */
  exclusiveWith: TaskReference[];
  /** @purpose Task types that must be completed before this type can execute */
  dependsOn: TaskReference[];
  /** @purpose How to route a session for this task — engine is self-managed, task/new_fresh/reuse_producer/operator_chat involve sessions */
  sessionPolicy: SessionPolicy;
  /** @purpose Default numeric priority (1-100) — higher is more urgent | @invariant 👤user=90, 🦊event=50, 🏗pipeline=10 */
  priority: number;
};

/**
 * @purpose Runtime instance of a task within an MR queue — carries identity, state, params, and timing metadata.
 */
export type TaskInstance = {
  /** @purpose Per-MR monotonic task number (e.g. `#1`, `#42`) | @invariant Unique within MR */
  taskId: string;
  /** @purpose Task type name — resolves to a TaskType entry */
  type: string;
  /** @purpose Current lifecycle status */
  status: TaskStatus;
  /** @purpose Type-specific parameters for this instance */
  params: Record<string, unknown>;
  /** @purpose Resolved set of dependency references from the type definition */
  dependsOn: TaskReference[];
  /** @purpose Deduplication key — same key → same logical task | @invariant Computed from explicit dedupKey or type+canonical(params) */
  dedupKey: string;
  /** @purpose Effective priority — inherited from type, overridable per instance | @invariant 1-100, higher=more urgent */
  priority: number;
  /** @purpose Identifier of the actor that created this task (e.g. `pipeline`, `operator`) */
  createdBy: string;
  /** @purpose ISO timestamp of task creation */
  createdAt: string;
};

/** @purpose Default priorities for the three priority tiers — pipeline background, event-driven, and user-facing. */
const PRIORITY_TIERS = {
  pipeline: 10,
  event: 50,
  user: 90,
} as const;

/** @purpose Symbolic marker for all other effect types — used in exclusiveWith references. */
const ALL_EFFECTS: TaskReference = globRef('effect_*');

/**
 * @purpose Registry of all task types defined in the inbox-queue spec §3 — provides resolution, matching, and dependency evaluation.
 * @invariant Registry is immutable — types are defined once and never change at runtime.
 * @invariant 19 task types (5 pipeline + 2 pattern + 6 stage + 4 user + chat + effect + 2 tail).
 */
export class TaskRegistry {
  /** @purpose Internal map from type name to TaskType definition. */
  protected _types: Map<string, TaskType>;

  /** @purpose Build the registry with all 19 task types from the spec. */
  constructor() {
    this._types = new Map();
    this._populateRegistry();
    logger.debug('[TaskRegistry#constructor] [init → ready]', { count: this._types.size });
  }

  /**
   * @purpose Populate the internal type map with all 19 spec-defined task types.
   * @sideEffect Mutates this._types map.
   */
  protected _populateRegistry(): void {
    this._addType({
      name: 'prepare_env',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.pipeline,
    });
    this._addType({
      name: 'plan',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('prepare_env')],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.pipeline,
    });
    this._addType({
      name: 'enrich',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('plan')],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.pipeline,
    });
    this._addType({
      name: 'gate_coverage',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [allOfRef([globRef('track_*'), globRef('lens_*')])],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.pipeline,
    });
    this._addType({
      name: 'gate_verdict',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('synthesize')],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.pipeline,
    });

    // Pattern types — parametrized by artifact/scope
    this._addType({
      name: 'track_*',
      parallelWith: [globRef('track_*'), globRef('lens_*')],
      exclusiveWith: [],
      dependsOn: [typeRef('enrich')],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.pipeline,
    });
    this._addType({
      name: 'lens_*',
      parallelWith: [globRef('track_*'), globRef('lens_*')],
      exclusiveWith: [],
      dependsOn: [typeRef('enrich')],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.pipeline,
    });

    // Synthesis (requires all track + lens tasks done)
    this._addType({
      name: 'synthesize',
      parallelWith: [],
      exclusiveWith: [typeRef('delta_review')],
      dependsOn: [allOfRef([globRef('track_*'), globRef('lens_*')])],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.pipeline,
    });

    // Event-driven tasks (🦊 priority=50)
    this._addType({
      name: 'delta_review',
      parallelWith: [],
      exclusiveWith: [typeRef('synthesize')],
      dependsOn: [],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.event,
    });
    // delta_review is an executable mini-DAG, not an opaque event marker:
    // prepare → changed range → affected tracks → synthesize → verdict.
    this._addType({
      name: 'delta_prepare',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('delta_review')],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.event,
    });
    this._addType({
      name: 'delta_changeset',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('delta_prepare')],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.event,
    });
    this._addType({
      name: 'delta_tracks',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('delta_changeset')],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.event,
    });
    this._addType({
      name: 'synthesize_delta',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('delta_tracks')],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.event,
    });
    this._addType({
      name: 'gate_verdict_delta',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('synthesize_delta')],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.event,
    });
    this._addType({
      name: 'verify_fix',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.event,
    });
    this._addType({
      name: 'thread_triage',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.event,
    });

    // User-scoped tasks (👤 priority=90)
    this._addType({
      name: 'fact_check',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [externalRef('producer_done')],
      sessionPolicy: 'new_fresh',
      priority: PRIORITY_TIERS.user,
    });
    this._addType({
      name: 'deepen',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [externalRef('producer_done')],
      sessionPolicy: 'reuse_producer',
      priority: PRIORITY_TIERS.user,
    });
    this._addType({
      name: 'widen_search',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'new_fresh',
      priority: PRIORITY_TIERS.user,
    });
    this._addType({
      name: 'mutate_artifact',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'reuse_producer',
      priority: PRIORITY_TIERS.user,
    });

    // Operator chat
    this._addType({
      name: 'chat_question',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [],
      sessionPolicy: 'operator_chat',
      priority: PRIORITY_TIERS.user,
    });

    // Effects — strictly sequential, gated by operator decision
    this._addType({
      name: 'effect_*',
      parallelWith: [],
      exclusiveWith: [ALL_EFFECTS],
      dependsOn: [externalRef('operator_decision')],
      sessionPolicy: 'engine',
      priority: PRIORITY_TIERS.user,
    });

    // Tails — final stages after gate verdict
    this._addType({
      name: 'tail_author',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('gate_verdict')],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.pipeline,
    });
    this._addType({
      name: 'tail_reviewer',
      parallelWith: [],
      exclusiveWith: [],
      dependsOn: [typeRef('gate_verdict')],
      sessionPolicy: 'task',
      priority: PRIORITY_TIERS.pipeline,
    });
  }

  /**
   * @purpose Add a single task type to the internal map.
   * @param type TaskType definition to register.
   */
  protected _addType(type: TaskType): void {
    this._types.set(type.name, type);
  }

  /**
   * @purpose Resolve a task type by its exact name.
   * @param name Type name to look up.
   * @throws {Error} When the type name is not registered.
   * @returns The TaskType definition.
   */
  resolveType(name: string): TaskType {
    // Fan-out nodes are concrete instances (`track_logic`, `lens_security`) while the
    // registry owns their policy as pattern definitions. Resolve the concrete instance
    // through its declared pattern instead of making the runtime invent a second policy.
    const resolved =
      this._types.get(name) ??
      (name.startsWith('track_') ? this._types.get('track_*') : undefined) ??
      (name.startsWith('lens_') ? this._types.get('lens_*') : undefined) ??
      (name.startsWith('effect_') ? this._types.get('effect_*') : undefined);
    if (!resolved) {
      const error = new Error(`[TaskRegistry#resolveType] Unknown task type: ${name}`);
      logger.error(`[TaskRegistry#resolveType] [lookup → not_found] ${name}`, { error });
      throw error;
    }
    return resolved;
  }

  /**
   * @purpose Enumerate all registered task type names.
   * @returns Array of type name strings.
   */
  listTypes(): string[] {
    return [...this._types.keys()];
  }

  /**
   * @purpose Check whether a concrete type name matches a reference.
   * @param ref The reference to match against.
   * @param typeName Concrete type name (may be parametrized, e.g. `track_foo`).
   * @returns True when the type matches the reference.
   */
  matchReference(ref: TaskReference, typeName: string): boolean {
    // #region START_MATCH_REFERENCE — five reference kinds
    switch (ref.kind) {
      case 'type_name':
        return typeName === ref.name;

      case 'glob': {
        const regex = this._globToRegex(ref.pattern);
        return regex.test(typeName);
      }

      case 'all_of':
        return ref.refs.every((inner) => this.matchReference(inner, typeName));

      case 'producer_of':
      case 'external':
        return false;
    }
    // #endregion END_MATCH_REFERENCE
  }

  /**
   * @purpose Evaluate whether a dependency reference is satisfied given the set of completed types and full instance list.
   * @param ref The reference to evaluate.
   * @param completedTypes Set of type names that have at least one done instance.
   * @param instances All task instances in the MR (for producerOf resolution).
   * @returns True when the reference is satisfied.
   */
  evaluateReference(
    ref: TaskReference,
    completedTypes: Set<string>,
    instances: TaskInstance[]
  ): boolean {
    // #region START_RESOLVE_DEPENDENCY_GRAPH — resolve dependency graph for task type references
    switch (ref.kind) {
      case 'type_name': {
        return completedTypes.has(ref.name);
      }

      case 'glob': {
        const regex = this._globToRegex(ref.pattern);
        const matchingInstances = instances.filter(
          (inst) => regex.test(inst.type) && inst.status === 'done'
        );
        return matchingInstances.length > 0;
      }

      case 'all_of': {
        if (ref.filter) {
          const filteredInstances = instances.filter((inst) =>
            this._matchesFilter(inst, ref.filter!)
          );
          return ref.refs.every((inner) =>
            this._evaluateAllOf(inner, new Set(), filteredInstances)
          );
        }
        return ref.refs.every((inner) => this._evaluateAllOf(inner, completedTypes, instances));
      }

      case 'producer_of': {
        return instances.some(
          (inst) => inst.status === 'done' && inst.params.artifact === ref.artifact
        );
      }

      case 'external':
        return false;
    }
    // #endregion END_RESOLVE_DEPENDENCY_GRAPH
  }

  /**
   * @purpose Compute a canonical deduplication key from a task type and its params.
   * @invariant Keys are sorted alphabetically before serialization for deterministic output.
   * @param type Task type name.
   * @param params Task parameters.
   * @returns Canonical dedup key string.
   */
  computeDedupKey(type: string, params: Record<string, unknown>): string {
    const canonical = this._canonicalJson(params);
    return `${type}::${canonical}`;
  }

  /**
   * @purpose Check whether a task type is engine-managed (no session routing needed).
   * @param typeName Task type name.
   * @returns True when sessionPolicy is `engine`.
   */
  isEngineTask(typeName: string): boolean {
    const resolved = this.resolveType(typeName);
    return resolved.sessionPolicy === 'engine';
  }

  /**
   * @purpose Check whether a task type is an effect type (starts with `effect_`).
   * @param typeName Task type name.
   * @returns True when the type is an effect.
   */
  isEffectTask(typeName: string): boolean {
    return typeName.startsWith('effect_');
  }

  /**
   * @purpose Check whether a concrete type name matches any of the given exclusiveWith references.
   * @param typeName Concrete type name to check.
   * @param exclusiveWith References defining which types are exclusive.
   * @returns True when the type matches any exclusive reference.
   */
  isExclusive(typeName: string, exclusiveWith: TaskReference[]): boolean {
    return exclusiveWith.some((ref) => this.matchReference(ref, typeName));
  }

  /**
   * @purpose Evaluate a single reference against a filtered subset of instances (for allOf with filter).
   * @param ref Reference to evaluate.
   * @param instances Filtered subset of task instances.
   * @returns True when the reference is satisfied within this subset.
   */
  protected _evaluateWithFilter(ref: TaskReference, instances: TaskInstance[]): boolean {
    switch (ref.kind) {
      case 'glob': {
        const regex = this._globToRegex(ref.pattern);
        return instances.some((inst) => regex.test(inst.type) && inst.status === 'done');
      }
      case 'all_of':
        return ref.refs.every((inner) => this._evaluateWithFilter(inner, instances));
      case 'type_name':
        return instances.some((inst) => inst.type === ref.name && inst.status === 'done');
      case 'producer_of':
        return instances.some(
          (inst) => inst.status === 'done' && inst.params.artifact === ref.artifact
        );
      case 'external':
        return false;
    }
  }

  /**
   * @purpose Evaluate an aggregate dependency. A glob inside `allOf` means every concrete
   * matching fan-out node is done, whereas a standalone glob remains an existence check.
   * @param ref Nested dependency reference.
   * @param completedTypes Completed task-type names.
   * @param instances Full MR queue.
   * @returns True only when the aggregate's concrete work is complete.
   */
  protected _evaluateAllOf(
    ref: TaskReference,
    completedTypes: Set<string>,
    instances: TaskInstance[]
  ): boolean {
    if (ref.kind === 'glob') {
      const regex = this._globToRegex(ref.pattern);
      const matches = instances.filter((inst) => regex.test(inst.type));
      return matches.length > 0 && matches.every((inst) => inst.status === 'done');
    }
    if (ref.kind === 'all_of') {
      return ref.refs.every((inner) => this._evaluateAllOf(inner, completedTypes, instances));
    }
    return this.evaluateReference(ref, completedTypes, instances);
  }

  /**
   * @purpose Check whether an instance's params match a given filter object.
   * @invariant Every key in the filter must be present and equal in instance params.
   * @param instance Task instance to check.
   * @param filter Key-value conditions that must all match.
   * @returns True when every filter key is present and equal.
   */
  protected _matchesFilter(instance: TaskInstance, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => instance.params[key] === value);
  }

  /**
   * @purpose Convert a glob pattern to a RegExp for matching type names.
   * @invariant Anchored: pattern must match the full string (^...$).
   * @param pattern Glob pattern string (e.g. `track_*`).
   * @returns Compiled RegExp — * matches any sequence, ? matches any single char.
   */
  protected _globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  /**
   * @purpose Serialize params to a canonical JSON string with sorted keys for deterministic output.
   * @param params Parameters object.
   * @returns Canonical JSON string — keys sorted alphabetically.
   */
  protected _canonicalJson(params: Record<string, unknown>): string {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(params).sort()) {
      sorted[key] = params[key];
    }
    return JSON.stringify(sorted);
  }
}
