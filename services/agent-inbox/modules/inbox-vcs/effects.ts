// @file: Effects — unified permission-gated, idempotency-addressed, reconciled GitLab mutations.
// @consumers: inbox-queue (effect_* tasks)
// @tasks: TSK-158, TSK-174

import { logger } from '#logger';
import { createHash } from 'node:crypto';
import {
  validateVcsEffectRequest,
  type VcsEffectOutcome,
  type VcsEffectRequest,
  type VcsPort,
} from './vcs-port.ts';
import type { JournalPort } from '../inbox-core/event-journal.ts';
import { VcsPermissionPolicy } from './permission-policy.ts';
import { VcsReconciler } from './reconciler.ts';

/** @purpose Parameters for posting a note to an MR. */
export type PostNoteParams = {
  /** @purpose Project full path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose Note body in Markdown */
  body: string;
  /** @purpose Optional discussion ID for threading — absent creates a new top-level discussion */
  discussionId?: string;
  /** @purpose MR web URL for host validation (SSRF guard) */
  mrUrl?: string;
};

/** @purpose Parameters for resolving a discussion thread. */
export type ResolveParams = {
  /** @purpose Project full path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose Target discussion identifier */
  discussionId: string;
  /** @purpose My username for ownership check (D-323) */
  myLogin: string;
  /** @purpose Author of the first note in the thread */
  threadAuthor: string;
  /** @purpose Whether I am the author of this MR */
  isMyMr: boolean;
  /** @purpose MR web URL for host validation (SSRF guard) */
  mrUrl?: string;
};

/** @purpose Parameters for editing an MR description. */
export type EditDescriptionParams = {
  /** @purpose Project full path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose New description in Markdown */
  description: string;
  /** @purpose MR web URL for host validation (SSRF guard) */
  mrUrl?: string;
};

/** @purpose Optional effect-policy dependencies preserving the existing constructor surface. */
export type EffectsConfig = {
  /** @purpose Exact review bot usernames eligible for owned-MR thread effects */
  botAllowlist?: readonly string[];
};

/**
 * @purpose Derive stable effect identity from MR, bound revision, action kind, and normalized payload.
 * @param request Effect request without its claimed identity.
 * @returns SHA-256 stable effect identity.
 */
export function composeVcsEffectId(request: Omit<VcsEffectRequest, 'effectId'>): string {
  const body = request.body?.trim().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(
      JSON.stringify({
        project: request.project,
        iid: request.iid,
        revision: request.revision,
        kind: request.kind,
        body,
        discussionId: request.discussionId,
        noteId: request.noteId,
        emoji: request.emoji,
      })
    )
    .digest('hex');
}

/**
 * @purpose Apply side effects to GitLab: post notes, react, resolve, approve, edit description.
 * @invariant D-323: resolve only own threads or robot threads — and only in own MRs.
 * @invariant Idempotency: marker written to journal AFTER GitLab confirmation; network failure before marker → safe retry.
 * @invariant All effects are sequential and exclusive — coordinated by inbox-queue via effect_* task types.
 * @consumer inbox-queue
 */
export class Effects {
  /** @purpose VCS port for network calls */
  protected _vcs: VcsPort;
  /** @purpose Event journal for idempotency markers */
  protected _journal: JournalPort;
  /** @purpose Complete last-mile permission and capability policy. */
  protected _permissionPolicy: VcsPermissionPolicy;
  /** @purpose Fresh-read postcondition classifier and ambiguous transport recovery. */
  protected _reconciler: VcsReconciler;

  /**
   * @purpose Create an Effects instance bound to a VCS port and event journal.
   * @param vcs VCS port for network calls.
   * @param journal Event journal for idempotency markers.
   * @param [config] Explicit bot ownership allowlist.
   */
  constructor(vcs: VcsPort, journal: JournalPort, config?: EffectsConfig) {
    this._vcs = vcs;
    this._journal = journal;
    this._permissionPolicy = new VcsPermissionPolicy(config?.botAllowlist);
    this._reconciler = new VcsReconciler(vcs);
  }

