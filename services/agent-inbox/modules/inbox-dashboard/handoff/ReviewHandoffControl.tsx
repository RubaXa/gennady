// @file: ReviewHandoffControl — full/delta clipboard handoff control with delivery acknowledgement.
// @consumers: MrWorkspace
// @tasks: TSK-182

import { useState } from 'react';
import { dashboardV2Api } from '../dashboard-v2-api.ts';
import { ClipboardAdapter } from './ClipboardAdapter.ts';

// purpose: singleton adapter per control instance; reused across renders so retry never re-creates state
const adapter = new ClipboardAdapter();

/**
 * @purpose Full/delta clipboard handoff control: generates server-side handoff text and writes to browser clipboard.
 * @invariant Baseline advances only after confirmed browser clipboard success.
 * @invariant Clipboard failure shows retry button — no file download fallback.
 * @param props Active MR reference.
 */
export function ReviewHandoffControl(props: { mrRef: string }) {
  const { mrRef } = props;
  const [state, setState] = useState<'idle' | 'copying' | 'success' | 'denied'>('idle');
  const [mode, setMode] = useState<'full' | 'delta'>('full');

  /**
   * @purpose Fetch handoff text from server, write to clipboard, surface outcome.
   * @param chosen Handoff generation mode.
   * @sideEffect Network: GET /api/mr/:ref/handoff; Browser: navigator.clipboard.writeText
   */
  const copyHandoff = async (chosen: 'full' | 'delta'): Promise<void> => {
    setMode(chosen);
    setState('copying');

    // #region START_HANDOFF_COPY_FLOW — invariant: clipboard write follows server fetch; failure at either step → 'denied' shown
    try {
      const { text } = await dashboardV2Api.handoff(mrRef, chosen);
      const outcome = await adapter.writeAndAcknowledge(text);
      setState(outcome === 'success' ? 'success' : 'denied');
    } catch {
      setState('denied');
    }
    // #endregion END_HANDOFF_COPY_FLOW
  };

  const retry = (): void => {
    void copyHandoff(mode);
  };

  return (
    <div className="v2-handoff-control" aria-label="Передача задачи">
      <span className="v2-handoff-label">Передать задачу</span>
      <div className="v2-handoff-buttons">
        <button
          disabled={state === 'copying'}
          onClick={() => void copyHandoff('full')}
          title="Полная передача: все текущие находки"
        >
          Полная
        </button>
        <button
          disabled={state === 'copying'}
          onClick={() => void copyHandoff('delta')}
          title="Дельта: изменения с последней подтверждённой передачи"
        >
          Дельта
        </button>
      </div>
      {state === 'copying' && (
        <p className="v2-handoff-status" aria-live="polite">
          ⏳ Копирую…
        </p>
      )}
      {state === 'success' && (
        <p className="v2-handoff-status v2-handoff-ok" aria-live="polite">
          ✔ Скопировано
        </p>
      )}
      {state === 'denied' && (
        <p className="v2-handoff-status v2-handoff-err" role="alert">
          ✘ Нет доступа к буферу обмена <button onClick={retry}>Повторить</button>
        </p>
      )}
    </div>
  );
}
