// @file: ResponsibilityQueue — two-queue responsibility board: Review and Mine/Assigned.
// @consumers: App
// @tasks: TSK-182

import { useEffect, useState } from 'react';
import type { Attention, AttentionPriority, MrCardV2 } from '../v2-types.ts';

// #region START_PRIORITY_MAP — invariant: sort order matches spec §5: decision-required → agent-working → external-wait → no-action
const ATTENTION_PRIORITY: Record<Attention, AttentionPriority> = {
  '⏳': 'decision-required',
  '💬': 'decision-required',
  '🔀': 'agent-working',
  '✅': 'external-wait',
  '😴': 'no-action',
};
// #endregion END_PRIORITY_MAP

// #region START_PRIORITY_ORDER — invariant: lower index = higher priority
const PRIORITY_ORDER: AttentionPriority[] = [
  'decision-required',
  'agent-working',
  'external-wait',
  'no-action',
];
// #endregion END_PRIORITY_ORDER

/**
 * @purpose Sort MR cards by attention priority tier, then by unread count descending.
 * @param cards Cards to sort.
 * @returns New sorted array; input is not mutated.
 */
function sortByPriority(cards: MrCardV2[]): MrCardV2[] {
  return [...cards].sort((a, b) => {
    const pa = PRIORITY_ORDER.indexOf(ATTENTION_PRIORITY[a.attention]);
    const pb = PRIORITY_ORDER.indexOf(ATTENTION_PRIORITY[b.attention]);
    if (pa !== pb) return pa - pb;
    return b.counters.unread - a.counters.unread;
  });
}

/**
 * @purpose Derive queue column from operator role: reviewer → 'review'; author/mentioned/null → 'mine'.
 * @param myRole Operator role on the MR.
 * @returns Queue column assignment.
 */
function resolveQueueColumn(myRole: string | null): 'review' | 'mine' {
  return myRole === 'reviewer' ? 'review' : 'mine';
}

// #region START_WORK_LABEL — invariant: closed set, every WorkState maps to a non-empty string
const WORK_LABEL: Record<MrCardV2['work']['state'], string> = {
  idle: '○ Нет работы',
  queued: '⏳ В очереди',
  running: '🔍 Ревью',
  waiting_dep: '⏸ Ждёт зависимости',
  done: '✔ Готово',
  failed: '✘ Ошибка',
  cancelled: '○ Отменено',
};
// #endregion END_WORK_LABEL

// #region START_ACCENT_STYLE — invariant: one CSS class per attention emoji
const ACCENT_STYLE: Record<Attention, string> = {
  '⏳': 'v2-accent-review',
  '💬': 'v2-accent-reply',
  '🔀': 'v2-accent-rereview',
  '✅': 'v2-accent-approve',
  '😴': 'v2-accent-sleeping',
};
// #endregion END_ACCENT_STYLE

/**
 * @purpose Visible work state timer: ticks while the review task is running or queued.
 * @invariant Timer does not tick for done/failed/idle states (startedAt retained on those).
 * @param startedAt ISO timestamp of task start, or null.
 * @param isLive Whether the task is in an active (running/queued) state.
 * @returns Elapsed time string in mm:ss format, or null when not live.
 */
