// @file: MrDetailPage — screen #/mr/:id: artifact browser (left) + action panel (right); deep-linkable.
// @consumers: App (via hash route #/mr/:id)
// @tasks: TSK-107

import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useBoard } from '../services/board-store.tsx';
import { formatTimeAgo } from '../lib/utils.ts';
import { ArtifactBrowser } from './ArtifactBrowser.tsx';
import { ActionPanel } from './ActionPanel.tsx';
import type { MrDetail } from '../../inbox-api/types.ts';

/**
 * @purpose Screen for `#/mr/:id` — replaces the old modal. Fetches the MR report on mount, renders
 *   ArtifactBrowser (left) and ActionPanel (right).
 * @param props MR identifier from the route.
 */
export function MrDetailPage(props: { mrId: string }) {
  const { mrId } = props;
  const { fetchReport } = useBoard();
  const [report, setReport] = useState<MrDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
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

  /**
   * @purpose Navigate back to the board.
   */
  const goBack = () => {
    window.location.hash = '#/';
  };

  return (
    <main className="mx-auto max-w-[1600px] p-4 flex flex-col gap-3 h-[calc(100vh-3rem)]">
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
          <ArtifactBrowser mrId={mrId} />
          <ActionPanel mrId={mrId} report={report} />
        </div>
      )}
    </main>
  );
}
