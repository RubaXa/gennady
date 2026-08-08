// @file: DashboardV2Ui — loading, attention board, feed widgets, and permanent chat column.
// @consumers: App
// @tasks: TSK-164 TSK-169

import { useEffect, useMemo, useState } from 'react';
import type {
  Attention,
  BootV2,
  ChatTranscriptTurn,
  FeedWidget,
  MrCardV2,
  MrStateV2,
} from './v2-types.ts';

const ACTIVE_GROUPS: { key: Attention; label: string }[] = [
  { key: '⏳', label: 'ЖДУТ МОЁ РЕВЬЮ' },
  { key: '💬', label: 'ЖДУТ МОЙ ОТВЕТ' },
  { key: '🔀', label: 'ЖДУТ РЕ-РЕВЬЮ' },
  { key: '✅', label: 'ЖДУТ АППРУВ / РЕЗОЛВ' },
];

const ACCENT_STYLE: Record<Attention, string> = {
  '⏳': 'v2-accent-review',
  '💬': 'v2-accent-reply',
  '🔀': 'v2-accent-rereview',
  '✅': 'v2-accent-approve',
  '😴': 'v2-accent-sleeping',
};

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
 * @purpose Four-row canonical card A with left accent bar for the attention group.
 * @param props Canonical card and board navigation callback.
 */