  /**
   * @purpose Execute any closed provider effect through validation, permission, capability, and reconciliation.
   * @param input Untrusted effect request candidate.
   * @throws {Error} When the request is unknown, incomplete, or claims a non-canonical identity.
   * @returns Closed reconciled outcome; denied/unavailable requests perform no mutation.
   * @sideEffect May probe capability, read provider state, mutate once/twice, and append a marker.
   */
  async apply(input: unknown): Promise<VcsEffectOutcome> {
    const request = validateVcsEffectRequest(input);
    const expectedEffectId = composeVcsEffectId(request);
    if (request.effectId !== expectedEffectId) {
      throw new Error('[Effects#apply] effectId does not match canonical request identity');
    }
    if (request.mrUrl) this._validateHost(request.mrUrl, 'apply');

    const preflight = this._permissionPolicy.authorize(request, {
      requestChanges: true,
      evidence: 'preflight-without-capability-io',
    });
    if (!preflight.allowed) {
      return {
        effectId: request.effectId,
        kind: request.kind,
        status: preflight.status,
        evidence: preflight.evidence,
        readBeforeRetry: false,
      };
    }
    const capabilities =
      request.kind === 'request_changes'
        ? await this._vcs.probeCapabilities()
        : { requestChanges: false, evidence: 'capability-not-required' };
    const permission = this._permissionPolicy.authorize(request, capabilities);
    if (!permission.allowed) {
      return {
        effectId: request.effectId,
        kind: request.kind,
        status: permission.status,
        evidence: permission.evidence,
        readBeforeRetry: false,
      };
    }

    const outcome = await this._reconciler.applyAndReconcile(request, () =>
      this._executeValidatedEffect(request)
    );
    if (outcome.status === 'applied' || outcome.status === 'no_op') {
      await this._writeMarker(request.kind, `${request.project}!${request.iid}`, request.effectId);
    }
    return outcome;
  }

  /**
   * @purpose Route one validated/authorized request across the exhaustive provider mutation matrix.
   * @param request Validated and authorized effect request.
   * @returns Completion after the concrete provider accepts the mutation.
   * @sideEffect Performs exactly one provider mutation.
   */
  protected async _executeValidatedEffect(request: VcsEffectRequest): Promise<void> {
    // #region START_EXECUTE_EFFECT_CLOSED_WORLD
    switch (request.kind) {
      case 'comment':
        return this._vcs.postDiscussion(request.project, request.iid, request.body!);
      case 'reply':
        return this._vcs.postNote(
          request.project,
          request.iid,
          request.body!,
          request.discussionId
        );
      case 'react':
        return this._vcs.react(request.project, request.iid, request.noteId!, request.emoji!);
      case 'resolve':
        return this._vcs.resolve(request.project, request.iid, request.discussionId!);
      case 'reopen':
        return this._vcs.reopen(request.project, request.iid, request.discussionId!);
      case 'approve':
        return this._vcs.approve(request.project, request.iid);
      case 'unapprove':
        return this._vcs.unapprove(request.project, request.iid);
      case 'request_changes':
        return this._vcs.requestChanges(request.project, request.iid);
      case 'edit_description':
        return this._vcs.editDescription(request.project, request.iid, request.body!);
    }
    // #endregion END_EXECUTE_EFFECT_CLOSED_WORLD
  }

