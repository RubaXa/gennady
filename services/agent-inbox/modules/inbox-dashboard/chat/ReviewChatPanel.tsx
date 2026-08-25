// @file: ReviewChatPanel — persistent anchored MR conversation with streaming and undo.
// @consumers: MrWorkspace
// @tasks: TSK-182

import { useState } from 'react';
import type { ChatTranscriptTurn, FeedWidget } from '../v2-types.ts';
import { MarkdownContent } from '../markdown/MarkdownContent.tsx';

/**
 * @purpose Persistent anchored MR conversation: transcript, streaming assistant reply, anchor pill, decision controls.
 * @invariant Undo is valid only for the concrete snapshotId from the latest mutation event, never a sentinel.
 * @param props Active MR ref, connection health, selected anchor, transcript, streaming state, and async action callbacks.
 */
export function ReviewChatPanel(props: {
  mrRef: string | null;
  disconnected: boolean;
  anchor: FeedWidget['anchors'][number] | null;
  transcript: ChatTranscriptTurn[];
  streamingText: string;
  pendingQuestion: string | null;
  undoSnapshotId: string | null;
  onDecision: (proposalId: string, verdict: 'accept' | 'edit' | 'reject') => Promise<void>;
  onUndo: (snapshotId: string) => Promise<void>;
  onSubmit: (text: string, anchor: FeedWidget['anchors'][number] | null) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const question = text.trim();
    if (!question || !props.mrRef) return;
    setError(null);

    // #region START_CHAT_SUBMIT — failure mode: server error shows local error banner; streaming state cleared after turn_done
    try {
      await props.onSubmit(question, props.anchor);
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить вопрос');
    }
    // #endregion END_CHAT_SUBMIT
  };

  return (
    <aside className="v2-chat" aria-label="Чат">
      <header>
        <div>
          <span>OPERATOR SESSION</span>
          <b>🤖 Agent Terminal</b>
        </div>
        <small>{props.mrRef ?? 'контекст доски'}</small>
      </header>

      {props.disconnected && <p className="v2-error">Соединение потеряно — идёт восстановление</p>}

      <div className="v2-chat-body">
        {props.transcript.map((turn) => (
          <div key={turn.turnId} className={`v2-chat-turn ${turn.role}`}>
            <b>{turn.role === 'operator' ? 'Вы' : 'Агент'}</b>
            <MarkdownContent source={turn.text} />
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
        <button onClick={() => setText('Объясни сводку ревью')}>Объяснить сводку</button>
        <button onClick={() => setText('Покажи риски в изменениях')}>Показать риски</button>
        <button onClick={() => setText('Проверь тесты и покрытие')}>Проверить тесты</button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
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