export function MrCard(props: { card: MrCardV2; onOpen: (ref: string) => void }) {
  const { card, onOpen } = props;
  const roleIcon = card.myRole === 'author' ? '👤' : card.myRole === 'reviewer' ? '👁' : null;
  const [elapsed, setElapsed] = useState(0);
  const startedAt = card.work.startedAt ? new Date(card.work.startedAt).getTime() : null;
  useEffect(() => {
    setElapsed(0);
    if (startedAt == null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  const timerText =
    startedAt != null
      ? `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
      : null;
  return (
    <button className="v2-card" onClick={() => onOpen(card.ref)} aria-label={`Открыть ${card.ref}`}>
      <span className={ACCENT_STYLE[card.attention]} />
      <span className="v2-card-row">
        {roleIcon && <span>{roleIcon}</span>}
        <span>{card.attention}</span>
        <b>{card.ref}</b>
        {card.counters.newCommits > 0 && <em>🔀{card.counters.newCommits}</em>}
        <span>📬{card.counters.unread}</span>
      </span>
      <strong>{card.title}</strong>
      <span className="v2-card-row">
        ✅ {card.counters.approvals} · 👁{' '}
        {card.counters.reviewers.filter((reviewer) => reviewer.voted).length}/
        {card.counters.reviewers.length} · 🏗 {card.counters.ci ?? '—'} · 💬 {card.counters.threads}{' '}
        · ⏳{card.counters.awaitingMe} мне
      </span>
      <span className="v2-work">
        {workLabel[card.work.state]} · {card.work.label}
        {card.work.taskId ? ` ${card.work.taskId}` : ''}
        {timerText != null && <span className="v2-timer"> · ⏱{timerText}</span>}
      </span>
    </button>
  );
}

/**
 * @purpose Render every stable attention group as horizontal kanban lanes with accent bars, plus a 64px sleeping rail.
 * @param props Board projection, last-updated timestamp, and MR navigation callback.
 */
export function AttentionBoard(props: {
  cards: MrCardV2[];
  syncState: 'ok' | 'degraded' | 'syncing';
  lastUpdated?: number | null;
  onOpen: (ref: string) => void;
}) {
  const sleeping = props.cards.filter((card) => card.attention === '😴');
  const sleepFire = sleeping.filter(
    (card) => card.counters.newCommits > 0 || card.counters.awaitingMe > 0
  ).length;
  return (
    <main className="v2-board">
      <header className="v2-board-header">
        <span className="v2-board-title">
          Agent Inbox v2 <span className="v2-sync-dot" data-sync={props.syncState} />
          <small>
            {props.syncState === 'syncing'
              ? 'синхронизация…'
              : props.syncState === 'ok'
                ? 'ok'
                : 'degraded'}{' '}
            {props.lastUpdated != null
              ? `· обновлено ${Math.round((Date.now() - props.lastUpdated) / 1000)}с назад`
              : ''}
          </small>
        </span>
        <nav className="v2-tabs" role="tablist">
          <button role="tab" aria-selected="true">
            Board
          </button>
          <button
            role="tab"
            aria-selected="false"
            disabled
            aria-label="Active MR view (not yet routed)"
          >
            Active MR
          </button>
          <button
            role="tab"
            aria-selected="false"
            disabled
            aria-label="Queue view (not yet routed)"
          >
            Queue
          </button>
        </nav>
      </header>
      {props.syncState === 'degraded' && (
        <div className="v2-degraded" role="status">
          ⚠ Синхронизация на паузе: показаны последние подтверждённые данные
        </div>
      )}
      {props.syncState === 'syncing' && (
        <div className="v2-syncing" role="status">
          ⏳ Идёт первая синхронизация с GitLab — на большом инбоксе это занимает пару минут
        </div>
      )}
      <div className="v2-lanes">
        {ACTIVE_GROUPS.map((group) => {
          const cards = props.cards.filter((card) => card.attention === group.key);
          return (
            <div className="v2-lane" key={group.key}>
              <h2>
                {group.key} {group.label} <small>{cards.length}</small>
              </h2>
              {cards.length > 0 ? (
                cards.map((card) => <MrCard key={card.ref} card={card} onOpen={props.onOpen} />)
              ) : (
                <div className="v2-lane-empty">
                  <span className="v2-empty-icon">done_all</span>
                  <span>пусто</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <aside className="v2-rail" aria-label="ждут других">
        <span className="v2-rail-label">ЖДУТ ДРУГИХ</span>
        <span className="v2-rail-count">{sleeping.length}</span>
        {sleepFire > 0 && <span className="v2-rail-fire">🔥{sleepFire}</span>}
      </aside>
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

  if (widget.type === 'findings') {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [showHidden, setShowHidden] = useState(false);
    const toggleExpand = (id: string) =>
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    const visible = items.filter((item) => !item.hidden);
    const hidden = items.filter((item) => item.hidden);
    const factchecked = items.filter((item) => String(item.factcheck) === 'verified').length;
    return (
      <article
        className="v2-widget"
        data-widget-type="findings"
        onMouseUp={(event) => {
          const quote = window.getSelection()?.toString().trim();
          if (!quote) return;
          const target =
            event.target instanceof HTMLElement ? event.target.closest('[data-anchor-id]') : null;
          const elementId = target?.getAttribute('data-anchor-id') ?? undefined;
          const anchor = widget.anchors.find(
            (candidate) => !elementId || candidate.elementId === elementId
          );
          if (anchor)
            onSelectAnchor({ ...anchor, quote, fragment: { start: 0, end: quote.length } });
        }}
      >
        <header>
          <h3>
            {heading[widget.type]} ({items.length}) · factcheck {factchecked}/{items.length}
          </h3>
          <time>{new Date(widget.lastActivity).toLocaleTimeString()}</time>
        </header>
        {visible.map((item, index) => {
          const id = String(item.id ?? index);
          const severity = String(item.severity ?? '');
          const severityLabel =
            severity.toUpperCase() === 'HIGH' || severity === 'high' ? 'HIGH' : 'MED';
          const severityClass =
            severity.toUpperCase() === 'HIGH' || severity === 'high'
              ? 'v2-finding-badge-high'
              : 'v2-finding-badge-med';
          const file = item.file ? String(item.file) : '';
          const line = item.line != null ? String(item.line) : '';
          const location = file ? (line ? `${file}:${line}` : file) : '';
          const diffLines = Array.isArray(item.diff)
            ? (item.diff as { type: string; num?: number; text: string }[])
            : [];
          return (
            <div key={id} data-anchor-id={id}>
              <div
                className="v2-finding-row"
                onClick={() => toggleExpand(id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') toggleExpand(id);
                }}
              >
                <span className={`v2-finding-badge ${severityClass}`}>{severityLabel}</span>
                <span className="v2-finding-summary">{String(item.summary ?? '')}</span>
                <span className="v2-finding-location">{location}</span>
                <span className="v2-finding-toggle">{expandedIds.has(id) ? '▴' : '▾'}</span>
              </div>
              {expandedIds.has(id) && (
                <div className="v2-finding-diff">
                  {file ? (
                    <div className="v2-finding-diff-header">
                      <span>{location}</span>
                      <span>in GitLab ↗</span>
                    </div>
                  ) : null}
                  {diffLines.length > 0 ? (
                    <div className="v2-finding-diff-lines">
                      {diffLines.map((dline, di) => (
                        <div key={di} className={`v2-finding-diff-line ${dline.type}`}>
                          <span className="v2-diff-num">{dline.num ?? ''}</span>
                          <span className="v2-diff-sign">
                            {dline.type === 'add' ? '+' : dline.type === 'remove' ? '-' : ''}
                          </span>
                          <span className="v2-diff-text">{dline.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="v2-finding-diff-lines">
                      <span
                        className="v2-diff-text"
                        style={{
                          padding: '8px 10px',
                          display: 'block',
                          color: 'var(--ds-secondary)',
                        }}
                      >
                        (diff-данные появятся после первого раунда ревью)
                      </span>
                    </div>
                  )}
                  <div className="v2-finding-diff-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction('post');
                      }}
                      title="Постить"
                    >
                      📮
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction('edit');
                      }}
                      title="Править"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction('delete');
                      }}
                      title="Удалить"
                    >
                      🗑
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction('deepen');
                      }}
                      title="Углубить"
                    >
                      🔎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction('widen_search');
                      }}
                      title="Вширь"
                    >
                      🌐
                    </button>
                  </div>
                  <div className={`v2-finding-factcheck ${String(item.factcheck ?? '')}`}>
                    {item.factcheck === 'verified' ? (
                      <>✔ Factcheck: Verified</>
                    ) : item.factcheck === 'debunked' ? (
                      <>✘ Factcheck: Debunked</>
                    ) : (
                      <>○ Factcheck: Pending</>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {items.length > 0 && (
          <div className="v2-finding-footer">
            <button onClick={() => onAction('post_selected')}>
              📮 Постить выбранные ({items.length})
            </button>
            <button onClick={() => onAction('fact_check')}>✅ Фактчек всех</button>
            <button onClick={() => onAction('widen_search')}>🌐 Вширь</button>
          </div>
        )}
        {hidden.length > 0 && (
          <div
            className="v2-finding-hidden"
            onClick={() => setShowHidden(!showHidden)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setShowHidden(!showHidden);
            }}
          >
            Скрытые ({hidden.length}) {showHidden ? '▴' : '▸'}
          </div>
        )}
        {showHidden && hidden.length > 0 && (
          <div style={{ padding: '4px 0' }}>
            {hidden.map((item, index) => (
              <div
                key={String(item.id ?? index)}
                className="v2-finding-row"
                style={{ opacity: 0.5 }}
              >
                <span className="v2-finding-badge v2-finding-badge-med">
                  {String(item.severity ?? 'MED')}
                </span>
                <span className="v2-finding-summary">{String(item.summary ?? '')}</span>
                <span className="v2-finding-location">{String(item.file ?? '')}</span>
                <span />
              </div>
            ))}
          </div>
        )}
        {pending && <p className="v2-pending">⏳ {pending}</p>}
      </article>
    );
  }

  if (widget.type === 'plan') {
    const stage = String(widget.payload.stage ?? widget.payload.title ?? '');
    const tracksDone = Number(widget.payload.tracksDone ?? 0);
    const tracksTotal = Number(widget.payload.tracksTotal ?? 0);
    const pct = tracksTotal > 0 ? Math.round((tracksDone / tracksTotal) * 100) : 0;
    const stages = [
      { key: 'logic', label: 'Logic Rev' },
      { key: 'tests', label: 'Tests Rev' },
      { key: 'security', label: 'Security Audit' },
    ];
    const queuePos =
      widget.payload.queuePosition != null ? Number(widget.payload.queuePosition) : null;
    return (
      <article className="v2-widget" data-widget-type="plan">
        <header>
          <h3>
            {heading[widget.type]} · {stage}
          </h3>
          <time>{new Date(widget.lastActivity).toLocaleTimeString()}</time>
        </header>
        <div className="v2-plan-flow">
          {stages.map((s, i) => {
            const done = tracksDone > i;
            const active = tracksDone === i;
            return (
              <span key={s.key}>
                {i > 0 && <span className="v2-plan-sep">──</span>}
                <span className={`v2-plan-stage ${done ? 'done' : active ? 'active' : 'pending'}`}>
                  {done ? '✔' : active ? '⏳' : '○'} {s.label}
                </span>
              </span>
            );
          })}
          {queuePos != null && (
            <span style={{ marginLeft: 'auto', color: 'var(--ds-secondary)', fontSize: '12px' }}>
              Queue: Pos {queuePos}
            </span>
          )}
        </div>
        {tracksTotal > 0 && (
          <div className="v2-plan-progress">
            <div className="v2-plan-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        {pending && <p className="v2-pending">⏳ {pending}</p>}
      </article>
    );
  }

  return (
    <article
      className="v2-widget"
      data-widget-type={widget.type}
      onMouseUp={(event) => {
        const quote = window.getSelection()?.toString().trim();
        if (!quote) return;
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
      {pending && <p className="v2-pending">⏳ {pending}</p>}
    </article>
  );
}

/**
 * @purpose Sticky decision bar pinned above the feed per §5′ of ux-mockups.
 * @param props Computed verdict data and decision/action callbacks.
 */
function StickyDecisionBar(props: {
  verdict: string;
  findingsCount: number;
  factchecked: number;
  onDecision: (action: 'skip' | 'edit' | 'post_all') => void;
}) {
  return (
    <div className="v2-sticky-bar" aria-label="Панель решения">
      <div className="v2-sticky-bar-label">
        ⚡ Ждёт решения: <b>{props.verdict}</b>
        {' · '}
        {props.findingsCount} находок
        {' · '}
        factcheck {props.factchecked}/{props.findingsCount}
      </div>
      <div className="v2-sticky-bar-actions">
        <button onClick={() => props.onDecision('skip')}>Skip</button>
        <button onClick={() => props.onDecision('edit')}>Edit</button>
        <button onClick={() => props.onDecision('post_all')}>Post All</button>
      </div>
    </div>
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
        <button
          onClick={() => {
            setText('Спросить про ');
          }}
        >
          Спросить
        </button>
        <button
          onClick={() => {
            setText('Объясни ');
          }}
        >
          Объяснить
        </button>
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
 * @purpose Compose the opened MR header, informer, sticky decision bar, and server-projected feed.
 * @param props MR route state, feed interaction callbacks, and decision/verdict awareness.
 */
export function MrFeedScreen(props: {
  refName: string;
  state: MrStateV2 | null;
  onBack: () => void;
  onAction: (type: string) => void;
  pending: string | null;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
  onDecision?: (action: 'skip' | 'edit' | 'post_all') => void;
  verdict?: string;
}) {
  const findings = useMemo(() => {
    const items: Record<string, unknown>[] = [];
    for (const w of props.state?.widgets ?? []) {
      if (w.type === 'findings' && Array.isArray(w.payload.items))
        items.push(...(w.payload.items as Record<string, unknown>[]));
    }
    return items;
  }, [props.state]);
  const factchecked = findings.filter((it) => String(it.factcheck) === 'verified').length;
  const showSticky = findings.length > 0 && props.onDecision;
  return (
    <main className="v2-mr">
      {showSticky && (
        <StickyDecisionBar
          verdict={props.verdict ?? 'Review'}
          findingsCount={findings.length}
          factchecked={factchecked}
          onDecision={props.onDecision!}
        />
      )}
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
