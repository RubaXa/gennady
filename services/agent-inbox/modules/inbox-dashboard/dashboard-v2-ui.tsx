// @file: DashboardV2Ui — loading screen, SSE hook, backoff, and backward-compat re-exports.
// @consumers: App, dashboard-v2.contract.test.tsx, feed-lifecycle.test.tsx, optimistic.test.tsx
// @tasks: TSK-164, TSK-169, TSK-182

import { useEffect, useState } from 'react';
import type { BootV2, ChatTranscriptTurn, MrCardV2 } from './v2-types.ts';

// #region START_WORK_LABEL — invariant: every WorkState maps to a non-empty display string
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
const ACCENT_STYLE: Record<string, string> = {
  '⏳': 'v2-accent-review',
  '💬': 'v2-accent-reply',
  '🔀': 'v2-accent-rereview',
  '✅': 'v2-accent-approve',
  '😴': 'v2-accent-sleeping',
};
// #endregion END_ACCENT_STYLE

/**
 * @purpose Visible bootstrap state: never mistakes an error for an empty dashboard.
 * @param props Boot projection and operator actions.
 */
export function LoadingScreen(props: {
  boot: BootV2 | null;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const { boot, onOpen, onRetry } = props;
  const phases = ['connect', 'poll', 'reconcile', 'restore'];
  return (
    <main className="v2-loading" aria-label="Загрузка inbox">
      <section>
        <p className="v2-kicker">GENNADY / INBOX</p>
        <h1>Подготавливаю машину ревью</h1>
        <div className="v2-phases">
          {phases.map((phase) => (
            <div key={phase} className={boot?.phase === phase ? 'active' : ''}>
              {boot?.ready || phases.indexOf(phase) < phases.indexOf(boot?.phase ?? '')
                ? '✓'
                : boot?.phase === phase
                  ? '⏳'
                  : '○'}{' '}
              <span>{phase}</span>
            </div>
          ))}
        </div>
        {boot?.error ? (
          <div role="alert" className="v2-error">
            {boot.error}
            <button onClick={onRetry}>Повторить</button>
          </div>
        ) : (
          <p>{boot?.progress?.label ?? 'Подключение к рабочему состоянию…'}</p>
        )}
        <button className="v2-secondary" onClick={onOpen}>
          Открыть сейчас (read-only)
        </button>
      </section>
    </main>
  );
}

/**
 * @purpose Live-ticking verification timer for running/queued work state.
 * @invariant Does not tick when work is done/failed — startedAt is retained on those states.
 * @param startedAt ISO start timestamp, or null.
 * @param isLive Whether the work is currently running or queued.
 * @returns Elapsed in mm:ss, or null when not live.
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
 * @purpose Four-row canonical card with left accent bar for the attention group.
 * @param props Canonical card and board navigation callback.
 */
export function MrCard(props: { card: MrCardV2; onOpen: (ref: string) => void }) {
  const { card, onOpen } = props;
  const roleIcon = card.myRole === 'author' ? '👤' : card.myRole === 'reviewer' ? '👁' : null;
  const isLive = card.work.state === 'running' || card.work.state === 'queued';
  const timerText = useLiveTimer(card.work.startedAt, isLive);

  return (
    <button className="v2-card" onClick={() => onOpen(card.ref)} aria-label={`Открыть ${card.ref}`}>
      <span className={ACCENT_STYLE[card.attention] ?? ''} aria-hidden="true" />
      <span className="v2-card-row">
        {roleIcon && <span aria-hidden="true">{roleIcon}</span>}
        <span aria-hidden="true">{card.attention}</span>
        <b>{card.ref}</b>
        <span className="v2-card-author">{card.author}</span>
        {card.counters.newCommits > 0 && (
          <em aria-label={`${card.counters.newCommits} новых коммитов`}>
            🔀{card.counters.newCommits}
          </em>
        )}
        <span aria-label={`${card.counters.unread} непрочитанных`}>📬{card.counters.unread}</span>
      </span>
      <strong>{card.title}</strong>
      <span className="v2-card-row">
        ✅ {card.counters.approvals} · 👁 {card.counters.reviewers.filter((r) => r.voted).length}/
        {card.counters.reviewers.length} · 🏗 {card.counters.ci ?? '—'} · 💬 {card.counters.threads}
        {' · '}⏳{card.counters.awaitingMe} мне
      </span>
      <span className="v2-work">
        {WORK_LABEL[card.work.state]} · {card.work.label}
        {card.work.taskId ? ` ${card.work.taskId}` : ''}
        {timerText != null && <span className="v2-timer"> · ⏱{timerText}</span>}
      </span>
    </button>
  );
}

// Re-export FeedList from the new canonical location so existing tests keep working.
export { FeedList } from './workspace/widgets/ReviewFeed.tsx';

/**
 * @purpose Subscribe to MR SSE; disconnected caller owns batch reconciliation.
 * @param refName Active MR reference, or null on the board.
 * @param onFrame Reconciliation callback for every relevant server frame.
 * @param [onToken] Incremental assistant token callback.
 * @param [onTurnDone] Durable assistant completion callback.
 * @param [onMutation] Server-issued snapshot callback for compensating undo.
 * @returns Whether the stream is currently disconnected.
 */
export function useMrStream(
  refName: string | null,
  onFrame: () => void,
  onToken?: (token: string) => void,
  onTurnDone?: (turn: ChatTranscriptTurn) => void,
  onMutation?: (snapshotId: string) => void
): boolean {
  const [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    if (!refName) return;
    const source = new EventSource(`/api/mr/${encodeURIComponent(refName)}/stream`);
    const refresh = (): void => {
      setDisconnected(false);
      onFrame();
    };
    // EventSource reconnect success clears the outage banner without waiting for the data frame.
    source.onopen = (): void => {
      setDisconnected(false);
      onFrame();
    };
    [
      'task_update',
      'widget_update',
      'board_hint',
      'mutation',
      'refresh',
      'dryrun',
      'error',
      'token',
      'turn_done',
    ].forEach((name) => source.addEventListener(name, refresh));

    source.addEventListener('token', (event) => {
      // #region START_TOKEN_PARSE — failure mode: malformed frame reconciled through /api/state
      try {
        const frame = JSON.parse((event as MessageEvent<string>).data) as { token?: string };
        if (frame.token) onToken?.(frame.token);
      } catch {
        /* malformed frame is reconciled through /api/state */
      }
      // #endregion END_TOKEN_PARSE
    });

    source.addEventListener('turn_done', (event) => {
      try {
        const frame = JSON.parse((event as MessageEvent<string>).data) as {
          turn?: { id: string; answer: string };
        };
        if (frame.turn)
          onTurnDone?.({ turnId: frame.turn.id, role: 'assistant', text: frame.turn.answer });
      } catch {
        /* durable state refresh remains authoritative */
      }
    });

    source.addEventListener('mutation', (event) => {
      try {
        const frame = JSON.parse((event as MessageEvent<string>).data) as { snapshotId?: string };
        // Undo is valid only for the concrete snapshot created by this mutation, never a guessed
        // sentinel such as "latest" that could compensate another artifact's change.
        if (frame.snapshotId) onMutation?.(frame.snapshotId);
      } catch {
        /* the regular refresh still reconciles durable state */
      }
    });

    source.onerror = (): void => setDisconnected(true);
    return () => source.close();
  }, [refName, onFrame, onToken, onTurnDone, onMutation]);
  return disconnected;
}

/**
 * @purpose Calculate bounded state-reconciliation delay after an SSE failure.
 * @param previousMs Previous delay in milliseconds.
 * @param recovered Whether the latest batch reconciliation succeeded.
 * @returns Base 3s delay after recovery, otherwise exponential delay capped at 30s.
 */
export function sseBackoffMs(previousMs: number, recovered: boolean): number {
  return recovered ? 3000 : Math.min(Math.max(previousMs, 3000) * 2, 30000);
}
