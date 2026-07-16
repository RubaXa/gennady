// @file: MrDetailPage — screen #/mr/:id: artifact browser (left) + permanent ActionPanel/ChatPanel
//   split (right, wide viewport) or ViewSwitch + single pane (narrow viewport); deep-linkable.
// @consumers: App (via hash route #/mr/:id)
// @tasks: TSK-107, TSK-130, TSK-132

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useBoard } from '../services/board-store.tsx';
import { formatTimeAgo, cn } from '../lib/utils.ts';
import { ArtifactBrowser } from './ArtifactBrowser.tsx';
import { ActionPanel } from './ActionPanel.tsx';
import { ChatPanel, type ChatPanelHandle } from './ChatPanel.tsx';
import { SelectionPill } from './SelectionPill.tsx';
import { ViewSwitch, type MrDetailView } from './ViewSwitch.tsx';
import type { ContextChip } from '../../inbox-chat/types.ts';
import type { MrDetail } from '../../inbox-api/types.ts';

/** @purpose Viewport width below which the permanent ActionPanel/ChatPanel split collapses into a
 *   ViewSwitch + single pane — matches the existing responsive Kanban breakpoint (NFC-SV-03), no
 *   new threshold invented (D-106). */
const NARROW_VIEWPORT_QUERY = '(max-width: 1024px)';

/**
 * @purpose Screen for `#/mr/:id` — replaces the old modal. Fetches the MR report on mount, renders
 *   ArtifactBrowser (left) and, on the right, a permanent ActionPanel↑/ChatPanel↓ split on wide
 *   viewport (D-87) or a ViewSwitch + single active pane on narrow viewport (D-106). Both panels
 *   stay mounted at all times — only hidden via CSS on narrow viewport — so ChatPanel's SSE
 *   subscription is never torn down by a view switch.
 * @param props MR identifier from the route.
 */
export function MrDetailPage(props: { mrId: string }) {
  const { mrId } = props;
  const { fetchReport } = useBoard();
  const [report, setReport] = useState<MrDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<{ name: string; rawText: string } | null>(
    null
  );
  const [refreshToken, setRefreshToken] = useState(0);
  const [narrowViewport, setNarrowViewport] = useState(
    () => window.matchMedia(NARROW_VIEWPORT_QUERY).matches
  );
  const [activeView, setActiveView] = useState<MrDetailView>('candidates');

  const chatPanelRef = useRef<ChatPanelHandle>(null);

  const loadReport = async () => {
    try {
      setError(null);
      const data = await fetchReport(mrId);
      setReport(data);
    } catch (_cause) {
      setError('Не удалось загрузить отчёт');
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        setError(null);
        const data = await fetchReport(mrId);
        if (!cancelled) setReport(data);
      } catch (_cause) {
        if (!cancelled) setError('Не удалось загрузить отчёт');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mrId, fetchReport]);

  // Track the narrow/wide viewport split (D-106) — reuses the 1024px breakpoint already used by
  // the responsive Kanban board (NFC-SV-03).
  useEffect(() => {
    const mql = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const onChange = () => setNarrowViewport(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  /**
   * @purpose Handle an SSE `refresh` frame relayed by ChatPanel (D-133) — a mutation applied
   *   elsewhere changed `review.json`/artifacts underneath; re-read the report and bump
   *   ArtifactBrowser's refreshToken so its list/content re-fetch too.
   */
  const onChatRefresh = () => {
    setRefreshToken((prev) => prev + 1);
    void loadReport();
  };

  /**
   * @purpose Attach a SelectionPill chip into the chat composer and, on narrow viewport, switch to
   *   the chat pane so the operator sees where the chip landed (CH-01).
   * @param chip Chip built from the current selection.
   */
  const onAttachChip = (chip: ContextChip) => {
    chatPanelRef.current?.attachChip(chip);
    if (narrowViewport) setActiveView('chat');
  };

  /**
   * @purpose Navigate back to the board.
   */
  const goBack = () => {
    window.location.hash = '#/';
  };

  return (
    <main className="relative mx-auto max-w-[1600px] p-4 flex flex-col gap-3 h-[calc(100vh-3rem)]">
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={goBack}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Назад к доске"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {report && (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-mono truncate">{report.mr.project}</span>
              <span className="font-semibold text-foreground/90">!{report.mr.iid}</span>
              <span>·</span>
              <span>{report.mr.author}</span>
              <span>·</span>
              <span>{formatTimeAgo(report.mr.updatedAt)}</span>
            </div>
            <h2 className="text-[15px] font-semibold leading-snug truncate">{report.mr.title}</h2>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-center flex-1 gap-2 text-destructive"
        >
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      )}

      {report && !loading && !error && (
        <div className="flex gap-3 min-h-0 flex-1">
          <ArtifactBrowser
            mrId={mrId}
            refreshToken={refreshToken}
            onActiveArtifactChange={setActiveArtifact}
          />

          <div className="flex w-[420px] shrink-0 flex-col gap-2 min-h-0">
            {narrowViewport && <ViewSwitch active={activeView} onChange={setActiveView} />}

            <div
              className={cn(
                'min-h-0',
                narrowViewport ? (activeView === 'candidates' ? 'flex-1 flex' : 'hidden') : 'flex-1'
              )}
            >
              <ActionPanel mrId={mrId} report={report} />
            </div>

            <div
              className={cn(
                'min-h-0 flex flex-col',
                narrowViewport ? (activeView === 'chat' ? 'flex-1' : 'hidden') : 'flex-1'
              )}
            >
              <ChatPanel ref={chatPanelRef} mrId={mrId} onRefresh={onChatRefresh} />
            </div>
          </div>
        </div>
      )}

      <SelectionPill onAttach={onAttachChip} activeArtifact={activeArtifact} />
    </main>
  );
}
