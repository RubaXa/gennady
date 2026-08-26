// @file: App — v2 inbox dashboard: boot → two-queue responsibility board → MR workspace.
// @consumers: dashboard-entry
// @tasks: TSK-164, TSK-169, TSK-182

import { useCallback, useEffect, useState } from 'react';
import { dashboardV2Api } from './dashboard-v2-api.ts';
import { LoadingScreen, sseBackoffMs, useMrStream } from './dashboard-v2-ui.tsx';
import { ResponsibilityQueue } from './board/ResponsibilityQueue.tsx';
import { MrWorkspace } from './workspace/MrWorkspace.tsx';
import type { BoardV2, BootV2, ChatTranscriptTurn, FeedWidget, MrStateV2 } from './v2-types.ts';

/**
 * @purpose Root application component — boot → two-queue board → MR workspace, hash-routed.
 * @invariant MrWorkspace mounts once per MR ref; unmount-mount is the only way to reset workspace state.
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
    const handler = (): void => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const diagramMatch = hash.match(
    /^\/mr\/([^/]+)\/report\/diagram\/(change-map|c4|behaviour|use-cases)$/
  );
  const artifactMatch = diagramMatch ? null : hash.match(/^\/mr\/([^/]+)\/artifact\/(.+)$/);
  const mrMatch = diagramMatch ?? artifactMatch ?? hash.match(/^\/mr\/(.+)$/);
  const mrId = mrMatch ? decodeURIComponent(mrMatch[1]!) : null;
  const artifactPath = diagramMatch
    ? 'review.json'
    : artifactMatch
      ? decodeURIComponent(artifactMatch[2]!)
      : null;
  const diagramKind = diagramMatch
    ? (diagramMatch[2] as 'change-map' | 'c4' | 'behaviour' | 'use-cases')
    : null;

  const refreshBoard = useCallback(async (): Promise<void> => {
    const next = await dashboardV2Api.board();
    setBoard(next);
    setBoardLastUpdated(Date.now());
  }, []);

  const refreshState = useCallback(async (): Promise<void> => {
    if (!mrId) return;
    setState(await dashboardV2Api.state(mrId));
  }, [mrId]);

  // #region START_BOOT_POLL — invariant: poll continues until ready; openedReadOnly bypasses readiness gate
  useEffect(() => {
    let disposed = false;
    const pollBoot = async (): Promise<void> => {
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
  // #endregion END_BOOT_POLL

  useEffect(() => {
    if (!mrId) return;
    void refreshState();
  }, [mrId, refreshState]);

  // Reading the MR feed advances its server-owned cursor; explicit call makes lastReadAt observable.
  useEffect(() => {
    if (!mrId) return;
    void dashboardV2Api.feed(mrId).catch(() => undefined);
  }, [mrId]);

  const disconnected = useMrStream(
    mrId,
    useCallback((): void => {
      void refreshState();
      void refreshBoard();
    }, [refreshState, refreshBoard]),
    useCallback((token: string): void => setStreamingText((prev) => prev + token), []),
    useCallback(
      (turn: ChatTranscriptTurn): void => {
        setLiveTurns((prev) => [...prev, turn]);
        setStreamingText('');
        setPendingQuestion(null);
        void refreshState();
      },
      [refreshState]
    ),
    useCallback((snapshotId: string): void => setUndoSnapshotId(snapshotId), [])
  );

  // #region START_SSE_RECONNECT_BACKOFF — invariant: batch reconciliation with bounded delay on disconnect
  useEffect(() => {
    if (!mrId || !disconnected) return;
    let delay = 3000;
    let cancelled = false;
    const reconcile = async (): Promise<void> => {
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
  // #endregion END_SSE_RECONNECT_BACKOFF

  const openMr = (ref: string): void => {
    window.location.hash = `#/mr/${encodeURIComponent(ref)}`;
  };

  const runAction = async (type: string): Promise<void> => {
    if (!mrId) return;
    if (type === 'prepare_env' || type === 'delta_review') {
      setPending('запускаю ревью…');
      try {
        await dashboardV2Api.review(mrId);
        setPending('ревью запущено — обновится в ленте');
      } catch {
        setPending('✘ ошибка — повторите действие');
      }
      return;
    }
    setPending('создаю задачу…');
    try {
      const result = await dashboardV2Api.task(mrId, type, { mr: mrId });
      setPending(result.taskId);
      await refreshState();
    } catch {
      setPending('✘ ошибка — повторите действие');
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

  const decide = async (
    proposalId: string,
    verdict: 'accept' | 'edit' | 'reject'
  ): Promise<void> => {
    if (!mrId) return;
    setPending('создаю effect-задачу…');
    const result = await dashboardV2Api.decision(mrId, proposalId, verdict);
    setPending(result.taskId ?? 'dry-run: решение принято');
    await refreshState();
  };

  const undo = async (snapshotId: string): Promise<void> => {
    if (!mrId) return;
    await dashboardV2Api.undo(mrId, snapshotId);
    setUndoSnapshotId(null);
    await refreshState();
  };

  const handleComplete = async (ref: string): Promise<void> => {
    await dashboardV2Api.completeMr(ref);
    await refreshBoard();
  };

  const handleReviewDelta = async (ref: string): Promise<void> => {
    await dashboardV2Api.review(ref);
    await refreshBoard();
  };

  const handleUpdateDescription = async (ref: string): Promise<void> => {
    await dashboardV2Api.updateDescription(ref);
    await refreshState();
  };

  if (!boot?.ready && !openedReadOnly) {
    return (
      <LoadingScreen
        boot={boot}
        onOpen={() => setOpenedReadOnly(true)}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (mrId) {
    return (
      <div className="v2-app">
        <MrWorkspace
          mrRef={mrId}
          state={state}
          onBack={() => {
            window.location.hash = '#/';
          }}
          onAction={(type) => void runAction(type)}
          onUpdateDescription={() => void handleUpdateDescription(mrId)}
          artifactPath={artifactPath}
          diagramKind={diagramKind}
          onOpenArtifact={(path) => {
            window.location.hash = `#/mr/${encodeURIComponent(mrId)}/artifact/${encodeURIComponent(path)}`;
          }}
          onCloseArtifact={() => {
            window.location.hash = `#/mr/${encodeURIComponent(mrId)}`;
          }}
          onOpenDiagram={(kind) => {
            window.location.hash = kind
              ? `#/mr/${encodeURIComponent(mrId)}/report/diagram/${kind}`
              : `#/mr/${encodeURIComponent(mrId)}/artifact/${encodeURIComponent('review.json')}`;
          }}
          pending={pending}
          onSelectAnchor={setChatAnchor}
          chatAnchor={chatAnchor}
          transcript={[...(state?.transcript ?? []), ...liveTurns]}
          streamingText={streamingText}
          pendingQuestion={pendingQuestion}
          undoSnapshotId={undoSnapshotId}
          disconnected={disconnected}
          onDecision={decide}
          onUndo={undo}
          onChatSubmit={sendChat}
        />
      </div>
    );
  }

  return (
    <div className="v2-app">
      <ResponsibilityQueue
        cards={board?.cards ?? []}
        syncState={board?.syncState ?? 'ok'}
        lastUpdated={boardLastUpdated}
        onOpen={openMr}
        onReviewDelta={handleReviewDelta}
        onComplete={handleComplete}
        onUpdateDescription={handleUpdateDescription}
      />
    </div>
  );
}
