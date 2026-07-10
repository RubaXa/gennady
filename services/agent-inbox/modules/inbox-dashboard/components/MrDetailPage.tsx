// @file: MrDetailPage — modal overlay for MR detail with report from GET /api/mr/:id/report and OperatorQuestion.
// @consumers: App (via hash route #/mr/:id)
// @tasks: TSK-107

import { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle, MessageSquare } from 'lucide-react';
import { useBoard } from '../services/board-store.tsx';
import { formatTimeAgo } from '../lib/utils.ts';
import type { MrDetail } from '../../inbox-api/types.ts';

/**
 * @purpose Modal overlay showing detailed MR report and operator questions.
 * Fetches data from GET /api/mr/:id/report on mount.
 * @param props Component props with MR identifier.
 */
export function MrDetailPage(props: { mrId: string }) {
  const { mrId } = props;
  const { fetchReport, executeMrAction } = useBoard();
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
  const close = () => {
    window.location.hash = '#/';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-label="MR Detail"
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg bg-card shadow-xl border border-border">
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors z-10"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {loading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-48 text-destructive gap-2">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        )}

        {report && !loading && (
          <div className="p-6">
            {/* MR header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <span className="font-mono">{report.mr.project}</span>
                <span className="font-semibold text-foreground">!{report.mr.iid}</span>
              </div>
              <h2 className="text-xl font-semibold">{report.mr.title}</h2>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span>Author: {report.mr.author}</span>
                <span>·</span>
                <span>Updated {formatTimeAgo(report.mr.updatedAt)}</span>
                <span>·</span>
                <span>Stage: {report.mr.stage}</span>
              </div>
              {report.verdict && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-sm font-medium">Verdict:</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      report.verdict === 'approved'
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : report.verdict === 'request_changes'
                          ? 'bg-red-400/15 text-red-300'
                          : 'bg-blue-400/15 text-blue-300'
                    }`}
                  >
                    {report.verdict === 'approved' && <CheckCircle className="h-3 w-3" />}
                    {report.verdict}
                  </span>
                </div>
              )}
            </div>

            {/* Findings section */}
            {report.findings.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Findings ({report.findings.length})
                </h3>
                <div className="space-y-2">
                  {report.findings.map(
                    (
                      f: { severity: string; file: string; line: number; message: string },
                      idx: number
                    ) => (
                      <div key={idx} className="rounded-md border bg-card p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              f.severity === 'error'
                                ? 'bg-red-400/15 text-red-300'
                                : f.severity === 'warning'
                                  ? 'bg-amber-400/15 text-amber-300'
                                  : 'bg-blue-400/15 text-blue-300'
                            }`}
                          >
                            {f.severity}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {f.file}:{f.line}
                          </span>
                        </div>
                        <p>{f.message}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* OperatorQuestion section */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Operator Question
              </h3>
              <div className="rounded-md border border-border bg-card p-3.5">
                <p className="text-[13px] mb-3">Review complete. What would you like to do?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void executeMrAction(mrId, 'review-decision', 'approve')}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-500 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => void executeMrAction(mrId, 'review-decision', 'request_changes')}
                    className="rounded-md border border-red-400/40 px-3 py-1.5 text-[13px] font-medium text-red-300 hover:bg-red-400/10 transition-colors"
                  >
                    Request Changes
                  </button>
                  <button
                    onClick={() => void executeMrAction(mrId, 'review-decision', 'comment')}
                    className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>

            {/* Audit trail */}
            {report.audit.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Audit Trail ({report.audit.length})
                </h3>
                <div className="space-y-1">
                  {report.audit.map((entry: { ts: string; event: string }, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-xs text-muted-foreground py-1 border-b border-border last:border-0"
                    >
                      <span className="font-mono">{entry.ts}</span>
                      <span className="font-medium">{entry.event}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
