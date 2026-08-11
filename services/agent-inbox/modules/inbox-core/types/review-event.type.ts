// @file: Versioned canonical review event accepted by the inbox-core journal boundary.
// @consumers: ReviewState, JournalPort, inbox-vcs
// @tasks: TSK-173, TSK-174

/** @purpose Closed canonical review-event discriminator vocabulary. */
export type ReviewEventKind =
  | 'mr_observed'
  | 'commit_pushed'
  | 'description_changed'
  | 'discussion_changed'
  | 'approval_changed'
  | 'pipeline_changed'
  | 'lifecycle_completed'
  | 'verification_requested'
  | 'verification_started'
  | 'verification_applied'
  | 'verification_failed';

/** @purpose Actor identity attached to each canonical review fact. */
export type ReviewEventActor = {
  /** @purpose Closed actor category. */
  kind: 'human' | 'bot' | 'system';
  /** @purpose Stable provider or system actor identity. */
  id: string;
};

/** @purpose Canonical provider-independent merge-request identity. */
export type ReviewMrReference = {
  /** @purpose Canonical project path. */
  project: string;
  /** @purpose Merge-request internal ID. */
  iid: string;
};

const EVENT_KINDS = new Set<ReviewEventKind>([
  'mr_observed',
  'commit_pushed',
  'description_changed',
  'discussion_changed',
  'approval_changed',
  'pipeline_changed',
  'lifecycle_completed',
  'verification_requested',
  'verification_started',
  'verification_applied',
  'verification_failed',
]);

