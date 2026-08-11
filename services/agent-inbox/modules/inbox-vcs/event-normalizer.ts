// @file: VcsEventNormalizer — deterministic complete-snapshot delta to canonical ReviewEvent facts.
// @consumers: VcsSyncCoordinator
// @tasks: TSK-174

import { createHash } from 'node:crypto';
import { ReviewEvent, type ReviewEventKind } from '../inbox-core/types/review-event.type.ts';
import type { VcsDiscussion, VcsDiscussionNote, VcsSnapshot } from './vcs-port.ts';

/** @purpose Normalization decision controlling journal append and cursor advancement. */
export type VcsNormalizationResult = {
  /** @purpose Canonical events ordered by provider observation semantics */
  events: ReviewEvent[];
  /** @purpose Whether caller may persist the new cursor */
  cursorAdvance: boolean;
  /** @purpose Whether caller must request a full refresh before effects */
  refreshRequired: boolean;
  /** @purpose Machine-readable completeness or delta evidence */
  evidence: string;
};

/** @purpose Produce a stable compact digest for event identities and revisions. */
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);
}

/** @purpose Compare inclusive participation without relying on property insertion order. */
function participationKey(snapshot: VcsSnapshot): string {
  const participation = snapshot.participation;
  return [
    participation.author,
    participation.reviewer,
    participation.assignee,
    participation.mentioned,
    participation.commented,
    participation.approved,
  ].join(':');
}

/**
 * @purpose Convert complete GitLab observations into the canonical TSK-173 event vocabulary.
 * @invariant Partial observations emit no fine-grained facts and never authorize cursor advancement.
 * @invariant Delta order is commits, description, discussions, approvals, pipeline, aggregate MR observation.
 */
export class VcsEventNormalizer {
  /**
   * @purpose Calculate every supported mutation between two immutable observations.
   * @param previous Previous complete observation, absent for initial discovery.
   * @param current New provider observation.
   * @returns Ordered canonical events plus refresh/cursor decision.
   */
  normalize(previous: VcsSnapshot | undefined, current: VcsSnapshot): VcsNormalizationResult {
    const incomplete = Object.entries(current.completeness)
      .filter(([, complete]) => !complete)
      .map(([field]) => field);
    if (incomplete.length > 0 || !current.cursor) {
      return {
        events: [],
        cursorAdvance: false,
        refreshRequired: true,
        evidence: `incomplete:${incomplete.join(',') || 'cursor'}`,
      };
    }

    if (!previous) {
      return {
        events: [this._composeMrObservation(current, 'initial')],
        cursorAdvance: true,
        refreshRequired: false,
        evidence: 'initial-complete-observation',
      };
    }

    const events: ReviewEvent[] = [];
    // #region START_NORMALIZE_COMPLETE_SUPPORTED_DELTA
    if (previous.headSha !== current.headSha) {
      const commits = current.commits.length > 0 ? current.commits : [current.headSha];
      for (const sha of commits) {
        events.push(
          this._composeEvent(current, 'commit_pushed', `commit:${sha}`, {
            sha,
            baseSha: previous.headSha,
            headSha: current.headSha,
          })
        );
      }
    }

    if (previous.description !== current.description) {
      events.push(
        this._composeEvent(current, 'description_changed', 'description', {
          revision: digest(current.description),
        })
      );
    }

    events.push(...this._normalizeDiscussions(previous, current));
    events.push(...this._normalizeApprovals(previous, current));

    if (previous.pipelineStatus !== current.pipelineStatus) {
      events.push(
        this._composeEvent(current, 'pipeline_changed', 'pipeline', {
          status: current.pipelineStatus,
          previousStatus: previous.pipelineStatus,
        })
      );
    }

    if (
      previous.state !== current.state ||
      participationKey(previous) !== participationKey(current) ||
      previous.reviewerState !== current.reviewerState
    ) {
      events.push(this._composeMrObservation(current, 'aggregate'));
    }
    // #endregion END_NORMALIZE_COMPLETE_SUPPORTED_DELTA

    return {
      events,
      cursorAdvance: true,
      refreshRequired: false,
      evidence: events.length > 0 ? `delta:${events.length}` : 'complete-no-change',
    };
  }

