// @file: ReviewCommandRouter — typed operator command dispatch with pre-mutation validation.
// @consumers: HttpServer, review-api.contract.test.ts
// @tasks: TSK-179

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import type { TaskQueuePort } from '../../../inbox-queue/task-queue.ts';
import type { DecisionJournal } from '../../../inbox-core/decision-journal.ts';
import type { JournalPort } from '../../../inbox-core/event-journal.ts';
import type { ProjectionPort } from '../../projections/projection.port.ts';
import { sendJson, sendDomainError, sendError, parseBody } from '../../http-helpers.ts';

/** @purpose Route pattern matching all /api/v2/mr/:ref/command requests. */
const COMMAND_RE = /^\/api\/v2\/mr\/(.+)\/command$/;

/** @purpose Closed set of valid typed command kinds. */
export type ReviewCommandKind =
  | 'complete_mr'
  | 'apply_package'
  | 'edit_package'
  | 'reject_package'
  | 'verify_now'
  | 'retry_effect'
  | 'update_description'
  | 'generate_handoff'
  | 'acknowledge_handoff';

/** @purpose Typed command envelope — discriminated union dispatched by ReviewCommandRouter. */
export type ReviewCommand =
  | { kind: 'complete_mr' }
  | { kind: 'apply_package'; packageId: string; revision: number }
  | { kind: 'edit_package'; packageId: string; revision: number; payload: Record<string, unknown> }
  | { kind: 'reject_package'; packageId: string }
  | { kind: 'verify_now' }
  | { kind: 'retry_effect'; taskId: string }
  | { kind: 'update_description'; description: string }
  | { kind: 'generate_handoff' }
  | { kind: 'acknowledge_handoff'; taskId: string };

/** @purpose Dependency surface required by ReviewCommandRouter. */
export type ReviewCommandRouterDeps = {
  /** @purpose Task queue for enqueuing background tasks. */
  queue: TaskQueuePort;
  /** @purpose Decision journal for recording proposal verdicts. */
  decisionJournal: DecisionJournal;
  /** @purpose Event journal for emitting board-lifecycle system events. */
  journal: JournalPort;
  /** @purpose Projection port for reading MR state before mutation. */
  projections: ProjectionPort;
};

/** @purpose Closed set of valid command kind strings — gates unknown-command rejection. */
const VALID_COMMAND_KINDS: ReadonlySet<ReviewCommandKind> = new Set([
  'complete_mr',
  'apply_package',
  'edit_package',
  'reject_package',
  'verify_now',
  'retry_effect',
  'update_description',
  'generate_handoff',
  'acknowledge_handoff',
]);

/**
 * @purpose Validate and dispatch typed operator commands — rejects malformed, stale, or unsafe mutations before any write.
 * @invariant complete_mr rejected when MR state is not merged or closed (terminal).
 * @invariant apply_package/edit_package rejected with 409 when command revision < current review.json revision.
 * @invariant Accepted command returns { ok: true, taskId? } immediately — background task may still be running.
 */
export class ReviewCommandRouter {
  /** @purpose Injected dependency surface. */
  protected _deps: ReviewCommandRouterDeps;

  /**
   * @purpose Create a ReviewCommandRouter bound to its dependency surface.
   * @param deps Injected queue, journals, and projection port.
   */
  constructor(deps: ReviewCommandRouterDeps) {
    this._deps = deps;
  }

