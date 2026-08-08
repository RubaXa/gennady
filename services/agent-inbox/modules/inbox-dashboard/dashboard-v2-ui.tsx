// @file: DashboardV2Ui — loading, attention board, feed widgets, and permanent chat column.
// @consumers: App
// @tasks: TSK-164

import { useEffect, useMemo, useState } from 'react';
import type {
  Attention,
  BootV2,
  ChatTranscriptTurn,
  FeedWidget,
  MrCardV2,
  MrStateV2,
} from './v2-types.ts';

const GROUPS: { key: Attention; label: string }[] = [
  { key: '⏳', label: 'ЖДУТ МОЁ РЕВЬЮ' },
  { key: '💬', label: 'ЖДУТ МОЙ ОТВЕТ' },
  { key: '🔀', label: 'ЖДУТ РЕ-РЕВЬЮ' },
  { key: '✅', label: 'ЖДУТ АППРУВ / РЕЗОЛВ' },
  { key: '😴', label: 'ЖДУТ ДРУГИХ' },
];

const workLabel: Record<MrCardV2['work']['state'], string> = {
  idle: '○ Нет работы',
  queued: '⏳ В очереди',
  running: '🔍 Ревью',
  waiting_dep: '⏸ Ждёт зависимости',
  done: '✔ Готово',
  failed: '❌ Ошибка',
  cancelled: '○ Отменено',
};

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
 * @purpose Four-row canonical card A: identity, title, counters, durable work.
 * @param props Canonical card and board navigation callback.
 */
export function MrCard(props: { card: MrCardV2; onOpen: (ref: string) => void }) {
  const { card, onOpen } = props;
  return (
    <button className="v2-card" onClick={() => onOpen(card.ref)} aria-label={`Открыть ${card.ref}`}>
      <span>
        👤 {card.author} · {card.myRole ?? 'нет роли'} <b>{card.ref}</b> <em>{card.attention}</em>{' '}
        📬{card.counters.unread}
      </span>
      <strong>{card.title}</strong>
      <span>
        ✅ {card.counters.approvals} · 👁{' '}
        {card.counters.reviewers.filter((reviewer) => reviewer.voted).length}/
        {card.counters.reviewers.length} · 🏗 {card.counters.ci ?? '—'} · 💬 {card.counters.threads}{' '}
        · ⏳{card.counters.awaitingMe} мне
      </span>
      <span className="v2-work">
        {workLabel[card.work.state]} · {card.work.label}
        {card.work.taskId ? ` ${card.work.taskId}` : ''}
      </span>
    </button>
  );
}

/**
 * @purpose Render every stable attention group, retaining visibly empty lanes and degraded state.
 * @param props Board projection and MR navigation callback.
 */
