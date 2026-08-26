// @file: ReviewHandoffGenerator — pure full/delta handoff composition with in-memory delivery acknowledgement baseline.
// @consumers: inbox-dashboard ActionPanel
// @tasks: TSK-178

import { randomUUID } from 'node:crypto';
import { logger } from '#logger';
import {
  computeFindingSignatures,
  diffFindingSignatures,
  type FindingSignature,
  type FindingSignatureDiff,
} from '../inbox-core/finding-signature.ts';

// #region START_HANDOFF_TYPES — invariant: closed entity inventory per spec §3; no extra fields without spec change

/** @purpose Clipboard-ready DEV-agent instruction generated from current MR findings. */
export type ReviewHandoff = {
  /** @purpose Unique candidate identifier — consumed by acknowledgeDelivery */
  id: string;
  /** @purpose MR reference (`project!iid`) this handoff belongs to */
  mrRef: string;
  /** @purpose Generation mode — full context or delta since last acknowledged delivery */
  mode: 'full' | 'delta';
  /** @purpose Composed markdown text ready for clipboard */
  text: string;
  /** @purpose ISO timestamp when generated */
  generatedAt: string;
  /** @purpose Finding signatures captured at generation time — used to compute next delta | @invariant immutable after compose() returns */
  signatures: FindingSignature[];
};

/** @purpose Baseline captured after each confirmed clipboard delivery — input for the next delta. */
export type ReviewHandoffSnapshot = {
  /** @purpose Unique snapshot identifier */
  id: string;
  /** @purpose MR reference the snapshot belongs to */
  mrRef: string;
  /** @purpose Handoff identifier that was acknowledged */
  handoffId: string;
  /** @purpose ISO timestamp of the confirmed delivery */
  deliveredAt: string;
  /** @purpose 1-based delivery count — rendered as "copy number N" in the delta heading */
  deliveryCount: number;
  /** @purpose Finding signatures at delivery time — diffed against the next generation's signatures */
  signatures: FindingSignature[];
};

/**
 * @purpose Browser clipboard delivery outcome — consumed by acknowledgeDelivery to decide
 * whether to advance the baseline.
 */
export type ReviewHandoffDelivery = {
  /** @purpose Candidate identifier being acknowledged */
  handoffId: string;
  /** @purpose Browser clipboard write outcome — only 'success' advances the baseline */
  receipt: 'success' | 'duplicate' | 'stale' | 'wrong-mr' | 'failed';
  /** @purpose ISO timestamp of the acknowledgement */
  deliveredAt: string;
};

// #endregion END_HANDOFF_TYPES

/** @purpose One finding shape consumed by the generator — structurally compatible with MrDetail['findings'][number]. */
type ReviewFinding = {
  id?: string;
  severity: string;
  file: string;
  line: number;
  message: string;
};

/** @purpose MR identity fields required for handoff headings. */
type ReviewHandoffMr = {
  /** @purpose GitLab project path (namespace/repo) */
  project: string;
  /** @purpose MR internal identifier */
  iid: number;
  /** @purpose MR title shown in the handoff heading */
  title: string;
  /** @purpose Full GitLab URL — included in full mode only */
  webUrl: string;
};

/** @purpose Per-MR generator state holding the acknowledged baseline and the latest pending candidate. */
type HandoffState = {
  /** @purpose Last acknowledged snapshot — null before the first successful delivery */
  snapshot: ReviewHandoffSnapshot | null;
  /** @purpose Most recent compose() output awaiting acknowledgement — replaced on each compose() */
  pending: ReviewHandoff | null;
};

/**
 * @purpose Compose clipboard-ready DEV-agent instructions and gate baseline advancement on
 * confirmed browser delivery.
 * @invariant Generation alone never advances the baseline — only acknowledgeDelivery with
 * receipt='success' does.
 * @invariant Delta is computed against the last acknowledged snapshot; failed or unacknowledged
 * deliveries leave the baseline unchanged.
 * @invariant State is in-memory only; baseline resets on server restart (persistence deferred per
 * spec §6).
 */
export class ReviewHandoffGenerator {
  /** @purpose Per-MR state keyed by mrRef (`project!iid`). */
  protected _states: Map<string, HandoffState> = new Map();

  /**
   * @purpose Compose a full or delta handoff instruction from current MR data.
   * @invariant Always replaces the pending candidate — a prior unacknowledged candidate is
   * superseded without advancing the baseline.
   * @param mr MR identity for the handoff heading.
   * @param findings Current findings from the MR report.
   * @param [opts] Generation options — mode defaults to 'delta' when a baseline exists, 'full'
   * otherwise.
   * @returns Immutable handoff candidate ready for clipboard delivery.
   */
  compose(
    mr: ReviewHandoffMr,
    findings: ReviewFinding[],
    opts?: { mode?: 'full' | 'delta' }
  ): ReviewHandoff {
    const mrRef = `${mr.project}!${mr.iid}`;
    const state = this._states.get(mrRef) ?? { snapshot: null, pending: null };
    const mode = opts?.mode ?? (state.snapshot !== null ? 'delta' : 'full');

    logger.debug('[ReviewHandoffGenerator#compose] [idle → composing]', { mrRef, mode });

    const signatures = computeFindingSignatures(findings);
    const text =
      mode === 'delta' && state.snapshot !== null
        ? this._composeDeltaText(mr, findings, signatures, state.snapshot)
        : this._composeFullText(mr, findings);

    const handoff: ReviewHandoff = {
      id: randomUUID(),
      mrRef,
      mode,
      text,
      generatedAt: new Date().toISOString(),
      signatures,
    };

    state.pending = handoff;
    this._states.set(mrRef, state);

    logger.debug('[ReviewHandoffGenerator#compose] [composing → ready]', {
      mrRef,
      handoffId: handoff.id,
      mode,
    });
    return handoff;
  }