  /**
   * @purpose Check if this request matches the command route.
   * @param req Incoming HTTP request.
   * @returns true when this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'POST') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return COMMAND_RE.test(url.pathname);
  }

  /**
   * @purpose Dispatch the command — validate, then route to the correct handler.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   * @sideEffect May enqueue a task, append a journal event, or record a decision verdict.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const match = url.pathname.match(COMMAND_RE);
    const mrRef = decodeURIComponent(match?.[1] ?? '');

    try {
      const body = await parseBody<ReviewCommand>(req);

      // #region START_VALIDATE_COMMAND_SHAPE — reject malformed and unknown commands before any read
      if (!body || typeof body.kind !== 'string') {
        sendDomainError(res, 400, 'invalid_input', 'Missing required field: kind');
        return;
      }
      if (!VALID_COMMAND_KINDS.has(body.kind as ReviewCommandKind)) {
        sendDomainError(res, 400, 'invalid_input', `Unknown command kind: ${body.kind}`, 'kind');
        return;
      }
      // #endregion END_VALIDATE_COMMAND_SHAPE

      logger.debug('[ReviewCommandRouter#handle] [idle → dispatching]', {
        mrRef,
        kind: body.kind,
      });

      switch (body.kind as ReviewCommandKind) {
        case 'complete_mr':
          await this._handleCompleteMr(mrRef, res);
          break;
        case 'apply_package':
          await this._handleApplyPackage(
            mrRef,
            body as Extract<ReviewCommand, { kind: 'apply_package' }>,
            res
          );
          break;
        case 'edit_package':
          await this._handleEditPackage(
            mrRef,
            body as Extract<ReviewCommand, { kind: 'edit_package' }>,
            res
          );
          break;
        case 'reject_package':
          await this._handleRejectPackage(
            mrRef,
            body as Extract<ReviewCommand, { kind: 'reject_package' }>,
            res
          );
          break;
        case 'verify_now':
          await this._handleVerifyNow(mrRef, res);
          break;
        case 'retry_effect':
          await this._handleRetryEffect(
            mrRef,
            body as Extract<ReviewCommand, { kind: 'retry_effect' }>,
            res
          );
          break;
        case 'update_description':
          await this._handleUpdateDescription(
            mrRef,
            body as Extract<ReviewCommand, { kind: 'update_description' }>,
            res
          );
          break;
        case 'generate_handoff':
          await this._handleGenerateHandoff(mrRef, res);
          break;
        case 'acknowledge_handoff':
          await this._handleAcknowledgeHandoff(
            mrRef,
            body as Extract<ReviewCommand, { kind: 'acknowledge_handoff' }>,
            res
          );
          break;
      }
    } catch (cause) {
      logger.error('[ReviewCommandRouter#handle] [dispatching → failed]', { mrRef, error: cause });
      sendError(res, cause);
    }
  }

  /**
   * @purpose Handle complete_mr — marks a terminal MR as complete on the board.
   * @invariant Rejected when MR state is open — completing an active MR is unsafe.
   * @param mrRef Composite MR reference.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Appends a mr_board_complete system event to the journal.
   */
  protected async _handleCompleteMr(mrRef: string, res: ServerResponse): Promise<void> {
    const mrProjection = this._deps.projections.mr(mrRef);

    // #region START_VALIDATE_TERMINAL_STATE — complete_mr is only valid for merged/closed MRs
    if (!mrProjection) {
      sendDomainError(res, 404, 'not_found', `MR not found: ${mrRef}`, 'mr');
      return;
    }
    if (mrProjection.mrState === 'open') {
      sendDomainError(
        res,
        400,
        'invalid_input',
        'complete_mr rejected: MR is still open',
        'mrState'
      );
      return;
    }
    // #endregion END_VALIDATE_TERMINAL_STATE

    await this._deps.journal.append({
      ts: new Date().toISOString(),
      mr: mrRef,
      kind: 'system',
      actor: 'operator',
      payload: { kind: 'mr_board_complete', mrRef },
    });

    logger.info('[ReviewCommandRouter#_handleCompleteMr] [dispatching → completed]', { mrRef });
    sendJson(res, 200, { ok: true });
  }