  /**
   * @purpose Normalize discussion creation, note edit/reply, and resolve/reopen changes.
   * @param previous Previous complete observation.
   * @param current Current complete observation.
   * @returns Discussion events in discussion/note order from the current snapshot.
   */
  protected _normalizeDiscussions(previous: VcsSnapshot, current: VcsSnapshot): ReviewEvent[] {
    const events: ReviewEvent[] = [];
    const previousDiscussions = new Map(previous.discussions.map((item) => [item.id, item]));
    for (const discussion of current.discussions) {
      const prior = previousDiscussions.get(discussion.id);
      if (!prior) {
        const first = discussion.notes[0];
        events.push(
          this._composeDiscussionEvent(current, discussion, first, 'created', first?.id ?? 'thread')
        );
        continue;
      }

      const priorNotes = new Map(prior.notes.map((note) => [note.id, note]));
      for (const note of discussion.notes) {
        const priorNote = priorNotes.get(note.id);
        if (!priorNote) {
          events.push(this._composeDiscussionEvent(current, discussion, note, 'replied', note.id));
        } else if (this._noteChanged(priorNote, note)) {
          events.push(this._composeDiscussionEvent(current, discussion, note, 'edited', note.id));
        }
      }
      if (prior.resolved !== discussion.resolved) {
        events.push(
          this._composeDiscussionEvent(
            current,
            discussion,
            discussion.notes.at(-1),
            discussion.resolved ? 'resolved' : 'reopened',
            'resolution'
          )
        );
      }
    }
    return events;
  }

  /**
   * @purpose Determine whether provider-visible note content or edit time changed.
   * @param previous Previously observed note.
   * @param current Current provider note.
   * @returns Whether content or edit timestamp differs.
   */
  protected _noteChanged(previous: VcsDiscussionNote, current: VcsDiscussionNote): boolean {
    return previous.body !== current.body || previous.updatedAt !== current.updatedAt;
  }

  /**
   * @purpose Normalize added and removed approvals without collapsing distinct users.
   * @param previous Previous complete observation.
   * @param current Current complete observation.
   * @returns One canonical approval event per changed user.
   */
  protected _normalizeApprovals(previous: VcsSnapshot, current: VcsSnapshot): ReviewEvent[] {
    const events: ReviewEvent[] = [];
    const before = new Set(previous.approvedBy);
    const after = new Set(current.approvedBy);
    for (const userId of current.approvedBy) {
      if (!before.has(userId)) {
        events.push(
          this._composeEvent(current, 'approval_changed', `approval:${userId}:on`, {
            userId,
            approved: true,
          })
        );
      }
    }
    for (const userId of previous.approvedBy) {
      if (!after.has(userId)) {
        events.push(
          this._composeEvent(current, 'approval_changed', `approval:${userId}:off`, {
            userId,
            approved: false,
          })
        );
      }
    }
    return events;
  }

  /**
   * @purpose Compose one canonical discussion event with human-reply semantics.
   * @param snapshot Current complete observation.
   * @param discussion Changed discussion.
   * @param note Note responsible for the change when present.
   * @param change Closed discussion change discriminator.
   * @param key Stable event identity suffix.
   * @returns Validated canonical discussion event.
   */
  protected _composeDiscussionEvent(
    snapshot: VcsSnapshot,
    discussion: VcsDiscussion,
    note: VcsDiscussionNote | undefined,
    change: 'created' | 'replied' | 'edited' | 'resolved' | 'reopened',
    key: string
  ): ReviewEvent {
    return this._composeEvent(
      snapshot,
      'discussion_changed',
      `discussion:${discussion.id}:${key}:${change}`,
      {
        discussionId: discussion.id,
        noteId: note?.id,
        change,
        humanReply: Boolean(note && !note.system),
        resolved: discussion.resolved,
      },
      note && !note.system ? { kind: 'human', id: note.author || 'unknown-user' } : undefined
    );
  }

  /**
   * @purpose Compose the aggregate state and inclusive-participation observation.
   * @param snapshot Current complete observation.
   * @param key Stable event identity suffix.
   * @returns Validated aggregate MR observation.
   */
  protected _composeMrObservation(snapshot: VcsSnapshot, key: string): ReviewEvent {
    return this._composeEvent(snapshot, 'mr_observed', `mr:${key}`, {
      state: snapshot.state,
      participation: snapshot.participation,
      headSha: snapshot.headSha,
      descriptionRevision: digest(snapshot.description),
      reviewerState: snapshot.reviewerState,
    });
  }

  /**
   * @purpose Compose a stable canonical event bound to the new provider cursor.
   * @param snapshot Current complete observation.
   * @param kind Canonical event discriminator.
   * @param key Stable event identity suffix.
   * @param payload Canonical event facts.
   * @param [actor] Provider actor, defaulting to the sync system.
   * @returns Validated canonical review event.
   */
  protected _composeEvent(
    snapshot: VcsSnapshot,
    kind: ReviewEventKind,
    key: string,
    payload: Record<string, unknown>,
    actor: { kind: 'human' | 'bot' | 'system'; id: string } = {
      kind: 'system',
      id: 'gitlab-sync',
    }
  ): ReviewEvent {
    return ReviewEvent.validate({
      version: 1,
      id: `vcs-${digest([snapshot.project, snapshot.iid, snapshot.cursor, kind, key])}`,
      mr: { project: snapshot.project, iid: snapshot.iid },
      kind,
      actor,
      occurredAt: snapshot.observedAt,
      payload,
    });
  }
}
