// @file: App — v2 inbox dashboard: boot → attention board → MR feed with permanent chat.
// @consumers: dashboard-entry
// @tasks: TSK-164 TSK-169

import { useCallback, useEffect, useState } from 'react';
import { dashboardV2Api } from './dashboard-v2-api.ts';
import {
  AttentionBoard,
  ChatColumn,
  LoadingScreen,
  MrFeedScreen,
  sseBackoffMs,
  useMrStream,
} from './dashboard-v2-ui.tsx';
import type { BoardV2, BootV2, ChatTranscriptTurn, FeedWidget, MrStateV2 } from './v2-types.ts';

/**
 * @purpose Root application component — wraps BoardStore and routes via hash.
 */
export function App() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  const [boot, setBoot] = useState<BootV2 | null>(null);
  const [board, setBoard] = useState<BoardV2 | null>(null);
  const [state, setState] = useState<MrStateV2 | null>(null);
  const [openedReadOnly, setOpenedReadOnly] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [chatAnchor, setChatAnchor] = useState<FeedWidget['anchors'][number] | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [liveTurns, setLiveTurns] = useState<ChatTranscriptTurn[]>([]);
  const [undoSnapshotId, setUndoSnapshotId] = useState<string | null>(null);
  const [boardLastUpdated, setBoardLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const resolveRoute = (): { mrId: string | null } => {
    const mrMatch = hash.match(/^\/mr\/(.+)$/);
    return { mrId: mrMatch ? decodeURIComponent(mrMatch[1]!) : null };
  };

  const { mrId } = resolveRoute();

  const refreshBoard = useCallback(async () => {
    const next = await dashboardV2Api.board();
    setBoard(next);
    setBoardLastUpdated(Date.now());
  }, []);
  const refreshState = useCallback(async () => {
    if (!mrId) return;
    setState(await dashboardV2Api.state(mrId));
  }, [mrId]);

  useEffect(() => {
    let disposed = false;
    const pollBoot = async () => {
      try {
        const next = await dashboardV2Api.boot();
        if (disposed) return;
        setBoot(next);
        if (next.ready || openedReadOnly) await refreshBoard();
      } catch (cause) {
        if (!disposed)
          setBoot({
            phase: 'failed',
            ready: false,
            configured: false,
            missing: [],
            error:
              cause instanceof Error ? cause.message : 'Не удалось получить состояние загрузки',
          });
      }
    };
    void pollBoot();
    const timer = window.setInterval(() => void pollBoot(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [openedReadOnly, refreshBoard]);

  useEffect(() => {
    if (!mrId) return;
    void refreshState();
  }, [mrId, refreshState]);

  // Reading the MR feed advances its server-owned cursor. State remains the live batch snapshot,
  // while this explicit consumer acknowledgement makes /feed's lastReadAt behavior observable.
  useEffect(() => {
    if (!mrId) return;
    void dashboardV2Api.feed(mrId).catch(() => undefined);
  }, [mrId]);

  const disconnected = useMrStream(
    mrId,
    useCallback(() => {
      void refreshState();
      void refreshBoard();
    }, [refreshState, refreshBoard]),
    useCallback((token: string) => setStreamingText((previous) => previous + token), []),
    useCallback(
      (turn: ChatTranscriptTurn) => {
        setLiveTurns((previous) => [...previous, turn]);
        setStreamingText('');
        setPendingQuestion(null);
        void refreshState();
      },
      [refreshState]
    ),
    useCallback((snapshotId: string) => setUndoSnapshotId(snapshotId), [])
  );
  useEffect(() => {
    if (!mrId || !disconnected) return;
    let delay = 3000;
    let cancelled = false;
    const reconcile = async () => {
      try {
        await refreshState();
        delay = sseBackoffMs(delay, true);
      } catch {
        delay = sseBackoffMs(delay, false);
      }
      if (!cancelled) window.setTimeout(() => void reconcile(), delay);
    };
    void reconcile();
    return () => {
      cancelled = true;
    };
  }, [disconnected, mrId, refreshState]);

  const openMr = (ref: string) => {
    window.location.hash = `#/mr/${encodeURIComponent(ref)}`;
  };
  const runAction = async (type: string) => {
    if (!mrId) return;
    setPending('создаю задачу…');
    try {
      const result = await dashboardV2Api.task(mrId, type, { mr: mrId });
      setPending(result.taskId);
      await refreshState();
    } catch {
      setPending('❌ ошибка — повторите действие');
    }
  };
  const sendChat = async (
    text: string,
    anchor: FeedWidget['anchors'][number] | null
  ): Promise<void> => {
    if (!mrId) throw new Error('Откройте MR, чтобы задать вопрос');
    setPendingQuestion(text);
    setStreamingText('');
    await dashboardV2Api.chat(mrId, text, anchor ?? undefined);
  };
  const decide = async (proposalId: string, verdict: 'accept' | 'edit' | 'reject') => {
    if (!mrId) return;
    setPending('создаю effect-задачу…');
    const result = await dashboardV2Api.decision(mrId, proposalId, verdict);
    setPending(result.taskId ?? 'dry-run: решение принято');
    await refreshState();
  };
  const handleStickyDecision = (action: 'skip' | 'edit' | 'post_all') => {
    void runAction(`sticky_${action}`);
  };
  const undo = async (snapshotId: string) => {
    if (!mrId) return;
    await dashboardV2Api.undo(mrId, snapshotId);
    setUndoSnapshotId(null);
    await refreshState();
  };

  return (
    <div className="v2-app">
      {!boot?.ready && !openedReadOnly ? (
        <LoadingScreen
          boot={boot}
          onOpen={() => setOpenedReadOnly(true)}
          onRetry={() => window.location.reload()}
        />
      ) : mrId ? (
        <MrFeedScreen
          refName={mrId}
          state={state}
          onBack={() => {
            window.location.hash = '#/';
          }}
          onAction={(type) => void runAction(type)}
          pending={pending}
          onSelectAnchor={setChatAnchor}
          onDecision={handleStickyDecision}
        />
      ) : (
        <AttentionBoard
          cards={board?.cards ?? []}
          syncState={board?.syncState ?? 'ok'}
          lastUpdated={boardLastUpdated}
          onOpen={openMr}
        />
      )}
      <ChatColumn
        refName={mrId}
        disconnected={disconnected}
        anchor={chatAnchor}
        transcript={[...(state?.transcript ?? []), ...liveTurns]}
        streamingText={streamingText}
        pendingQuestion={pendingQuestion}
        onDecision={decide}
        onUndo={undo}
        undoSnapshotId={undoSnapshotId}
        onSubmit={sendChat}
      />
    </div>
  );
}
