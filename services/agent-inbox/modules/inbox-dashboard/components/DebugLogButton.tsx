// @file: DebugLogButton — shared 🐞 header control: copies the client ring buffer plus the server
//   log tail (GET /api/diagnostics) to the clipboard with a toast, and highlights on unhandled error.
// @consumers: MrWorkspace
// @tasks: TSK-debug-log

import { useEffect, useState } from 'react';
import {
  snapshotLogs,
  subscribeErrorState,
  clearErrorState,
  installGlobalErrorHandlers,
} from '../services/debug-log.ts';

/**
 * @purpose Copy client and best-effort server logs, report the count, and expose clipboard failures.
 */
export function DebugLogButton() {
  const [toast, setToast] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    installGlobalErrorHandlers();
    return subscribeErrorState(setHasError);
  }, []);

  const copyLogs = async (): Promise<void> => {
    const client = snapshotLogs();
    let serverTail = '';
    try {
      const response = await fetch('/api/diagnostics?limit=400');
      if (response.ok) {
        const body = (await response.json()) as { lines?: string[] };
        serverTail = (body.lines ?? []).join('\n');
      }
    } catch {
      // server diagnostics are best-effort — the client buffer still copies
    }

    const parts = [client.text];
    if (serverTail) parts.push(`\n=== SERVER LOG ===\n${serverTail}`);
    const text = parts.join('\n');
    const count = client.count + (serverTail ? serverTail.split('\n').length : 0);

    try {
      await navigator.clipboard.writeText(text);
      setToast(`Логи скопированы (${count})`);
      clearErrorState();
    } catch {
      setToast('Буфер обмена недоступен');
    }
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="v2-debug-log">
      <button
        type="button"
        onClick={() => void copyLogs()}
        aria-label="Скопировать диагностические логи"
        title="Скопировать логи сессии"
        className={hasError ? 'v2-debug-log-error' : ''}
      >
        🐞
      </button>
      {toast && (
        <span role="status" className="v2-debug-log-toast">
          {toast}
        </span>
      )}
    </div>
  );
}