  /**
   * @purpose Post a note to an MR — optionally as a reply to an existing discussion.
   * @invariant Idempotent: checks journal for existing marker before posting.
   * @param params Note parameters: project, iid, body, optional discussionId.
   * @param mrRef MR ref (path!iid) for journal deduplication.
   * @returns Resolves when the note is confirmed; marker written to journal.
   * @sideEffect Network: POST note to GitLab; journal: gitlab_event entry after confirmation.
   */
  async postNote(params: PostNoteParams, mrRef: string): Promise<void> {
    logger.debug('[Effects#postNote] [idle → posting]', {
      mr: mrRef,
      discussionId: params.discussionId,
    });

    // purpose: SSRF guard — validate MR URL host before any network call
    if (params.mrUrl) this._validateHost(params.mrUrl, 'postNote');

    // #region START_POST_NOTE_IDEMPOTENCY — check journal for existing marker
    const markerKey = params.discussionId
      ? `note:${params.discussionId}`
      : `note:new:${params.body.slice(0, 40)}`;
    if (this._hasMarker('postNote', mrRef, markerKey)) {
      logger.info('[Effects#postNote] [posting → skipped] Already posted (marker found)', {
        mr: mrRef,
      });
      return;
    }
    // #endregion END_POST_NOTE_IDEMPOTENCY

    // #region START_POST_NOTE_API — call VCS and write marker only after confirmation
    try {
      await this._vcs.postNote(params.project, params.iid, params.body, params.discussionId);
      await this._writeMarker('postNote', mrRef, markerKey);
      logger.info('[Effects#postNote] [posting → posted]', { mr: mrRef });
    } catch (cause) {
      const error = new Error('[Effects#postNote] Post failed', { cause });
      logger.error('[Effects#postNote] [posting → failed]', { error, mr: mrRef });
      throw error;
    }
    // #endregion END_POST_NOTE_API
  }

  /**
   * @purpose Add a 👍 reaction to a note — idempotent.
   * @param project Project full path.
   * @param iid MR internal ID.
   * @param noteId Target note ID.
   * @param mrRef MR ref (path!iid) for journal deduplication.
   * @param [mrUrl] MR web URL for host validation (SSRF guard).
   * @returns Resolves when reaction is confirmed; marker written to journal.
   * @sideEffect Network: POST emoji reaction; journal: marker after confirmation.
   */
  async react(
    project: string,
    iid: string,
    noteId: string,
    mrRef: string,
    mrUrl?: string
  ): Promise<void> {
    logger.debug('[Effects#react] [idle → reacting]', { mr: mrRef, noteId });

    // purpose: SSRF guard — validate MR URL host before any network call
    if (mrUrl) this._validateHost(mrUrl, 'react');

    // #region START_REACT_IDEMPOTENCY
    const markerKey = `react:${noteId}`;
    if (this._hasMarker('react', mrRef, markerKey)) {
      logger.info('[Effects#react] [reacting → skipped] Already reacted', { mr: mrRef });
      return;
    }
    // #endregion END_REACT_IDEMPOTENCY

    // #region START_REACT_API
    try {
      await this._vcs.react(project, iid, noteId, 'thumbsup');
      await this._writeMarker('react', mrRef, markerKey);
      logger.info('[Effects#react] [reacting → reacted]', { mr: mrRef, noteId });
    } catch (cause) {
      const error = new Error('[Effects#react] React failed', { cause });
      logger.error('[Effects#react] [reacting → failed]', { error, mr: mrRef });
      throw error;
    }
    // #endregion END_REACT_API
  }