function useLiveTimer(startedAt: string | null, isLive: boolean): string | null {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!isLive || startedAt == null) return;
    const anchor = new Date(startedAt).getTime();
    const tick = (): void => setElapsed(Math.floor((Date.now() - anchor) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isLive]);

  if (!isLive || startedAt == null) return null;
  return `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
}

/**
 * @purpose Compact chip showing the primary attention or work state — one simultaneous reason for action.
 * @invariant Non-colour status cue: label is always visible regardless of colour rendering.
 * @param props MR attention and work state.
 */
export function ReviewStateChip(props: {
  attention: Attention;
  workState: MrCardV2['work']['state'];
  workLabel: string;
}) {
  const isWorking = props.workState === 'running' || props.workState === 'queued';
  const chipClass = isWorking
    ? 'v2-chip-work'
    : `v2-chip-attention v2-chip-${props.attention.codePointAt(0)?.toString(16)}`;
  return (
    <span
      className={`v2-state-chip ${chipClass}`}
      aria-label={isWorking ? props.workLabel : `Статус: ${props.attention}`}
    >
      {isWorking ? props.workLabel : props.attention}
    </span>
  );
}

/**
 * @purpose Unique compact MR card with lifecycle controls and state chip.
 * @invariant MR appears in exactly one queue; deduplication is server-side.
 * @invariant Complete visible only for merged or closed lifecycle; Update description always visible.
 * @invariant Non-colour status cues: all counter labels include text, not only icons.
 * @param props Card data, navigation callback, and lifecycle control callbacks.
 */
export function ReviewMrCard(props: {
  card: MrCardV2;
  onOpen: (ref: string) => void;
  onComplete?: (ref: string) => Promise<void>;
  onUpdateDescription?: (ref: string) => Promise<void>;
}) {
  const { card, onOpen } = props;
  const isLive = card.work.state === 'running' || card.work.state === 'queued';
  const timerText = useLiveTimer(card.work.startedAt, isLive);
  const lifecycle = card.lifecycle ?? 'open';
  const showComplete = lifecycle === 'merged' || lifecycle === 'closed';

  return (
    <article className="v2-card" aria-label={`MR ${card.ref}: ${card.title}`}>
      <button
        className="v2-card-main"
        onClick={() => onOpen(card.ref)}
        aria-label={`Открыть ${card.ref}`}
      >
        <span className={ACCENT_STYLE[card.attention]} aria-hidden="true" />
        <span className="v2-card-row">
          <ReviewStateChip
            attention={card.attention}
            workState={card.work.state}
            workLabel={card.work.label}
          />
          <b aria-label={`MR: ${card.ref}`}>{card.ref}</b>
          {card.counters.newCommits > 0 && (
            <em aria-label={`${card.counters.newCommits} новых коммитов`}>
              🔀 {card.counters.newCommits}
            </em>
          )}
          <span aria-label={`${card.counters.unread} непрочитанных`}>
            📬 {card.counters.unread}
          </span>
        </span>
        <strong className="v2-card-title">{card.title}</strong>
        <span className="v2-card-row v2-card-counters">
          <span aria-label={`Аппрувы: ${card.counters.approvals}`}>
            ✅ {card.counters.approvals}
          </span>
          {' · '}
          <span
            aria-label={`Ревьюеры: ${card.counters.reviewers.filter((r) => r.voted).length} из ${card.counters.reviewers.length}`}
          >
            👁 {card.counters.reviewers.filter((r) => r.voted).length}/
            {card.counters.reviewers.length}
          </span>
          {' · '}
          <span aria-label={`CI: ${card.counters.ci ?? 'нет данных'}`}>
            🏗 {card.counters.ci ?? '—'}
          </span>
          {' · '}
          <span aria-label={`Треды: ${card.counters.threads}`}>💬 {card.counters.threads}</span>
          {' · '}
          <span aria-label={`Ждут меня: ${card.counters.awaitingMe}`}>
            ⏳ {card.counters.awaitingMe} мне
          </span>
        </span>
        <span className="v2-work" aria-label={`Работа: ${WORK_LABEL[card.work.state]}`}>
          {WORK_LABEL[card.work.state]} · {card.work.label}
          {card.work.taskId ? ` ${card.work.taskId}` : ''}
          {timerText != null && (
            <span className="v2-timer" aria-label={`Прошло: ${timerText}`}>
              {' '}
              · ⏱ {timerText}
            </span>
          )}
        </span>
      </button>

      <div className="v2-card-controls">
        <button
          className="v2-card-control"
          onClick={() => void props.onUpdateDescription?.(card.ref)}
          aria-label={`Обновить описание MR ${card.ref}`}
          title="Обновить описание"
        >
          Обновить описание
        </button>
        {showComplete && (
          <button
            className="v2-card-control v2-card-control-complete"
            onClick={() => void props.onComplete?.(card.ref)}
            aria-label={`Завершить MR ${card.ref}`}
            title="Завершить"
          >
            Завершить
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * @purpose Two-queue responsibility board: Review and Mine/Assigned, each sorted by attention priority.
 * @invariant Each MR appears in exactly one queue; deduplication is server-side (queue-split by role client-side).
 * @param props Board cards, sync state, last-update timestamp, and navigation/action callbacks.
 */
export function ResponsibilityQueue(props: {
  cards: MrCardV2[];
  syncState: 'ok' | 'degraded' | 'syncing';
  lastUpdated?: number | null;
  onOpen: (ref: string) => void;
  onComplete?: (ref: string) => Promise<void>;
  onUpdateDescription?: (ref: string) => Promise<void>;
}) {
  const reviewCards = sortByPriority(
    props.cards.filter((card) => resolveQueueColumn(card.myRole) === 'review')
  );
  const mineCards = sortByPriority(
    props.cards.filter((card) => resolveQueueColumn(card.myRole) === 'mine')
  );

  return (
    <main className="v2-board">
      <header className="v2-board-header">
        <span className="v2-board-title">
          Agent Inbox
          <span className="v2-sync-dot" data-sync={props.syncState} aria-hidden="true" />
          <small aria-live="polite">
            {props.syncState === 'syncing'
              ? 'синхронизация…'
              : props.syncState === 'ok'
                ? 'ok'
                : 'degraded'}
            {props.lastUpdated != null
              ? ` · обновлено ${Math.round((Date.now() - props.lastUpdated) / 1000)}с назад`
              : ''}
          </small>
        </span>
      </header>

      {props.syncState === 'degraded' && (
        <div className="v2-degraded" role="status">
          ⚠ Синхронизация на паузе: показаны последние подтверждённые данные
        </div>
      )}

      {props.syncState === 'syncing' && (
        <div className="v2-syncing" role="status">
          ⏳ Идёт первая синхронизация с GitLab
        </div>
      )}

      <div className="v2-queues">
        <section className="v2-queue" aria-label="Ревью">
          <h2 className="v2-queue-heading">
            Ревью{' '}
            <span className="v2-queue-count" aria-label={`${reviewCards.length} MR`}>
              {reviewCards.length}
            </span>
          </h2>
          {reviewCards.length === 0 ? (
            <div className="v2-lane-empty" aria-label="Очередь пуста">
              <span>done_all</span>
              <span>пусто</span>
            </div>
          ) : (
            reviewCards.map((card) => (
              <ReviewMrCard
                key={card.ref}
                card={card}
                onOpen={props.onOpen}
                onComplete={props.onComplete}
                onUpdateDescription={props.onUpdateDescription}
              />
            ))
          )}
        </section>

        <section className="v2-queue" aria-label="Мои / назначенные">
          <h2 className="v2-queue-heading">
            Мои / назначенные{' '}
            <span className="v2-queue-count" aria-label={`${mineCards.length} MR`}>
              {mineCards.length}
            </span>
          </h2>
          {mineCards.length === 0 ? (
            <div className="v2-lane-empty" aria-label="Очередь пуста">
              <span>done_all</span>
              <span>пусто</span>
            </div>
          ) : (
            mineCards.map((card) => (
              <ReviewMrCard
                key={card.ref}
                card={card}
                onOpen={props.onOpen}
                onComplete={props.onComplete}
                onUpdateDescription={props.onUpdateDescription}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}
