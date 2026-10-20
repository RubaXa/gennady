// @file: Deterministic VcsPort test adapter and immutable snapshot builders for TSK-174 contracts.
// @consumers: inbox-vcs TSK-174 tests
// @tasks: TSK-174

import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import {
  VcsPort,
  type CompareResult,
  type DiscussionsPage,
  type MrDetail,
  type VcsCapabilities,
  type VcsEffectKind,
  type VcsSnapshot,
} from '../vcs-port.ts';

/** @purpose Compose a complete deterministic provider observation. */
export function createVcsSnapshot(overrides: Partial<VcsSnapshot> = {}): VcsSnapshot {
  return {
    project: 'group/project',
    iid: '42',
    webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
    state: 'open',
    observedAt: '2026-08-10T12:00:00.000Z',
    cursor: 'cursor-1',
    headSha: 'sha-1',
    commits: [],
    description: 'Initial description',
    participation: {
      author: false,
      reviewer: true,
      assignee: false,
      mentioned: false,
      commented: false,
      approved: false,
    },
    discussions: [],
    approvedBy: [],
    reviewerState: 'unreviewed',
    pipelineStatus: 'running',
    completeness: {
      detail: true,
      discussions: true,
      approvals: true,
      commits: true,
      pipeline: true,
    },
    ...overrides,
  };
}

/** @purpose Compose one actionable discovery candidate from independent participation facts. */
export function createActionableMr(
  iid: string,
  participation: NonNullable<VcsActionableMr['participation']>,
  overrides: Partial<VcsActionableMr> = {}
): VcsActionableMr {
  return {
    iid,
    project: 'group/project',
    webUrl: `https://gitlab.example.com/group/project/-/merge_requests/${iid}`,
    title: `MR ${iid}`,
    description: '',
    author: 'author',
    reviewers: [],
    approvedBy: [],
    updatedAt: '2026-08-10T12:00:00.000Z',
    draft: false,
    state: 'opened',
    role: participation.author ? 'author' : participation.reviewer ? 'reviewer' : 'mentioned',
    events: [],
    directlyAddressed: participation.mentioned,
    participation,
    todoIds: [],
    headSha: 'sha-1',
    ...overrides,
  };
}

/**
 * @purpose Deterministic adapter implementing the exact same unified read/effect surface as GitLab.
 * @implements {VcsPort} in ../vcs-port.ts
 */
export class MemoryVcsPort extends VcsPort {
  /** @purpose Current provider observation mutated by effect methods. */
  snapshot: VcsSnapshot = createVcsSnapshot();
  /** @purpose Optional queued read results/errors for recovery scenarios. */
  reads: Array<VcsSnapshot | Error> = [];
  /** @purpose Inclusive discovery candidates. */
  inbox: VcsActionableMr[] = [];
  /** @purpose Native provider capability result. */
  capabilities: VcsCapabilities = { requestChanges: true, evidence: 'memory-native' };
  /** @purpose Ordered mutation attempts for deny-before-I/O and exactly-once assertions. */
  mutationCalls: VcsEffectKind[] = [];
  /** @purpose Effect whose first mutation applies then loses its transport response. */
  ambiguousAfterApply: VcsEffectKind | null = null;

  /** @see {VcsPort#getCurrentUserLogin} in ../vcs-port.ts */
  async getCurrentUserLogin(): Promise<string> {
    return 'operator';
  }

  /** @see {VcsPort#getInbox} in ../vcs-port.ts */
  async getInbox(): Promise<VcsActionableMr[]> {
    return [...this.inbox];
  }

  /** @see {VcsPort#getMrDetail} in ../vcs-port.ts */
  async getMrDetail(): Promise<MrDetail> {
    return {
      project: this.snapshot.project,
      iid: this.snapshot.iid,
      webUrl: this.snapshot.webUrl,
      title: 'Memory MR',
      description: this.snapshot.description,
      author: this.snapshot.participation.author ? 'operator' : 'author',
      reviewers: this.snapshot.participation.reviewer ? ['operator'] : [],
      assignees: this.snapshot.participation.assignee ? ['operator'] : [],
      approvedBy: [...this.snapshot.approvedBy],
      updatedAt: this.snapshot.observedAt,
      state: this.snapshot.state === 'open' ? 'opened' : this.snapshot.state,
      headSha: this.snapshot.headSha,
      pipelineStatus: this.snapshot.pipelineStatus,
      userNotesCount: this.snapshot.discussions.length,
      draft: false,
      reviewerState: this.snapshot.reviewerState,
    };
  }

  /** @see {VcsPort#getDiscussions} in ../vcs-port.ts */
  async getDiscussions(): Promise<DiscussionsPage> {
    return {
      discussions: this.snapshot.discussions,
      pageInfo: { hasNextPage: false, endCursor: null },
    };
  }

  /** @see {VcsPort#compareSha} in ../vcs-port.ts */
  async compareSha(): Promise<CompareResult> {
    return {
      commits: [...this.snapshot.commits],
      complete: this.snapshot.completeness.commits,
      evidence: this.snapshot.completeness.commits ? 'memory-complete' : 'memory-incomplete',
    };
  }

