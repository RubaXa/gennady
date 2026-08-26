// @file: ReviewFeed — chronological smart-widget stream with unread boundary and 7 widget kinds.
// @consumers: MrWorkspace
// @tasks: TSK-182

import { useMemo, useState } from 'react';
import type { FeedWidget, MrStateV2 } from '../../v2-types.ts';

// #region START_WIDGET_HEADINGS — invariant: closed set per spec §5; unknown types fall back to type string
const WIDGET_HEADING: Record<FeedWidget['type'], string> = {
  findings: '🔍 Находки',
  threads: '💬 Треды ждут меня',
  artifact: '📄 Артефакт-пост',
  gitlab: '🦊 GitLab-событие',
  plan: '📋 Текущий план',
  progress: '🔧 Прогресс',
  action: '⚡ Действие',
};
// #endregion END_WIDGET_HEADINGS

/**
 * @purpose Findings widget: expandable item rows with diff, factcheck and batch actions.
 * @param props Widget projection and action callback.
 */
function FindingsWidget(props: {
  widget: FeedWidget;
  onAction: (type: string) => void;
  pending: string | null;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
}) {
  const { widget, onAction, pending, onSelectAnchor } = props;
  const items = Array.isArray(widget.payload.items)
    ? (widget.payload.items as Record<string, unknown>[])
    : [];
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  const toggleExpand = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visible = items.filter((item) => !item.hidden);
  const hidden = items.filter((item) => item.hidden);
  const factchecked = items.filter((item) => String(item.factcheck) === 'verified').length;

  const handleMouseUp = (event: React.MouseEvent): void => {
    const quote = window.getSelection()?.toString().trim();
    if (!quote) return;
    const target =
      event.target instanceof HTMLElement ? event.target.closest('[data-anchor-id]') : null;
    const elementId = target?.getAttribute('data-anchor-id') ?? undefined;
    const anchor = widget.anchors.find(
      (candidate) => !elementId || candidate.elementId === elementId
    );
    if (anchor) onSelectAnchor({ ...anchor, quote, fragment: { start: 0, end: quote.length } });
  };

  return (
    <article className="v2-widget" data-widget-type="findings" onMouseUp={handleMouseUp}>
      <header>
        <h3>
          {WIDGET_HEADING.findings} ({items.length}) · factcheck {factchecked}/{items.length}
        </h3>
        <time>{new Date(widget.lastActivity).toLocaleTimeString()}</time>
      </header>

      {visible.map((item, index) => {
        const id = String(item.id ?? index);
        const severity = String(item.severity ?? '');
        const severityLabel = severity.toUpperCase() === 'HIGH' ? 'HIGH' : 'MED';
        const severityClass =
          severity.toUpperCase() === 'HIGH' ? 'v2-finding-badge-high' : 'v2-finding-badge-med';
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
              aria-expanded={expandedIds.has(id)}
              aria-label={`Находка ${severityLabel}: ${String(item.summary ?? '')}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') toggleExpand(id);
              }}
            >
              <span className={`v2-finding-badge ${severityClass}`} aria-hidden="true">
                {severityLabel}
              </span>
              <span className="v2-finding-summary">{String(item.summary ?? '')}</span>
              <span className="v2-finding-location">{location}</span>
              <span className="v2-finding-toggle" aria-hidden="true">
                {expandedIds.has(id) ? '▴' : '▾'}
              </span>
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
                        <span className="v2-diff-sign" aria-hidden="true">
                          {dline.type === 'add' ? '+' : dline.type === 'remove' ? '-' : ''}
                        </span>
                        <span className="v2-diff-text">{dline.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="v2-finding-diff-lines">
                    <span className="v2-diff-text v2-muted">
                      (diff-данные появятся после первого раунда ревью)
                    </span>
                  </div>
                )}
                <div className="v2-finding-diff-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction('deepen');
                    }}
                    title="Углубить"
                    aria-label="Углубить анализ находки"
                  >
                    🔎
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
          <button onClick={() => onAction('post_findings')}>
            📮 Постить замечания ({items.length})
          </button>
          <button onClick={() => onAction('fact_check')}>✅ Фактчек всех</button>
        </div>
      )}

      {hidden.length > 0 && (
        <div
          className="v2-finding-hidden"
          onClick={() => setShowHidden(!showHidden)}
          role="button"
          tabIndex={0}
          aria-expanded={showHidden}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setShowHidden(!showHidden);
          }}
        >
          Скрытые ({hidden.length}) {showHidden ? '▴' : '▸'}
        </div>
      )}

      {showHidden && hidden.length > 0 && (
        <div>
          {hidden.map((item, index) => (
            <div key={String(item.id ?? index)} className="v2-finding-row v2-hidden">
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

      {pending && (
        <p className="v2-pending" aria-live="polite">
          ⏳ {pending}
        </p>
      )}
    </article>
  );
}

/**
 * @purpose Plan widget: stage flow, progress bar, queue position.
 * @param props Widget projection and pending state.
 */
function PlanWidget(props: { widget: FeedWidget; pending: string | null }) {
  const { widget, pending } = props;
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
          {WIDGET_HEADING.plan} · {stage}
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
        {queuePos != null && <span className="v2-plan-queue">Queue: Pos {queuePos}</span>}
      </div>
      {tracksTotal > 0 && (
        <div
          className="v2-plan-progress"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Прогресс: ${pct}%`}
        >
          <div className="v2-plan-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {pending && (
        <p className="v2-pending" aria-live="polite">
          ⏳ {pending}
        </p>
      )}
    </article>
  );
}

/**
 * @purpose Generic widget renderer for threads, artifact, gitlab, progress and action types.
 * @param props Widget projection, action callback, pending state, anchor selection callback.
 * @returns Widget markup or null for resolved one-shot action widgets.
 */
function GenericWidget(props: {
  widget: FeedWidget;
  onAction: (type: string) => void;
  pending: string | null;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
}) {
  const { widget, onAction, pending, onSelectAnchor } = props;
  if (widget.type === 'action' && widget.resolved) return null;

  const items = Array.isArray(widget.payload.items)
    ? (widget.payload.items as Record<string, unknown>[])
    : Array.isArray(widget.payload.events)
      ? (widget.payload.events as Record<string, unknown>[])
      : [];

  const describeItem = (item: Record<string, unknown>): string => {
    if (item.kind === 'task_created')
      return `Создана задача ${String(item.type ?? item.taskId ?? '')}`;
    if (item.kind === 'task_status') {
      return `${String(item.type ?? item.taskId ?? 'Задача')} → ${String(item.status ?? 'обновлена')}`;
    }
    return String(item.summary ?? item.quote ?? item.event ?? JSON.stringify(item));
  };

  const handleMouseUp = (event: React.MouseEvent): void => {
    const quote = window.getSelection()?.toString().trim();
    if (!quote) return;
    const target =
      event.target instanceof HTMLElement ? event.target.closest('[data-anchor-id]') : null;
    const elementId = target?.getAttribute('data-anchor-id') ?? undefined;
    const anchor = widget.anchors.find(
      (candidate) => !elementId || candidate.elementId === elementId
    );
    if (anchor) onSelectAnchor({ ...anchor, quote, fragment: { start: 0, end: quote.length } });
  };

  return (
    <article className="v2-widget" data-widget-type={widget.type} onMouseUp={handleMouseUp}>
      <header>
        <h3>{WIDGET_HEADING[widget.type] ?? widget.type}</h3>
        <time>{new Date(widget.lastActivity).toLocaleTimeString()}</time>
      </header>

      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li
              key={String(item.id ?? item.threadId ?? index)}
              data-anchor-id={String(item.id ?? item.threadId ?? '')}
            >
              {describeItem(item)}
              {widget.type === 'threads' && (
                <button
                  disabled={String(item.author) !== 'operator' && String(item.author) !== 'bot'}
                  title={
                    String(item.author) !== 'operator' && String(item.author) !== 'bot'
                      ? 'Только свои или bot-треды'
                      : 'Ответить и зарезолвить'
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

      {pending && (
        <p className="v2-pending" aria-live="polite">
          ⏳ {pending}
        </p>
      )}
    </article>
  );
}

/**
 * @purpose Route a feed widget to its typed renderer.
 * @param props Widget + callbacks.
 */
export function ReviewWidget(props: {
  widget: FeedWidget;
  onAction: (type: string) => void;
  pending: string | null;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
}) {
  const { widget } = props;
  if (widget.type === 'findings') {
    return (
      <FindingsWidget
        widget={widget}
        onAction={props.onAction}
        pending={props.pending}
        onSelectAnchor={props.onSelectAnchor}
      />
    );
  }
  if (widget.type === 'plan') {
    return <PlanWidget widget={widget} pending={props.pending} />;
  }
  return (
    <GenericWidget
      widget={widget}
      onAction={props.onAction}
      pending={props.pending}
      onSelectAnchor={props.onSelectAnchor}
    />
  );
}

/** @purpose Collapse the task journal into one readable attempt summary instead of dozens of event cards. */
function ProgressDigest(props: { widgets: FeedWidget[] }) {
  const [expanded, setExpanded] = useState(false);
  const labels = new Map<string, string>();
  const latest = new Map<string, string>();
  const transitions: string[] = [];
  for (const widget of props.widgets) {
    const events = Array.isArray(widget.payload.events)
      ? (widget.payload.events as Record<string, unknown>[])
      : [];
    for (const event of events) {
      const taskId = String(event.taskId ?? '');
      if (event.kind === 'task_created') labels.set(taskId, String(event.type ?? taskId));
      if (event.kind === 'task_status') {
        const status = String(event.status ?? 'updated');
        latest.set(taskId, status);
        transitions.push(`${labels.get(taskId) ?? taskId} → ${status}`);
      }
    }
  }
  const statuses = [...latest.values()];
  const done = statuses.filter((status) => status === 'done').length;
  const failed = statuses.filter((status) => status === 'failed').length;
  const running = statuses.filter((status) => status === 'running' || status === 'queued').length;
  const visible = expanded ? transitions : transitions.slice(-6);
  return (
    <article className="v2-widget v2-progress-digest" data-widget-type="progress">
      <header>
        <div>
          <span>PIPELINE HISTORY</span>
          <h3>🔧 Прогресс · последняя journal-попытка</h3>
        </div>
        <time>{new Date(props.widgets.at(-1)?.lastActivity ?? '').toLocaleTimeString()}</time>
      </header>
      <div className="v2-progress-stats">
        <span className="done">✓ {done} завершено</span>
        <span className={failed > 0 ? 'failed' : ''}>× {failed} ошибок</span>
        <span>↻ {running} выполняется</span>
        <span>{latest.size} задач</span>
      </div>
      <div className="v2-progress-list">
        {visible.map((transition, index) => (
          <code key={`${transition}:${index}`}>{transition}</code>
        ))}
      </div>
      {transitions.length > 6 && (
        <button onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Свернуть историю' : `Показать все ${transitions.length} переходов`}
        </button>
      )}
    </article>
  );
}

/**
 * @purpose Chronological smart-widget stream: seven widget kinds, new-since-last-read boundary.
 * @invariant Resolved one-shot action widgets are hidden from the active feed.
 * @param props MR state, action and anchor-selection callbacks, and optional pending overlay text.
 */
export function ReviewFeed(props: {
  state: MrStateV2 | null;
  onAction: (type: string) => void;
  pending: string | null;
  onSelectAnchor?: (anchor: FeedWidget['anchors'][number]) => void;
}) {
  const widgets = useMemo(() => props.state?.widgets ?? [], [props.state]);
  const unreadIndex = widgets.findIndex((widget) => widget.unread);
  const progressWidgets = widgets.filter((widget) => widget.type === 'progress');
  const smartWidgets = widgets.filter((widget) => widget.type !== 'progress');

  return (
    <section className="v2-feed" aria-label="Лента MR">
      {widgets.length === 0 ? (
        <div className="v2-feed-empty">
          <b>Событий пока нет</b>
          <span>Артефакты ревью доступны выше; новые GitLab-события появятся здесь.</span>
        </div>
      ) : (
        <>
          {progressWidgets.length > 0 && <ProgressDigest widgets={progressWidgets} />}
          {smartWidgets.map((widget, index) => (
            <div key={widget.widgetId}>
              {index === unreadIndex && (
                <p className="v2-divider" aria-label="Новые с прошлого визита">
                  Новое с прошлого визита
                </p>
              )}
              <ReviewWidget
                widget={widget}
                onAction={props.onAction}
                pending={props.pending}
                onSelectAnchor={props.onSelectAnchor ?? (() => undefined)}
              />
            </div>
          ))}
        </>
      )}
    </section>
  );
}

/** @purpose Backward-compatible alias for ReviewFeed consumed by feed-lifecycle and optimistic tests. */
export const FeedList = ReviewFeed;
