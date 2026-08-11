// @file: MockVcsAdapter — scripted deterministic VCS adapter implementing the full VcsPort read/effect surface.
// @consumers: ReviewScenario, inbox-mocks test suite
// @tasks: TSK-180

import type { VcsActionableMr } from '../../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import {
  VcsPort,
  type MrDetail,
  type DiscussionsPage,
  type CompareResult,
  type VcsCapabilities,
  type VcsReviewerState,
  type VcsEffectKind,
} from '../../inbox-vcs/vcs-port.ts';

/** @purpose One scripted effect outcome — success by default unless the scenario scripts a failure. */
export type ScriptedEffectOutcome = { ok: true } | { ok: false; error: string };

/** @purpose One recorded VCS effect call with its kind and arguments. */
export type RecordedVcsEffect = {
  /** @purpose Effect kind executed */
  kind: VcsEffectKind;
  /** @purpose Canonical project path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose Kind-specific string payload (body / discussionId / noteId / emoji / description) */
  payload: Record<string, string>;
};

/** @purpose Seeded read state for one project!iid pair. */
export type MockVcsEntry = {
  /** @purpose Normalized MR detail returned by getMrDetail */
  detail: MrDetail;
  /** @purpose Paginated discussions; first page at index 0, subsequent pages follow */
  discussionPages: DiscussionsPage[];
  /** @purpose Scripted compare result for from→to SHA pairs; keyed by "${from}:${to}" */
  compareResults?: Map<string, CompareResult>;
  /** @purpose Scripted native reviewer state */
  reviewerState?: VcsReviewerState;
};

/** @purpose Options for scripting effect failure branches. */
export type MockVcsEffectScript = {
  /** @purpose Effect key matching "<kind>:<project>!<iid>" — absent key succeeds by default */
  [key: string]: ScriptedEffectOutcome;
};

/**
 * @purpose Scripted deterministic VCS adapter for isolated scenario tests.
 * @implements {VcsPort} in ../../inbox-vcs/vcs-port.ts
 * @invariant Unseeded reads fail loudly — no fallback, no invented data.
 * @invariant Effect calls are recorded in call order; scripted failures allow failure-branch testing.
 * @invariant No network or production filesystem access.
 */
export class MockVcsAdapter extends VcsPort {
  /** @purpose Authenticated operator login returned by getCurrentUserLogin. */
  protected _login: string;
  /** @purpose Seeded actionable MRs returned by getInbox. */
  protected _inbox: VcsActionableMr[];
  /** @purpose Seeded entries keyed by "project!iid". */
  protected _entries: Map<string, MockVcsEntry>;
  /** @purpose Scripted effect outcomes keyed by "kind:project!iid". */
  protected _effectScript: MockVcsEffectScript;
  /** @purpose All effect calls recorded in invocation order. */
  protected _recordedEffects: RecordedVcsEffect[];

  /**
   * @purpose Create an empty mock — call seed() before any read operation.
   * @param [login] Operator login returned by getCurrentUserLogin; defaults to 'mock-operator'.
   */
  constructor(login = 'mock-operator') {
    super();
    this._login = login;
    this._inbox = [];
    this._entries = new Map();
    this._effectScript = {};
    this._recordedEffects = [];
  }

  /**
   * @purpose Pre-load all seeded state for one test scenario.
   * @param inbox Actionable MRs for getInbox.
   * @param entries Keyed detail/discussion/compare state per MR.
   * @param [effectScript] Optional scripted effect outcomes; absent key succeeds.
   * @sideEffect Replaces all previously seeded state.
   */
  seed(
    inbox: VcsActionableMr[],
    entries: Record<string, MockVcsEntry>,
    effectScript: MockVcsEffectScript = {}
  ): void {
    this._inbox = [...inbox];
    this._entries = new Map(Object.entries(entries));
    this._effectScript = effectScript;
    this._recordedEffects = [];
  }

  /**
   * @purpose Retrieve all recorded effect calls since the last seed.
   * @returns Effect calls in invocation order.
   */
  recordedEffects(): RecordedVcsEffect[] {
    return [...this._recordedEffects];
  }

  /**
   * @returns The login pre-configured at construction time.
   * @see {VcsPort#getCurrentUserLogin} in ../../inbox-vcs/vcs-port.ts
   */
  async getCurrentUserLogin(): Promise<string> {
    return this._login;
  }