  /**
   * @purpose Resolve a discussion thread — D-323: only own threads or robot threads, and only in own MRs.
   * @invariant Foreign threads in foreign MRs → deterministic rejection with reason logged to journal.
   * @invariant Race condition: already resolved → no-op + journal entry.
   * @param params Resolve parameters with ownership info for D-323 check.
   * @param mrRef MR ref (path!iid) for journal deduplication.
   * @returns Resolves when thread is resolved or rejected.
   */
  async resolve(params: ResolveParams, mrRef: string): Promise<void> {
    logger.debug('[Effects#resolve] [idle → resolving]', {
      mr: mrRef,
      discussionId: params.discussionId,
    });

    // purpose: SSRF guard — validate MR URL host before any network call
    if (params.mrUrl) this._validateHost(params.mrUrl, 'resolve');

    // #region START_RESOLVE_RIGHTS_CHECK — D-323: only own threads and own MRs
    const isMyThread = params.threadAuthor === params.myLogin;
    if (!isMyThread && !params.isMyMr) {
      const reason = `[Effects#resolve] BLOCKED: thread author "${params.threadAuthor}" != "${params.myLogin}" and MR is not mine`;
      logger.warn('[Effects#resolve] [resolving → rejected]', {
        mr: mrRef,
        discussionId: params.discussionId,
        threadAuthor: params.threadAuthor,
        myLogin: params.myLogin,
      });
      await this._writeFailedMarker('resolve', mrRef, `disc:${params.discussionId}`, reason);
      throw new Error(reason);
    }
    // #endregion END_RESOLVE_RIGHTS_CHECK

    // #region START_RESOLVE_API
    try {
      await this._vcs.resolve(params.project, params.iid, params.discussionId);
      await this._writeMarker('resolve', mrRef, `disc:${params.discussionId}`);
      logger.info('[Effects#resolve] [resolving → resolved]', {
        mr: mrRef,
        discussionId: params.discussionId,
      });
    } catch (cause) {
      const msg = (cause as Error).message ?? 'Unknown';
      // #region START_RESOLVE_RACE_CONDITION — already resolved by someone else → no-op
      if (/already resolved|409/i.test(msg)) {
        logger.info('[Effects#resolve] [resolving → already_resolved]', {
          mr: mrRef,
          discussionId: params.discussionId,
        });
        await this._writeMarker('resolve', mrRef, `disc:${params.discussionId}`);
        return;
      }
      // #endregion END_RESOLVE_RACE_CONDITION
      const error = new Error('[Effects#resolve] Resolve failed', { cause });
      logger.error('[Effects#resolve] [resolving → failed]', { error, mr: mrRef });
      throw error;
    }
    // #endregion END_RESOLVE_API
  }

  /**
   * @purpose Approve a merge request — idempotent.
   * @param project Project full path.
   * @param iid MR internal ID.
   * @param mrRef MR ref (path!iid) for journal deduplication.
   * @param [mrUrl] MR web URL for host validation (SSRF guard).
   * @returns Resolves when approval is confirmed; marker written to journal.
   * @sideEffect Network: POST approve; journal: marker after confirmation.
   */
  async approve(project: string, iid: string, mrRef: string, mrUrl?: string): Promise<void> {
    logger.debug('[Effects#approve] [idle → approving]', { mr: mrRef });

    // purpose: SSRF guard — validate MR URL host before any network call
    if (mrUrl) this._validateHost(mrUrl, 'approve');

    // #region START_APPROVE_IDEMPOTENCY
    if (this._hasMarker('approve', mrRef, 'approve')) {
      logger.info('[Effects#approve] [approving → skipped] Already approved', { mr: mrRef });
      return;
    }
    // #endregion END_APPROVE_IDEMPOTENCY

    // #region START_APPROVE_API
    try {
      await this._vcs.approve(project, iid);
      await this._writeMarker('approve', mrRef, 'approve');
      logger.info('[Effects#approve] [approving → approved]', { mr: mrRef });
    } catch (cause) {
      const error = new Error('[Effects#approve] Approve failed', { cause });
      logger.error('[Effects#approve] [approving → failed]', { error, mr: mrRef });
      throw error;
    }
    // #endregion END_APPROVE_API
  }