  /**
   * @purpose Confirm or reject a clipboard delivery — advances the baseline only on
   * receipt='success'.
   * @param handoffId Candidate identifier returned by a prior compose().
   * @param receipt Browser clipboard write outcome.
   * @returns Whether the baseline was advanced and, when advanced, the new snapshot.
   */
  acknowledgeDelivery(
    handoffId: string,
    receipt: ReviewHandoffDelivery['receipt']
  ): { advanced: boolean; snapshot?: ReviewHandoffSnapshot } {
    // #region START_LOCATE_PENDING_CANDIDATE — invariant: handoffId must match current pending; stale IDs are rejected
    for (const [mrRef, state] of this._states) {
      if (state.pending?.id !== handoffId) continue;

      if (receipt !== 'success') {
        logger.debug('[ReviewHandoffGenerator#acknowledgeDelivery] [pending → unchanged]', {
          mrRef,
          handoffId,
          receipt,
        });
        return { advanced: false };
      }

      const prevCount = state.snapshot?.deliveryCount ?? 0;
      const snapshot: ReviewHandoffSnapshot = {
        id: randomUUID(),
        mrRef,
        handoffId,
        deliveredAt: new Date().toISOString(),
        deliveryCount: prevCount + 1,
        signatures: state.pending.signatures,
      };

      state.snapshot = snapshot;
      state.pending = null;
      this._states.set(mrRef, state);

      logger.debug('[ReviewHandoffGenerator#acknowledgeDelivery] [pending → advanced]', {
        mrRef,
        handoffId,
        deliveryCount: snapshot.deliveryCount,
      });
      return { advanced: true, snapshot };
    }
    // #endregion END_LOCATE_PENDING_CANDIDATE

    logger.warn('[ReviewHandoffGenerator#acknowledgeDelivery] [idle → not_found]', { handoffId });
    return { advanced: false };
  }

  /**
   * @purpose Retrieve the current baseline snapshot for an MR.
   * @param mrRef MR reference (`project!iid`).
   * @returns Current snapshot or null when no delivery has been confirmed yet.
   */
  retrieveSnapshot(mrRef: string): ReviewHandoffSnapshot | null {
    return this._states.get(mrRef)?.snapshot ?? null;
  }

  /**
   * @purpose Compose the full first-click micro-directive for the author's downstream agent.
   * @invariant Includes complete MR identity and every finding verbatim — downstream agent
   * re-verifies each against current code.
   * @param mr MR identity.
   * @param findings All current findings.
   * @returns Markdown text ready for clipboard.
   */
  protected _composeFullText(mr: ReviewHandoffMr, findings: ReviewFinding[]): string {
    const items = findings.length
      ? findings.map((f) => `- [${f.severity}] ${f.file}:${f.line} — ${f.message}`).join('\n')
      : '(нет находок)';
    return `# Задание на исправление — MR "${mr.title}" (${mr.project}!${mr.iid})

Это результат автоматического код-ревью, не твоя собственная находка «с нуля». MR: ${mr.webUrl}
Ревью-агент прошёл по диффу и оставил замечания ниже. Он мог ошибиться или устареть (если код
менялся после ревью) — прежде чем править, открой каждый файл:строку и сверь замечание с текущим
кодом. Не применяй бездумно, реши по каждому пункту сам.

## Находки

${items}

## Что сделать
Согласен с замечанием → почини. Не согласен или оно больше не актуально → не молчи, скажи
оператору почему, коротко, по каждому такому пункту.
`;
  }

  /**
   * @purpose Compose a brief repeat-click delta relative to the current baseline snapshot.
   * @invariant Added findings carry full message text; resolved findings shown by location only;
   * unchanged count is surfaced.
   * @param mr MR identity.
   * @param findings Current findings.
   * @param signatures Current finding signatures pre-computed by compose().
   * @param snapshot Current baseline snapshot.
   * @returns Markdown delta text ready for clipboard.
   */
  protected _composeDeltaText(
    mr: ReviewHandoffMr,
    findings: ReviewFinding[],
    signatures: FindingSignature[],
    snapshot: ReviewHandoffSnapshot
  ): string {
    const delta: FindingSignatureDiff = diffFindingSignatures(snapshot.signatures, signatures);

    // #region START_DELTA_BODY — invariant: noChange path is explicit, never an empty body
    const addedItems = delta.added.map((sig) => {
      const match = findings.find((f) => f.file === sig.file && f.line === sig.line);
      return `- ${sig.file}:${sig.line} — ${match?.message ?? '(текст недоступен)'}`;
    });
    const resolvedItems = delta.resolved.map((sig) => `- ${sig.file}:${sig.line}`);
    const noChange = delta.added.length === 0 && delta.resolved.length === 0;
    const body = noChange
      ? 'Ничего нового с прошлого раза.'
      : `## Новое

${addedItems.length ? addedItems.join('\n') : '(нет)'}

## Устранено

${resolvedItems.length ? resolvedItems.join('\n') : '(нет)'}`;
    // #endregion END_DELTA_BODY

    return `# Копирование №${snapshot.deliveryCount + 1} — MR "${mr.title}" (${mr.project}!${mr.iid})

Предыдущее копирование: ${snapshot.deliveredAt}

${body}

без изменений: ${delta.unchanged.length}
`;
  }
}