  /**
   * @returns Shallow copy of the seeded actionable MR list.
   * @see {VcsPort#getInbox} in ../../inbox-vcs/vcs-port.ts
   */
  async getInbox(): Promise<VcsActionableMr[]> {
    return [...this._inbox];
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @throws {Error} When the MR was not seeded — unseeded read fails the scenario.
   * @returns Seeded MR detail for the given project!iid.
   * @see {VcsPort#getMrDetail} in ../../inbox-vcs/vcs-port.ts
   */
  async getMrDetail(project: string, iid: string): Promise<MrDetail> {
    const entry = this._entries.get(`${project}!${iid}`);
    if (!entry) {
      throw new Error(
        `[MockVcsAdapter#getMrDetail] Unseeded MR: ${project}!${iid} — seed before reading`
      );
    }
    return { ...entry.detail };
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param [cursor] Page cursor; absent or null returns page 0.
   * @throws {Error} When the MR was not seeded.
   * @returns Seeded discussions page or empty closed page for unseeded page index.
   * @see {VcsPort#getDiscussions} in ../../inbox-vcs/vcs-port.ts
   */
  async getDiscussions(
    project: string,
    iid: string,
    cursor?: string | null
  ): Promise<DiscussionsPage> {
    const entry = this._entries.get(`${project}!${iid}`);
    if (!entry) {
      throw new Error(
        `[MockVcsAdapter#getDiscussions] Unseeded MR: ${project}!${iid} — seed before reading`
      );
    }
    const pageIndex = cursor ? Number(cursor) : 0;
    const page = entry.discussionPages[pageIndex];
    if (!page) {
      // invariant: no discussions seeded for this page → return an empty closed page
      return { discussions: [], pageInfo: { hasNextPage: false, endCursor: null } };
    }
    return page;
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param from Base SHA to compare from.
   * @param to Head SHA to compare to.
   * @throws {Error} When the MR was not seeded.
   * @returns Seeded compare result or empty result when not scripted.
   * @see {VcsPort#compareSha} in ../../inbox-vcs/vcs-port.ts
   */
  async compareSha(project: string, iid: string, from: string, to: string): Promise<CompareResult> {
    const entry = this._entries.get(`${project}!${iid}`);
    if (!entry) {
      throw new Error(
        `[MockVcsAdapter#compareSha] Unseeded MR: ${project}!${iid} — seed before reading`
      );
    }
    const result = entry.compareResults?.get(`${from}:${to}`);
    if (!result) {
      return { commits: [], complete: true, evidence: 'mock-no-new-commits' };
    }
    return result;
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @returns Seeded reviewer state or 'unknown' when not scripted.
   * @see {VcsPort#readReviewerState} in ../../inbox-vcs/vcs-port.ts
   */
  override async readReviewerState(project: string, iid: string): Promise<VcsReviewerState> {
    return this._entries.get(`${project}!${iid}`)?.reviewerState ?? 'unknown';
  }

  /**
   * @returns Fixed mock capabilities with requestChanges enabled.
   * @see {VcsPort#probeCapabilities} in ../../inbox-vcs/vcs-port.ts
   */
  override async probeCapabilities(): Promise<VcsCapabilities> {
    return { requestChanges: true, evidence: 'mock-capabilities' };
  }

  /**
   * @purpose Return empty host string — mock has no production host.
   * @returns Empty string.
   */
  getHost(): string {
    return '';
  }

  /**
   * @purpose Record one effect call and apply any scripted failure for the given key.
   * @param kind VCS effect kind.
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param [payload] Kind-specific string payload; defaults to empty object.
   * @throws {Error} When the scenario scripted a failure for this kind:project!iid key.
   */
  protected _applyEffect(
    kind: VcsEffectKind,
    project: string,
    iid: string,
    payload: Record<string, string> = {}
  ): void {
    this._recordedEffects.push({ kind, project, iid, payload });
    const script = this._effectScript[`${kind}:${project}!${iid}`];
    if (script && !script.ok) {
      throw new Error(
        `[MockVcsAdapter#${kind}] Scripted failure for ${project}!${iid}: ${script.error}`
      );
    }
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param body Note body text.
   * @param [discussionId] Thread ID for a reply; absent posts a top-level note.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#postNote} in ../../inbox-vcs/vcs-port.ts
   */
  async postNote(project: string, iid: string, body: string, discussionId?: string): Promise<void> {
    const kind: VcsEffectKind = discussionId ? 'reply' : 'comment';
    this._applyEffect(kind, project, iid, { body, ...(discussionId ? { discussionId } : {}) });
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param body Discussion body text.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#postDiscussion} in ../../inbox-vcs/vcs-port.ts
   */
  async postDiscussion(project: string, iid: string, body: string): Promise<void> {
    this._applyEffect('comment', project, iid, { body });
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param noteId Note to react to.
   * @param emoji Emoji name for the reaction.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#react} in ../../inbox-vcs/vcs-port.ts
   */
  async react(project: string, iid: string, noteId: string, emoji: string): Promise<void> {
    this._applyEffect('react', project, iid, { noteId, emoji });
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param discussionId Discussion thread to resolve.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#resolve} in ../../inbox-vcs/vcs-port.ts
   */
  async resolve(project: string, iid: string, discussionId: string): Promise<void> {
    this._applyEffect('resolve', project, iid, { discussionId });
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param discussionId Discussion thread to reopen.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#reopen} in ../../inbox-vcs/vcs-port.ts
   */
  override async reopen(project: string, iid: string, discussionId: string): Promise<void> {
    this._applyEffect('reopen', project, iid, { discussionId });
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#approve} in ../../inbox-vcs/vcs-port.ts
   */
  async approve(project: string, iid: string): Promise<void> {
    this._applyEffect('approve', project, iid);
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#unapprove} in ../../inbox-vcs/vcs-port.ts
   */
  override async unapprove(project: string, iid: string): Promise<void> {
    this._applyEffect('unapprove', project, iid);
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#requestChanges} in ../../inbox-vcs/vcs-port.ts
   */
  override async requestChanges(project: string, iid: string): Promise<void> {
    this._applyEffect('request_changes', project, iid);
  }

  /**
   * @param project Canonical project path.
   * @param iid MR internal identifier.
   * @param description New description text.
   * @returns Resolved after the effect is recorded.
   * @see {VcsPort#editDescription} in ../../inbox-vcs/vcs-port.ts
   */
  async editDescription(project: string, iid: string, description: string): Promise<void> {
    this._applyEffect('edit_description', project, iid, { description });
  }
}