  /**
   * @purpose Edit the description of a merge request.
   * @param params Edit parameters: project, iid, new description.
   * @param mrRef MR ref (path!iid) for journal deduplication.
   * @returns Resolves when edit is confirmed; marker written to journal.
   * @sideEffect Network: PUT MR update; journal: marker after confirmation.
   */
  async editDescription(params: EditDescriptionParams, mrRef: string): Promise<void> {
    logger.debug('[Effects#editDescription] [idle → editing]', { mr: mrRef });

    // purpose: SSRF guard — validate MR URL host before any network call
    if (params.mrUrl) this._validateHost(params.mrUrl, 'editDescription');

    // #region START_EDIT_DESC_IDEMPOTENCY
    const markerKey = `desc:${params.description.slice(0, 40)}`;
    if (this._hasMarker('editDescription', mrRef, markerKey)) {
      logger.info('[Effects#editDescription] [editing → skipped] Already edited', { mr: mrRef });
      return;
    }
    // #endregion END_EDIT_DESC_IDEMPOTENCY

    // #region START_EDIT_DESC_API
    try {
      await this._vcs.editDescription(params.project, params.iid, params.description);
      await this._writeMarker('editDescription', mrRef, markerKey);
      logger.info('[Effects#editDescription] [editing → edited]', { mr: mrRef });
    } catch (cause) {
      const error = new Error('[Effects#editDescription] Edit failed', { cause });
      logger.error('[Effects#editDescription] [editing → failed]', { error, mr: mrRef });
      throw error;
    }
    // #endregion END_EDIT_DESC_API
  }

  /**
   * @purpose Validate that a given MR URL targets the configured VCS host — SSRF guard before any effect network call.
   * @param mrUrl MR web URL to validate.
   * @param effectName Effect name for the rejection message.
   * @throws {Error} When host mismatch detected.
   */
  protected _validateHost(mrUrl: string, effectName: string): void {
    // #region START_VALIDATE_HOST — parse URL, compare host to VCS configured host
    try {
      const parsed = new URL(mrUrl);
      const vcsHost = this._vcs.getHost();
      if (!vcsHost) {
        logger.debug('[Effects#_validateHost] [validating → skipped] No VCS host configured');
        return;
      }
      if (parsed.host !== vcsHost) {
        const reason = `[Effects#${effectName}] SSRF BLOCKED: URL host "${parsed.host}" != VCS host "${vcsHost}"`;
        throw new Error(reason);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('SSRF BLOCKED')) throw cause;
      logger.debug('[Effects#_validateHost] [validating → skipped] URL parse failed', {
        mrUrl,
        error: (cause as Error).message,
      });
    }
    // #endregion END_VALIDATE_HOST
  }

  /**
   * @purpose Check whether an effect marker already exists in the journal — idempotency gate.
   * @param effect Effect type name for deduplication.
   * @param mr MR ref (path!iid).
   * @param key Unique key for this effect instance.
   * @returns True when a matching confirmed marker exists in the journal.
   */
  protected _hasMarker(effect: string, mr: string, key: string): boolean {
    const entries = this._journal.read();
    return entries.some(
      (e) =>
        e.kind === 'gitlab_event' &&
        e.mr === mr &&
        e.payload?.effect === effect &&
        e.payload?.key === key
    );
  }

  /**
   * @purpose Write a confirmed effect marker to the journal AFTER GitLab confirmation.
   * @param effect Effect type name.
   * @param mr MR ref (path!iid).
   * @param key Unique key for deduplication.
   * @returns Resolves after the journal entry is fsync'd.
   * @sideEffect Appends a gitlab_event entry to the journal with O_APPEND + fsync.
   */
  protected async _writeMarker(effect: string, mr: string, key: string): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr,
      kind: 'gitlab_event',
      actor: 'effects',
      payload: { effect, key, status: 'confirmed' },
    });
  }

  /**
   * @purpose Write a failed effect marker to the journal — deterministic rejection or network failure.
   * @param effect Effect type name.
   * @param mr MR ref (path!iid).
   * @param key Unique key for deduplication.
   * @param reason Human-readable rejection reason.
   * @returns Resolves after the journal entry is fsync'd.
   * @sideEffect Appends a gitlab_event entry with failed status.
   */
  protected async _writeFailedMarker(
    effect: string,
    mr: string,
    key: string,
    reason: string
  ): Promise<void> {
    await this._journal.append({
      ts: new Date().toISOString(),
      mr,
      kind: 'gitlab_event',
      actor: 'effects',
      payload: { effect, key, status: 'failed', reason },
    });
  }
}