  /** @see {VcsPort#readSnapshot} in ../vcs-port.ts */
  override async readSnapshot(): Promise<VcsSnapshot> {
    const queued = this.reads.shift();
    if (queued instanceof Error) throw queued;
    if (queued) this.snapshot = queued;
    return this.snapshot;
  }

  /** @see {VcsPort#probeCapabilities} in ../vcs-port.ts */
  override async probeCapabilities(): Promise<VcsCapabilities> {
    return this.capabilities;
  }

  /** @see {VcsPort#postNote} in ../vcs-port.ts */
  async postNote(
    _project: string,
    _iid: string,
    body: string,
    discussionId?: string
  ): Promise<void> {
    this.snapshot = createVcsSnapshot({
      ...this.snapshot,
      discussions: this.snapshot.discussions.map((discussion) =>
        discussion.id === discussionId
          ? {
              ...discussion,
              notes: [
                ...discussion.notes,
                {
                  id: `note-${discussion.notes.length + 1}`,
                  author: 'operator',
                  body,
                  createdAt: this.snapshot.observedAt,
                  system: false,
                },
              ],
            }
          : discussion
      ),
    });
    this._completeMutation('reply');
  }

  /** @see {VcsPort#postDiscussion} in ../vcs-port.ts */
  async postDiscussion(_project: string, _iid: string, body: string): Promise<void> {
    this.snapshot = createVcsSnapshot({
      ...this.snapshot,
      discussions: [
        ...this.snapshot.discussions,
        {
          id: `discussion-${this.snapshot.discussions.length + 1}`,
          resolved: false,
          notes: [
            {
              id: `note-${this.snapshot.discussions.length + 1}`,
              author: 'operator',
              body,
              createdAt: this.snapshot.observedAt,
              system: false,
            },
          ],
        },
      ],
    });
    this._completeMutation('comment');
  }

  /** @see {VcsPort#react} in ../vcs-port.ts */
  async react(_project: string, _iid: string, noteId: string, emoji: string): Promise<void> {
    this.snapshot = createVcsSnapshot({
      ...this.snapshot,
      discussions: this.snapshot.discussions.map((discussion) => ({
        ...discussion,
        notes: discussion.notes.map((note) =>
          note.id === noteId ? { ...note, reactions: [emoji] } : note
        ),
      })),
    });
    this._completeMutation('react');
  }

  /** @see {VcsPort#resolve} in ../vcs-port.ts */
  async resolve(_project: string, _iid: string, discussionId: string): Promise<void> {
    this._setResolution('resolve', discussionId, true);
  }

  /** @see {VcsPort#reopen} in ../vcs-port.ts */
  override async reopen(_project: string, _iid: string, discussionId: string): Promise<void> {
    this._setResolution('reopen', discussionId, false);
  }

  /** @see {VcsPort#approve} in ../vcs-port.ts */
  async approve(): Promise<void> {
    this.snapshot = createVcsSnapshot({
      ...this.snapshot,
      approvedBy: ['operator'],
      reviewerState: 'approved',
    });
    this._completeMutation('approve');
  }

  /** @see {VcsPort#unapprove} in ../vcs-port.ts */
  override async unapprove(): Promise<void> {
    this.snapshot = createVcsSnapshot({
      ...this.snapshot,
      approvedBy: [],
      reviewerState: 'unapproved',
    });
    this._completeMutation('unapprove');
  }

  /** @see {VcsPort#requestChanges} in ../vcs-port.ts */
  override async requestChanges(): Promise<void> {
    this.snapshot = createVcsSnapshot({ ...this.snapshot, reviewerState: 'requested_changes' });
    this._completeMutation('request_changes');
  }

  /** @see {VcsPort#editDescription} in ../vcs-port.ts */
  async editDescription(_project: string, _iid: string, description: string): Promise<void> {
    this.snapshot = createVcsSnapshot({ ...this.snapshot, description });
    this._completeMutation('edit_description');
  }

  /** @see {VcsPort#getHost} in ../vcs-port.ts */
  getHost(): string {
    return 'gitlab.example.com';
  }

  /** @purpose Apply one resolution mutation to the provider snapshot. */
  protected _setResolution(
    kind: 'resolve' | 'reopen',
    discussionId: string,
    resolved: boolean
  ): void {
    this.snapshot = createVcsSnapshot({
      ...this.snapshot,
      discussions: this.snapshot.discussions.map((discussion) =>
        discussion.id === discussionId ? { ...discussion, resolved } : discussion
      ),
    });
    this._completeMutation(kind);
  }

  /** @purpose Record one mutation and optionally simulate response loss after provider application. */
  protected _completeMutation(kind: VcsEffectKind): void {
    this.mutationCalls.push(kind);
    if (this.ambiguousAfterApply === kind) {
      this.ambiguousAfterApply = null;
      const error = new Error('socket hang up') as Error & { ambiguous?: boolean };
      error.ambiguous = true;
      throw error;
    }
  }
}
