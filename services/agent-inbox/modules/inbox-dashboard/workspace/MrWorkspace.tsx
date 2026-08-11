// @file: MrWorkspace — MR workspace composition: feed, package, artifact viewer, chat and handoff.
// @consumers: App
// @tasks: TSK-182

import { useState } from 'react';
import type { ChatTranscriptTurn, FeedWidget, MrStateV2 } from '../v2-types.ts';
import { ReviewFeed } from './widgets/ReviewFeed.tsx';
import { ReviewPackageWidget } from './ReviewPackageWidget.tsx';
import { ReviewArtifactViewer } from '../artifacts/ReviewArtifactViewer.tsx';
import { ReviewChatPanel } from '../chat/ReviewChatPanel.tsx';
import { ReviewHandoffControl } from '../handoff/ReviewHandoffControl.tsx';

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
    <p className={`v2-mr-description${expanded ? ' expanded' : ''}`}>
      {text}{' '}
      <button
        type="button"
        className="v2-mr-description-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        {expanded ? 'свернуть ▴' : 'ещё ▾'}
      </button>
    </p>
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

  return (
    <div className="v2-workspace">
      <main className="v2-mr">
        <header>
          <button onClick={props.onBack} aria-label="Вернуться на доску">
            ← Доска
          </button>
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
        </header>

        <ReviewFeed
          state={props.state}
          onAction={props.onAction}
          pending={props.pending}
          onSelectAnchor={props.onSelectAnchor}
        />

        <ReviewPackageWidget mrRef={props.mrRef} />

        <ReviewArtifactViewer mrRef={props.mrRef} onSelectAnchor={props.onSelectAnchor} />

        <ReviewHandoffControl mrRef={props.mrRef} />
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
