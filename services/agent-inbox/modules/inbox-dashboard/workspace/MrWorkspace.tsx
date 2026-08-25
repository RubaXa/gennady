// @file: MrWorkspace — MR workspace composition: feed, package, artifact viewer, chat and handoff.
// @consumers: App
// @tasks: TSK-182

import { useState } from 'react';
import type { ChatTranscriptTurn, FeedWidget, MrStateV2 } from '../v2-types.ts';
import { ReviewFeed } from './widgets/ReviewFeed.tsx';
import { ReviewPackageWidget } from './ReviewPackageWidget.tsx';
import { ReviewArtifactPost, ReviewArtifactViewer } from '../artifacts/ReviewArtifactViewer.tsx';
import { ReviewChatPanel } from '../chat/ReviewChatPanel.tsx';
import { ReviewHandoffControl } from '../handoff/ReviewHandoffControl.tsx';
import { MarkdownContent } from '../markdown/MarkdownContent.tsx';
import { DebugLogButton } from '../components/DebugLogButton.tsx';

// #region START_ATTENTION_LABEL — invariant: attention emoji is a semantic token not a display string
const ATTENTION_LABEL: Record<string, string> = {
  '⏳': 'ждёт моё ревью',
  '💬': 'ждёт мой ответ',
  '🔀': 'ждёт ре-ревью',
  '✅': 'ждёт аппрув / резолв',
  '😴': 'ждёт других',
};
// #endregion END_ATTENTION_LABEL

/** @purpose Role glyph for MR header identity row — non-colour status cue. */
function resolveRoleGlyph(myRole: string | null): string {
  if (myRole === 'author') return '👤';
  if (myRole === 'reviewer') return '👁';
  if (myRole === 'mentioned') return '💬';
  return '·';
}

/**
 * @purpose MR description with clamp + expander per ux-mockup §4 description row.
 * @param props Full description body from the card DTO.
 */
function DescriptionExpander(props: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const text = props.description.trim();
  if (!text) return null;
  return (
    <section className={`v2-mr-description${expanded ? ' expanded' : ''}`} aria-label="Описание MR">
      <MarkdownContent source={text} />
      <button
        type="button"
        className="v2-mr-description-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        {expanded ? 'свернуть ▴' : 'ещё ▾'}
      </button>
    </section>
  );
}

/**
 * @purpose Full MR workspace: header, feed, package widget, artifact viewer, chat panel and handoff control.
 * @invariant Responsive layout mounts the same component state across viewport changes — operator selections survive.
 * @param props MR route state and interaction callbacks.
 */