export function AttentionBoard(props: {
  cards: MrCardV2[];
  syncState: 'ok' | 'degraded';
  onOpen: (ref: string) => void;
}) {
  return (
    <main className="v2-board">
      {props.syncState === 'degraded' && (
        <div className="v2-degraded" role="status">
          ⚠ Синхронизация на паузе: показаны последние подтверждённые данные
        </div>
      )}
      <header>
        <p className="v2-kicker">ATTENTION BOARD</p>
        <h1>Доска внимания</h1>
      </header>
      {GROUPS.map((group) => {
        const cards = props.cards.filter((card) => card.attention === group.key);
        return (
          <section
            className={group.key === '😴' ? 'v2-group sleeping' : 'v2-group'}
            key={group.key}
          >
            <h2>
              {group.key} {group.label} <small>{cards.length}</small>
            </h2>
            <div className="v2-card-grid">
              {cards.length ? (
                cards.map((card) => <MrCard key={card.ref} card={card} onOpen={props.onOpen} />)
              ) : (
                <p className="v2-empty">пусто</p>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}

/**
 * @purpose Render one server-owned feed widget and expose only its allowed actions.
 * @param props Widget projection, action callback, pending state, and anchor selection callback.
 * @returns Widget markup or null for resolved one-shot widgets.
 */
function Widget(props: {
  widget: FeedWidget;
  onAction: (type: string) => void;
  pending: string | null;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
}) {
  const { widget, onAction, pending, onSelectAnchor } = props;
  if (widget.type === 'action' && widget.resolved) return null;
  const items = Array.isArray(widget.payload.items)
    ? (widget.payload.items as Record<string, unknown>[])
    : [];
  const heading: Record<FeedWidget['type'], string> = {
    findings: '🔍 Находки',
    threads: '💬 Треды ждут меня',
    artifact: '📄 Артефакт-пост',
    gitlab: '🦊 GitLab-событие',
    plan: '📋 Текущий план',
    progress: '🔧 Прогресс',
    action: '⚡ Действие',
  };
  return (
    <article
      className="v2-widget"
      data-widget-type={widget.type}
      onMouseUp={(event) => {
        const quote = window.getSelection()?.toString().trim();
        if (!quote) return;
        // A selected quote belongs to the concrete widget and element under the pointer, rather
        // than arbitrarily inheriting the first durable anchor on a multi-anchor widget.
        const target =
          event.target instanceof HTMLElement ? event.target.closest('[data-anchor-id]') : null;
        const elementId = target?.getAttribute('data-anchor-id') ?? undefined;
        const anchor = widget.anchors.find(
          (candidate) => !elementId || candidate.elementId === elementId
        );
        if (anchor) onSelectAnchor({ ...anchor, quote, fragment: { start: 0, end: quote.length } });
      }}
    >
      <header>
        <h3>{heading[widget.type]}</h3>
        <time>{new Date(widget.lastActivity).toLocaleTimeString()}</time>
      </header>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li
              key={String(item.id ?? item.threadId ?? index)}
              data-anchor-id={String(item.id ?? item.threadId ?? '')}
            >
              {String(item.summary ?? item.quote ?? item.event ?? JSON.stringify(item))}
              {widget.type === 'threads' && (
                <button
                  disabled={String(item.author) !== 'operator' && String(item.author) !== 'bot'}
                  title={
                    String(item.author) !== 'operator' && String(item.author) !== 'bot'
                      ? 'Только свои или bot-треды'
                      : ''
                  }
                  onClick={() => onAction('effect_resolve')}
                >
                  👍+резолв
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {String(
            widget.payload.title ??
              widget.payload.effect ??
              widget.payload.stage ??
              widget.payload.event ??
              'Нет новых данных'
          )}
        </p>
      )}
      {widget.type === 'findings' && (
        <div className="v2-actions">
          <button onClick={() => onAction('fact_check')}>✅ фактчек</button>
          <button onClick={() => onAction('deepen')}>🔎 углубить</button>
          <button onClick={() => onAction('widen_search')}>🌐 вширь</button>
        </div>
      )}
      {pending && <p className="v2-pending">⏳ {pending}</p>}
    </article>
  );
}

/**
 * @purpose Render the MR feed with server-read unread boundary and anchor handoff.
 * @param props Current MR state, action callback, pending state, and anchor selection callback.
 */
export function FeedList(props: {
  state: MrStateV2 | null;
  onAction: (type: string) => void;
  pending: string | null;
  onSelectAnchor?: (anchor: FeedWidget['anchors'][number]) => void;
}) {
  const widgets = useMemo(() => props.state?.widgets ?? [], [props.state]);
  const unreadIndex = widgets.findIndex((widget) => widget.unread);
  return (
    <section className="v2-feed" aria-label="Лента MR">
      {widgets.length === 0 ? (
        <p className="v2-empty">лента пуста</p>
      ) : (
        widgets.map((widget, index) => (
          <div key={widget.widgetId}>
            {index === unreadIndex && <p className="v2-divider">Новое с прошлого визита</p>}
            <Widget
              widget={widget}
              onAction={props.onAction}
              pending={props.pending}
              onSelectAnchor={props.onSelectAnchor ?? (() => undefined)}
            />
          </div>
        ))
      )}
    </section>
  );
}

/**
 * @purpose Show the selected durable anchor and submit an MR-scoped chat request.
 * @param props Active MR, connection state, selected anchor, and asynchronous submission callback.
 */
export function ChatColumn(props: {
  refName: string | null;
  disconnected: boolean;
  anchor: FeedWidget['anchors'][number] | null;
  transcript: ChatTranscriptTurn[];
  streamingText: string;
  pendingQuestion: string | null;
  onDecision: (proposalId: string, verdict: 'accept' | 'edit' | 'reject') => Promise<void>;
  onUndo: (snapshotId: string) => Promise<void>;
  /** @purpose Actual server-created snapshot id for the latest compensable mutation. */
  undoSnapshotId: string | null;
  onSubmit: (text: string, anchor: FeedWidget['anchors'][number] | null) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <aside className="v2-chat" aria-label="Чат">
      <header>
        <b>💬 Чат</b>
        <small>{props.refName ?? 'контекст доски'}</small>
      </header>
      {props.disconnected && <p className="v2-error">Соединение потеряно — идёт восстановление</p>}
      <div className="v2-chat-body">
        {props.transcript.map((turn) => (
          <div key={turn.turnId} className={`v2-chat-turn ${turn.role}`}>
            <b>{turn.role === 'operator' ? 'Вы' : 'Агент'}</b>
            <p>{turn.text}</p>
          </div>
        ))}
        {props.pendingQuestion && (
          <p className="v2-chat-turn operator">Вы: {props.pendingQuestion}</p>
        )}
        {props.streamingText && (
          <p className="v2-chat-turn assistant" aria-live="polite">
            Агент: {props.streamingText}
          </p>
        )}
        {props.anchor ? (
          <p className="v2-selection-pill" aria-label="Якорь вопроса">
            💬 Спросить: {props.anchor.quote ?? props.anchor.elementId ?? props.anchor.widgetId}
          </p>
        ) : (
          <p className="v2-muted">Выделите фрагмент, чтобы спросить с якорем.</p>
        )}
      </div>
      <div className="v2-decision-actions" aria-label="Решение по предложению">
        <button onClick={() => void props.onDecision('current', 'accept')}>Принять</button>
        <button onClick={() => void props.onDecision('current', 'reject')}>Отклонить</button>
        <button
          disabled={!props.undoSnapshotId}
          title={
            props.undoSnapshotId
              ? 'Откатить последнее применённое изменение'
              : 'Нет применённого изменения для отката'
          }
          onClick={() => props.undoSnapshotId && void props.onUndo(props.undoSnapshotId)}
        >
          Отменить
        </button>
      </div>
      <div className="v2-chips">
        <button>Спросить</button>
        <button>Объяснить</button>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const question = text.trim();
          if (!question || !props.refName) return;
          setError(null);
          try {
            await props.onSubmit(question, props.anchor);
            setText('');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Не удалось отправить вопрос');
          }
        }}
      >
        <input
          aria-label="Вопрос в чат"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Спросить про MR…"
        />
        <button disabled={!text.trim()}>Отправить</button>
      </form>
      {error && (
        <p className="v2-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}

/**
 * @purpose Compact header informer for the currently opened MR and its server-owned counters.
 * @param props MR card projection.
 */
export function HeaderInformer(props: { card: MrCardV2 | undefined }) {
  if (!props.card) return <p className="v2-muted">Загружаю состояние MR…</p>;
  return (
    <section className="v2-header-informer" aria-label="Информер MR">
      <span>✅ {props.card.counters.approvals}</span>
      <span>👁 {props.card.counters.reviewers.filter((reviewer) => reviewer.voted).length}</span>
      <span>🏗 {props.card.counters.ci ?? '—'}</span>
      <span>💬 {props.card.counters.threads}</span>
      <span>🔀 {props.card.counters.newCommits}</span>
      <span>📬 {props.card.counters.unread}</span>
    </section>
  );
}

/**
 * @purpose Compose the opened MR header, informer, and server-projected feed.
 * @param props MR route state and feed interaction callbacks.
 */
export function MrFeedScreen(props: {
  refName: string;
  state: MrStateV2 | null;
  onBack: () => void;
  onAction: (type: string) => void;
  pending: string | null;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
}) {
  return (
    <main className="v2-mr">
      <header>
        <button onClick={props.onBack}>← Доска</button>
        <p className="v2-kicker">{props.refName}</p>
        <h1>{props.state?.card?.title ?? 'Загрузка MR…'}</h1>
        <HeaderInformer card={props.state?.card} />
      </header>
      <FeedList
        state={props.state}
        onAction={props.onAction}
        pending={props.pending}
        onSelectAnchor={props.onSelectAnchor}
      />
    </main>
  );
}

/**
 * @purpose Subscribe to MR SSE; disconnected caller owns batch reconciliation.
 * @param refName Active MR reference, or null on the board.
 * @param onFrame Reconciliation callback for every relevant server frame.
 * @param [onToken] Incremental assistant token callback.
 * @param [onTurnDone] Durable assistant completion callback.
 * @param [onMutation] Server-issued snapshot callback used by the compensating undo action.
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
    const refresh = () => {
      setDisconnected(false);
      onFrame();
    };
    // EventSource reconnect success does not require an application frame. Clear the visible
    // outage banner at transport-open time; the subsequent state refresh keeps data authoritative.
    source.onopen = () => {
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
      try {
        const frame = JSON.parse((event as MessageEvent<string>).data) as { token?: string };
        if (frame.token) onToken?.(frame.token);
      } catch {
        /* malformed frame is reconciled through /api/state */
      }
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
    source.onerror = () => setDisconnected(true);
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