/** @purpose Determine whether an unknown boundary value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @purpose Reject a boundary value that is not a non-empty string. */
function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[ReviewEvent.validate] ${field} must be a non-empty string`);
  }
}

/** @purpose Validate kind-specific payload without accepting unversioned variants. */
function validatePayload(kind: ReviewEventKind, payload: Record<string, unknown>): void {
  // #region START_VALIDATE_KIND_PAYLOAD_CONTRACT
  switch (kind) {
    case 'mr_observed': {
      if (!['open', 'merged', 'closed'].includes(String(payload.state))) {
        throw new Error('[ReviewEvent.validate] mr_observed state is invalid');
      }
      if (!isRecord(payload.participation)) {
        throw new Error('[ReviewEvent.validate] mr_observed participation is required');
      }
      for (const signal of [
        'author',
        'reviewer',
        'assignee',
        'mentioned',
        'commented',
        'approved',
      ]) {
        if (typeof payload.participation[signal] !== 'boolean') {
          throw new Error(`[ReviewEvent.validate] participation.${signal} must be boolean`);
        }
      }
      if (payload.baseSha !== undefined) requireString(payload.baseSha, 'payload.baseSha');
      if (payload.headSha !== undefined) requireString(payload.headSha, 'payload.headSha');
      return;
    }
    case 'commit_pushed':
      requireString(payload.sha, 'payload.sha');
      requireString(payload.headSha, 'payload.headSha');
      if (payload.baseSha !== undefined) requireString(payload.baseSha, 'payload.baseSha');
      return;
    case 'description_changed':
      requireString(payload.revision, 'payload.revision');
      return;
    case 'discussion_changed':
      requireString(payload.discussionId, 'payload.discussionId');
      if (typeof payload.humanReply !== 'boolean') {
        throw new Error('[ReviewEvent.validate] payload.humanReply must be boolean');
      }
      return;
    case 'approval_changed':
      requireString(payload.userId, 'payload.userId');
      if (typeof payload.approved !== 'boolean') {
        throw new Error('[ReviewEvent.validate] payload.approved must be boolean');
      }
      return;
    case 'pipeline_changed':
      if (payload.status !== null) requireString(payload.status, 'payload.status');
      return;
    case 'verification_requested':
      if (payload.mode !== 'manual' && payload.mode !== 'timer') {
        throw new Error('[ReviewEvent.validate] verification request mode is invalid');
      }
      return;
    case 'verification_started':
      requireString(payload.batchLastEventId, 'payload.batchLastEventId');
      return;
    case 'verification_applied':
      requireString(payload.batchLastEventId, 'payload.batchLastEventId');
      requireString(payload.baseSha, 'payload.baseSha');
      requireString(payload.headSha, 'payload.headSha');
      return;
    case 'verification_failed':
      requireString(payload.batchLastEventId, 'payload.batchLastEventId');
      requireString(payload.reason, 'payload.reason');
      return;
    case 'lifecycle_completed':
      return;
  }
  // #endregion END_VALIDATE_KIND_PAYLOAD_CONTRACT
}

/**
 * @purpose Immutable versioned fact that changes one canonical local MR model.
 * @invariant Only version 1 and the closed event-kind vocabulary cross the journal boundary.
 */
export class ReviewEvent {
  /** @purpose Current event schema version. */
  readonly version: 1;
  /** @purpose Stable producer-assigned event identity. */
  readonly id: string;
  /** @purpose Canonical project and merge-request identity. */
  readonly mr: ReviewMrReference;
  /** @purpose Closed event discriminator. */
  readonly kind: ReviewEventKind;
  /** @purpose Attributed event producer. */
  readonly actor: ReviewEventActor;
  /** @purpose ISO timestamp supplied by the observation source. */
  readonly occurredAt: string;
  /** @purpose Validated kind-specific event body. */
  readonly payload: Readonly<Record<string, unknown>>;

  /**
   * @purpose Materialize one already validated immutable canonical event.
   * @param input Complete version-1 event envelope.
   */
  protected constructor(input: {
    version: 1;
    id: string;
    mr: ReviewMrReference;
    kind: ReviewEventKind;
    actor: ReviewEventActor;
    occurredAt: string;
    payload: Record<string, unknown>;
  }) {
    this.version = input.version;
    this.id = input.id;
    this.mr = Object.freeze({ ...input.mr });
    this.kind = input.kind;
    this.actor = Object.freeze({ ...input.actor });
    this.occurredAt = input.occurredAt;
    this.payload = Object.freeze({ ...input.payload });
  }

  /**
   * @purpose Validate and materialize one event at the canonical journal boundary.
   * @param input Untrusted serialized event candidate.
   * @throws {Error} On unknown version/kind or malformed envelope/payload.
   * @returns Immutable canonical event safe for fold and append.
   */
  static validate(input: unknown): ReviewEvent {
    if (!isRecord(input)) {
      throw new Error('[ReviewEvent.validate] Event must be an object');
    }
    if (input.version !== 1) {
      throw new Error(`[ReviewEvent.validate] Unsupported version: ${String(input.version)}`);
    }
    requireString(input.id, 'id');
    requireString(input.occurredAt, 'occurredAt');
    if (Number.isNaN(Date.parse(input.occurredAt))) {
      throw new Error('[ReviewEvent.validate] occurredAt must be an ISO timestamp');
    }
    if (!isRecord(input.mr)) {
      throw new Error('[ReviewEvent.validate] mr reference is required');
    }
    requireString(input.mr.project, 'mr.project');
    requireString(input.mr.iid, 'mr.iid');
    if (!EVENT_KINDS.has(input.kind as ReviewEventKind)) {
      throw new Error(`[ReviewEvent.validate] Unsupported kind: ${String(input.kind)}`);
    }
    if (!isRecord(input.actor)) {
      throw new Error('[ReviewEvent.validate] actor is required');
    }
    if (!['human', 'bot', 'system'].includes(String(input.actor.kind))) {
      throw new Error('[ReviewEvent.validate] actor.kind is invalid');
    }
    requireString(input.actor.id, 'actor.id');
    if (!isRecord(input.payload)) {
      throw new Error('[ReviewEvent.validate] payload must be an object');
    }

    const kind = input.kind as ReviewEventKind;
    validatePayload(kind, input.payload);
    return new ReviewEvent({
      version: 1,
      id: input.id,
      mr: { project: input.mr.project, iid: input.mr.iid },
      kind,
      actor: { kind: input.actor.kind as ReviewEventActor['kind'], id: input.actor.id },
      occurredAt: input.occurredAt,
      payload: input.payload,
    });
  }

  /**
   * @purpose Identify the stable per-MR journal and projection key.
   * @returns Canonical project!iid identity.
   */
  identifyMr(): string {
    return `${this.mr.project}!${this.mr.iid}`;
  }

  /**
   * @purpose Distinguish observed MR activity from local lifecycle and verification control facts.
   * @returns Whether the event refreshes activity and accumulates into the change batch.
   */
  changesObservedMr(): boolean {
    return [
      'mr_observed',
      'commit_pushed',
      'description_changed',
      'discussion_changed',
      'approval_changed',
      'pipeline_changed',
    ].includes(this.kind);
  }

  /**
   * @purpose Expose the stable serialized event shape written to JSONL.
   * @returns Versioned immutable event envelope without journal sequence metadata.
   */
  toJSON(): Record<string, unknown> {
    return {
      version: this.version,
      id: this.id,
      mr: this.mr,
      kind: this.kind,
      actor: this.actor,
      occurredAt: this.occurredAt,
      payload: this.payload,
    };
  }
}