export function MrWorkspace(props: {
  mrRef: string;
  state: MrStateV2 | null;
  onBack: () => void;
  onAction: (type: string) => void;
  onUpdateDescription?: () => void;
  artifactPath?: string | null;
  diagramKind?: 'change-map' | 'c4' | 'behaviour' | 'use-cases' | null;
  onOpenArtifact?: (path: string) => void;
  onOpenDiagram?: (kind: 'change-map' | 'c4' | 'behaviour' | 'use-cases' | null) => void;
  onCloseArtifact?: () => void;
  pending: string | null;
  onSelectAnchor: (anchor: FeedWidget['anchors'][number]) => void;
  chatAnchor: FeedWidget['anchors'][number] | null;
  transcript: ChatTranscriptTurn[];
  streamingText: string;
  pendingQuestion: string | null;
  undoSnapshotId: string | null;
  disconnected: boolean;
  onDecision: (proposalId: string, verdict: 'accept' | 'edit' | 'reject') => Promise<void>;
  onUndo: (snapshotId: string) => Promise<void>;
  onChatSubmit: (text: string, anchor: FeedWidget['anchors'][number] | null) => Promise<void>;
}) {
  const card = props.state?.card;
  const [menuOpen, setMenuOpen] = useState(false);
  const workIsActive = card?.work.state === 'running' || card?.work.state === 'queued';

  return (
    <div className="v2-workspace">
      <main className="v2-mr">
        {!props.artifactPath && (
          <>
            <article className="v2-mr-overview" aria-label="Карточка MR">
              <header className="v2-mr-overview-nav">
                <button onClick={props.onBack} aria-label="Вернуться на доску">
                  ← Доска
                </button>
                <DebugLogButton />
                <p className="v2-kicker">
                  {resolveRoleGlyph(card?.myRole ?? null)} {props.mrRef}
                  {card?.author ? ` · ${card.author}` : ''}
                  {card?.webUrl ? (
                    <>
                      {' '}
                      <a
                        className="v2-gitlab-link"
                        href={card.webUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Открыть MR в GitLab"
                      >
                        GitLab ↗
                      </a>
                    </>
                  ) : null}
                </p>
              </header>
              <h1>{card?.title ?? 'Загрузка MR…'}</h1>
              {card && (
                <p className="v2-attention-line">
                  {card.attention} {ATTENTION_LABEL[card.attention] ?? ''}
                </p>
              )}
              {card && (
                <section className="v2-header-informer" aria-label="Счётчики MR">
                  <span>✅ {card.counters.approvals}</span>
                  <span>
                    👁 {card.counters.reviewers.filter((r) => r.voted).length}/
                    {card.counters.reviewers.length}
                  </span>
                  <span>🏗 {card.counters.ci ?? '—'}</span>
                  <span>💬 {card.counters.threads}</span>
                  <span>🔀 {card.counters.newCommits}</span>
                  <span>📬 {card.counters.unread}</span>
                </section>
              )}
              {card?.description ? <DescriptionExpander description={card.description} /> : null}
            </article>

            <section className="v2-workspace-toolbar" aria-label="Управление ревью">
              <div className="v2-workspace-toolbar-state">
                <span>{workIsActive ? '● AGENT RUNNING' : '○ REVIEW CONTROL'}</span>
                <b>{card?.work.label ?? 'Состояние загружается'}</b>
                {props.pending && <small>{props.pending}</small>}
              </div>
              <div className="v2-workspace-toolbar-actions">
                <button
                  className="v2-start-review"
                  disabled={workIsActive}
                  onClick={() =>
                    props.onAction(card?.work.state === 'done' ? 'delta_review' : 'prepare_env')
                  }
                >
                  {workIsActive
                    ? 'Ревью идёт…'
                    : card?.work.state === 'done'
                      ? 'Проверить изменения'
                      : '▶ Запустить ревью'}
                </button>
                <div className="v2-action-menu">
                  <button aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
                    ⋯ Действия
                  </button>
                  {menuOpen && (
                    <div role="menu">
                      <button role="menuitem" onClick={() => props.onAction('prepare_env')}>
                        Повторить полное ревью
                      </button>
                      <button role="menuitem" onClick={() => props.onAction('verify_fix')}>
                        Проверить новые коммиты
                      </button>
                      <button role="menuitem" onClick={props.onUpdateDescription}>
                        Обновить описание
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <ReviewPackageWidget
              mrRef={props.mrRef}
              available={Boolean(props.state?.widgets.some((widget) => widget.type === 'action'))}
            />
          </>
        )}

        {props.artifactPath ? (
          <ReviewArtifactViewer
            mrRef={props.mrRef}
            initialPath={props.artifactPath}
            onSelectAnchor={props.onSelectAnchor}
            onClose={props.onCloseArtifact}
            diagramKind={props.diagramKind}
            onOpenDiagram={props.onOpenDiagram}
          />
        ) : (
          <section className="v2-feed-shell" aria-label="Общая лента MR">
            <header className="v2-feed-title">
              <div>
                <span>ACTIVE MR FEED</span>
                <h2>Лента событий</h2>
              </div>
              <small>новое сверху · хронология MR</small>
            </header>
            <div className="v2-feed-stream">
              <ReviewArtifactPost
                mrRef={props.mrRef}
                onOpen={props.onOpenArtifact ?? (() => undefined)}
                onDiscuss={props.onSelectAnchor}
                onOpenDiagram={(kind) => props.onOpenDiagram?.(kind)}
              />
              <ReviewFeed
                state={props.state}
                onAction={props.onAction}
                pending={props.pending}
                onSelectAnchor={props.onSelectAnchor}
              />
              <ReviewHandoffControl mrRef={props.mrRef} />
            </div>
          </section>
        )}
      </main>

      <ReviewChatPanel
        mrRef={props.mrRef}
        disconnected={props.disconnected}
        anchor={props.chatAnchor}
        transcript={props.transcript}
        streamingText={props.streamingText}
        pendingQuestion={props.pendingQuestion}
        undoSnapshotId={props.undoSnapshotId}
        onDecision={props.onDecision}
        onUndo={props.onUndo}
        onSubmit={props.onChatSubmit}
      />
    </div>
  );
}