  /**
   * @purpose Handle apply_package — accept a proposal after CAS revision check.
   * @invariant Rejected with 409 when command revision < current review revision (stale).
   * @param mrRef Composite MR reference.
   * @param cmd Typed apply_package command.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Records accept verdict in decision journal; enqueues effect task.
   */
  protected async _handleApplyPackage(
    mrRef: string,
    cmd: Extract<ReviewCommand, { kind: 'apply_package' }>,
    res: ServerResponse
  ): Promise<void> {
    if (typeof cmd.packageId !== 'string' || typeof cmd.revision !== 'number') {
      sendDomainError(res, 400, 'invalid_input', 'apply_package requires packageId and revision');
      return;
    }

    const mrProjection = this._deps.projections.mr(mrRef);
    const currentRevision = mrProjection?.revision ?? 0;

    // #region START_CAS_REVISION_CHECK — stale command rejected before any write (D-99)
    if (cmd.revision < currentRevision) {
      sendDomainError(
        res,
        409,
        'conflict',
        `Stale package: command revision ${cmd.revision} < current ${currentRevision}`,
        'revision'
      );
      return;
    }
    // #endregion END_CAS_REVISION_CHECK

    await this._deps.decisionJournal.writeDecision({
      proposalId: cmd.packageId,
      verdict: 'accept',
      actor: 'operator',
      mr: mrRef,
    });

    const enqueued = this._deps.queue.enqueue(mrRef, 'effect', {
      mr: mrRef,
      proposalId: cmd.packageId,
      verdict: 'accept',
    });

    logger.info('[ReviewCommandRouter#_handleApplyPackage] [dispatching → accepted]', {
      mrRef,
      packageId: cmd.packageId,
      taskId: enqueued.taskId,
    });

    sendJson(res, 200, { ok: true, taskId: enqueued.taskId });
  }

  /**
   * @purpose Handle edit_package — record an edited verdict with operator diff.
   * @invariant Rejected with 409 when command revision < current review revision.
   * @param mrRef Composite MR reference.
   * @param cmd Typed edit_package command.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Records edit verdict in decision journal; enqueues effect task.
   */
  protected async _handleEditPackage(
    mrRef: string,
    cmd: Extract<ReviewCommand, { kind: 'edit_package' }>,
    res: ServerResponse
  ): Promise<void> {
    if (typeof cmd.packageId !== 'string' || typeof cmd.revision !== 'number') {
      sendDomainError(
        res,
        400,
        'invalid_input',
        'edit_package requires packageId, revision, and payload'
      );
      return;
    }

    const mrProjection = this._deps.projections.mr(mrRef);
    const currentRevision = mrProjection?.revision ?? 0;

    // #region START_CAS_REVISION_CHECK — stale command rejected before write (D-99)
    if (cmd.revision < currentRevision) {
      sendDomainError(
        res,
        409,
        'conflict',
        `Stale package: command revision ${cmd.revision} < current ${currentRevision}`,
        'revision'
      );
      return;
    }
    // #endregion END_CAS_REVISION_CHECK

    await this._deps.decisionJournal.writeDecision({
      proposalId: cmd.packageId,
      verdict: 'edit',
      diff: JSON.stringify(cmd.payload ?? {}),
      actor: 'operator',
      mr: mrRef,
    });

    const enqueued = this._deps.queue.enqueue(mrRef, 'effect', {
      mr: mrRef,
      proposalId: cmd.packageId,
      verdict: 'edit',
      payload: cmd.payload,
    });

    logger.info('[ReviewCommandRouter#_handleEditPackage] [dispatching → edited]', {
      mrRef,
      packageId: cmd.packageId,
      taskId: enqueued.taskId,
    });

    sendJson(res, 200, { ok: true, taskId: enqueued.taskId });
  }

  /**
   * @purpose Handle reject_package — record a reject verdict; no task enqueued.
   * @param mrRef Composite MR reference.
   * @param cmd Typed reject_package command.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Records reject verdict in decision journal.
   */
  protected async _handleRejectPackage(
    mrRef: string,
    cmd: Extract<ReviewCommand, { kind: 'reject_package' }>,
    res: ServerResponse
  ): Promise<void> {
    if (typeof cmd.packageId !== 'string') {
      sendDomainError(res, 400, 'invalid_input', 'reject_package requires packageId');
      return;
    }

    await this._deps.decisionJournal.writeDecision({
      proposalId: cmd.packageId,
      verdict: 'reject',
      actor: 'operator',
      mr: mrRef,
    });

    logger.info('[ReviewCommandRouter#_handleRejectPackage] [dispatching → rejected]', {
      mrRef,
      packageId: cmd.packageId,
    });

    sendJson(res, 200, { ok: true });
  }

