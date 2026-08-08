// @file: DecisionRouter — POST /api/decision: accept→{taskId}, edit→{taskId}, reject→204.
//   Records verdict in DecisionJournal; accept/edit enqueues effect task.
// @consumers: HttpServer
// @tasks: TSK-157, TSK-162

import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '#logger';
import type {
  DecisionJournal,
  ProposalRecord,
  Verdict,
} from '../../inbox-core/decision-journal.ts';
import type { TaskQueuePort } from '../../inbox-queue/task-queue.ts';
import { sendJson, sendDomainError, sendError, parseBody } from '../http-helpers.ts';

/** @purpose Regex pattern for matching legacy POST /api/decision requests. */
const DECISION_RE = /^\/api\/decision$/;
/** @purpose Canonical MR-scoped decision endpoint required by inbox-api spec §4. */
const MR_DECISION_RE = /^\/api\/mr\/(.+)\/decision$/;

/** @purpose Closed set of valid operator verdicts. */
const VALID_VERDICTS: ReadonlySet<Verdict> = new Set(['accept', 'edit', 'reject']);

/** @purpose Request body for POST /api/decision. */
type DecisionBody = {
  /** @purpose Proposal identifier — references a prior proposal event */
  proposalId: string;
  /** @purpose Operator verdict on the proposal */
  verdict: Verdict;
  /** @purpose Optional payload — edited text on edit, or empty on accept/reject */
  payload?: Record<string, unknown>;
  /** @purpose Optional pipeline proposal envelope persisted before its first operator verdict. */
  proposal?: Omit<ProposalRecord, 'mr' | 'proposalId'>;
};

/**
 * @purpose POST /api/decision — records operator verdict on a proposal.
 *   Accept/edit enqueues an effect task; reject returns 204.
 */
export class DecisionRouter {
  /** @purpose Decision journal for recording proposals and verdicts */
  protected _decisionJournal: DecisionJournal;
  /** @purpose Task queue for enqueuing effect tasks on accept/edit */
  protected _queue: TaskQueuePort;
  /** @purpose Optional production seam choosing an MR-scoped journal. */
  protected _resolveJournal: ((mr: string) => DecisionJournal) | undefined;
  /** @purpose Recomputes and persists D-302 modes after every operator verdict. */
  protected _onDecision: ((mr: string, journal: DecisionJournal) => Promise<void>) | undefined;

  /**
   * @purpose Create a DecisionRouter bound to a decision journal and task queue.
   * @param decisionJournal DecisionJournal instance.
   * @param queue TaskQueuePort implementation.
   * @param [resolveJournal] Optional canonical-MR journal factory.
   * @param [onDecision] Optional capability-cache persistence callback.
   */
  constructor(
    decisionJournal: DecisionJournal,
    queue: TaskQueuePort,
    resolveJournal?: (mr: string) => DecisionJournal,
    onDecision?: (mr: string, journal: DecisionJournal) => Promise<void>
  ) {
    this._decisionJournal = decisionJournal;
    this._queue = queue;
    this._resolveJournal = resolveJournal;
    this._onDecision = onDecision;
  }

  /**
   * @purpose Check if this request matches the decision route.
   * @param req Incoming HTTP request.
   * @returns true if this router should handle the request.
   */
  matches(req: IncomingMessage): boolean {
    if (req.method !== 'POST') return false;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return DECISION_RE.test(url.pathname) || MR_DECISION_RE.test(url.pathname);
  }

  /**
   * @purpose Handle the decision request — validate, record, optionally enqueue effect.
   * @param req Incoming HTTP request.
   * @param res Server response.
   * @returns Promise that resolves when the response is sent.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await parseBody<DecisionBody>(req);

      if (!body || !body.proposalId || !body.verdict) {
        sendDomainError(res, 400, 'invalid_input', 'Missing required fields: proposalId, verdict');
        return;
      }

      // #region START_VALIDATE_VERDICT — verdict must be a closed-set value
      if (!VALID_VERDICTS.has(body.verdict)) {
        sendDomainError(
          res,
          400,
          'invalid_input',
          `Invalid verdict: ${body.verdict} (expected accept, edit, or reject)`
        );
        return;
      }
      // #endregion END_VALIDATE_VERDICT

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const canonicalMatch = url.pathname.match(MR_DECISION_RE);
      const mrRef = canonicalMatch
        ? decodeURIComponent(canonicalMatch[1])
        : (body.payload?.mr as string | undefined);
      if (!mrRef && this._resolveJournal) {
        sendDomainError(res, 400, 'invalid_input', 'MR ref is required for a decision');
        return;
      }
      const journal = mrRef
        ? (this._resolveJournal?.(mrRef) ?? this._decisionJournal)
        : this._decisionJournal;

      // Pipeline callers can atomically make their first proposal production-reachable through the
      // same MR-scoped API flow; repeat proposal IDs remain idempotent in journal readers.
      if (body.proposal && mrRef) {
        await journal.writeProposal({ ...body.proposal, proposalId: body.proposalId, mr: mrRef });
      }

      // #region START_WRITE_DECISION — record the operator's verdict in the MR-scoped journal
      await journal.writeDecision({
        proposalId: body.proposalId,
        verdict: body.verdict,
        diff: body.payload ? JSON.stringify(body.payload) : undefined,
        actor: 'operator',
        ...(mrRef ? { mr: mrRef } : {}),
      });
      if (mrRef) await this._onDecision?.(mrRef, journal);
      // #endregion END_WRITE_DECISION

      // #region START_BRANCH_REJECT — reject returns 204, no task enqueued
      if (body.verdict === 'reject') {
        logger.info('[DecisionRouter#handle] [decision → rejected]', {
          proposalId: body.proposalId,
        });
        res.writeHead(204);
        res.end();
        return;
      }
      // #endregion END_BRANCH_REJECT

      // #region START_ENQUEUE_EFFECT — accept/edit enqueues an effect task for the pipeline
      const result = this._queue.enqueue(mrRef ?? 'default', 'effect', {
        mr: mrRef,
        proposalId: body.proposalId,
        verdict: body.verdict,
        payload: body.payload,
      });

      logger.info('[DecisionRouter#handle] [decision → effect_enqueued]', {
        proposalId: body.proposalId,
        verdict: body.verdict,
        taskId: result.taskId,
      });

      sendJson(res, 200, { ok: true, taskId: result.taskId });
      // #endregion END_ENQUEUE_EFFECT
    } catch (cause) {
      logger.error('[DecisionRouter#handle] [decision → failed]', { error: cause });
      sendError(res, cause);
    }
  }
}
