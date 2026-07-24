// @file: DebugLogButton — shared 🐞 header control: copies the in-memory log buffer to the clipboard
//   with a toast, and highlights when an unhandled error occurred (spec §3). One instance in Header.
// @consumers: Header
// @tasks: TSK-debug-log

import { useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import {
  snapshotLogs,
  subscribeErrorState,
  clearErrorState,
  mergeTimeline,
} from '../services/debug-log.ts';
import { fetchServerLog } from '../services/api-client.ts';

/**
 * @purpose 🐞 button: copies buffered logs to the clipboard and toasts the count; on clipboard
 *   failure shows an explicit error, never silent (spec §3.2).
 */
export function DebugLogButton() {
  const [toast, setToast] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => subscribeErrorState(setHasError), []);

  const copyLogs = async (): Promise<void> => {
    const { text, count } = snapshotLogs();
    // Pull the server-log tail too — a review-flow failure (lens/synthesis/effect) lives
    // server-side and would be absent from the browser buffer alone. Never blocks the copy.
    const serverLines = await fetchServerLog();
    const blob = mergeTimeline(count ? text.split('\n') : [], serverLines);
    try {
      await navigator.clipboard.writeText(blob);
      setToast(`Телеметрия скопирована (клиент ${count} + сервер ${serverLines.length})`);
      clearErrorState();
    } catch {
      setToast('Буфер обмена недоступен');
    }
    window.setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="relative">
      <button
        onClick={() => void copyLogs()}
        aria-label="Скопировать диагностические логи"
        title="Скопировать логи сессии"
        className={cn(
          'rounded-md p-1.5 transition-colors hover:bg-accent hover:text-foreground',
          hasError ? 'text-destructive animate-pulse' : 'text-muted-foreground'
        )}
      >
        <Bug className="h-4 w-4" />
      </button>
      {toast && (
        <span
          role="status"
          className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
        >
          {toast}
        </span>
      )}
    </div>
  );
}