  /**
   * @purpose Handle verify_now — enqueue an immediate verification task.
   * @param mrRef Composite MR reference.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Enqueues a verify task on the queue.
   */
  protected async _handleVerifyNow(mrRef: string, res: ServerResponse): Promise<void> {
    const enqueued = this._deps.queue.enqueue(mrRef, 'verify', { mr: mrRef });
    logger.info('[ReviewCommandRouter#_handleVerifyNow] [dispatching → enqueued]', {
      mrRef,
      taskId: enqueued.taskId,
    });
    sendJson(res, 200, { ok: true, taskId: enqueued.taskId });
  }

  /**
   * @purpose Handle retry_effect — enqueue a retry for a previously failed effect task.
   * @param mrRef Composite MR reference.
   * @param cmd Typed retry_effect command.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Enqueues a retry task on the queue.
   */
  protected async _handleRetryEffect(
    mrRef: string,
    cmd: Extract<ReviewCommand, { kind: 'retry_effect' }>,
    res: ServerResponse
  ): Promise<void> {
    if (typeof cmd.taskId !== 'string') {
      sendDomainError(res, 400, 'invalid_input', 'retry_effect requires taskId');
      return;
    }

    const enqueued = this._deps.queue.enqueue(mrRef, 'effect_retry', {
      mr: mrRef,
      originalTaskId: cmd.taskId,
    });

    logger.info('[ReviewCommandRouter#_handleRetryEffect] [dispatching → enqueued]', {
      mrRef,
      originalTaskId: cmd.taskId,
      taskId: enqueued.taskId,
    });

    sendJson(res, 200, { ok: true, taskId: enqueued.taskId });
  }

  /**
   * @purpose Handle update_description — enqueue a description update task.
   * @param mrRef Composite MR reference.
   * @param cmd Typed update_description command.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Enqueues an update_description task on the queue.
   */
  protected async _handleUpdateDescription(
    mrRef: string,
    cmd: Extract<ReviewCommand, { kind: 'update_description' }>,
    res: ServerResponse
  ): Promise<void> {
    if (typeof cmd.description !== 'string') {
      sendDomainError(res, 400, 'invalid_input', 'update_description requires description');
      return;
    }

    const enqueued = this._deps.queue.enqueue(mrRef, 'update_description', {
      mr: mrRef,
      description: cmd.description,
    });

    logger.info('[ReviewCommandRouter#_handleUpdateDescription] [dispatching → enqueued]', {
      mrRef,
      taskId: enqueued.taskId,
    });

    sendJson(res, 200, { ok: true, taskId: enqueued.taskId });
  }

  /**
   * @purpose Handle generate_handoff — enqueue a handoff document generation task.
   * @param mrRef Composite MR reference.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Enqueues a generate_handoff task on the queue.
   */
  protected async _handleGenerateHandoff(mrRef: string, res: ServerResponse): Promise<void> {
    const enqueued = this._deps.queue.enqueue(mrRef, 'generate_handoff', { mr: mrRef });
    logger.info('[ReviewCommandRouter#_handleGenerateHandoff] [dispatching → enqueued]', {
      mrRef,
      taskId: enqueued.taskId,
    });
    sendJson(res, 200, { ok: true, taskId: enqueued.taskId });
  }

  /**
   * @purpose Handle acknowledge_handoff — emit a clipboard delivery acknowledgment event.
   * @param mrRef Composite MR reference.
   * @param cmd Typed acknowledge_handoff command.
   * @param res Server response.
   * @returns Completion after the response is sent.
   * @sideEffect Appends a handoff_acknowledged system event to the journal.
   */
  protected async _handleAcknowledgeHandoff(
    mrRef: string,
    cmd: Extract<ReviewCommand, { kind: 'acknowledge_handoff' }>,
    res: ServerResponse
  ): Promise<void> {
    if (typeof cmd.taskId !== 'string') {
      sendDomainError(res, 400, 'invalid_input', 'acknowledge_handoff requires taskId');
      return;
    }

    await this._deps.journal.append({
      ts: new Date().toISOString(),
      mr: mrRef,
      kind: 'system',
      actor: 'operator',
      payload: { kind: 'handoff_acknowledged', taskId: cmd.taskId, mrRef },
    });

    logger.info('[ReviewCommandRouter#_handleAcknowledgeHandoff] [dispatching → acknowledged]', {
      mrRef,
      taskId: cmd.taskId,
    });

    sendJson(res, 200, { ok: true });
  }
}
