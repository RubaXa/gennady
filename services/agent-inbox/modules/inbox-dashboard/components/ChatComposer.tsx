// @file: ChatComposer — chat input + removable ContextChip row + token-budget gauge + Send/Stop toggle (CH-11, CH-12, D-104).
// @consumers: ChatPanel
// @tasks: TSK-130, TSK-132

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Send, Square, X } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import type { ContextChip } from '../../inbox-chat/types.ts';

/** @purpose Chars-per-token ratio for the client-side token-budget gauge estimate (CH-12) — an approximation, not a billing figure. */
const CHARS_PER_TOKEN_ESTIMATE = 4;

/** @purpose Token budget the gauge fills against; purely a UI signal, not an enforced server limit. */
const TOKEN_BUDGET = 4_000;

/**
 * @purpose Estimate token count for the gauge from composer text plus attached chip quotes.
 * @param text Current composer input text.
 * @param chips Attached context chips.
 * @returns Approximate token count.
 */
function estimateTokenCount(text: string, chips: ContextChip[]): number {
  const chipChars = chips.reduce((sum, chip) => sum + chip.quote.length, 0);
  return Math.ceil((text.length + chipChars) / CHARS_PER_TOKEN_ESTIMATE);
}

/** @purpose Imperative handle letting a parent (ChatPanel) focus the composer's input after a SelectionPill attach (CH-01). */
export type ChatComposerHandle = {
  /** @purpose Move keyboard focus into the composer's textarea. */
  focus: () => void;
};

/**
 * @purpose Composer for review chat: text input, removable context chips, token-budget gauge,
 * Send↔Stop toggle for in-flight turn state (D-104).
 * @invariant Input and chip removal are disabled while `streaming` is true — a second question
 * cannot be sent alongside an in-flight turn (D-104, CH-11).
 */
export const ChatComposer = forwardRef<
  ChatComposerHandle,
  {
    chips: ContextChip[];
    onRemoveChip: (index: number) => void;
    streaming: boolean;
    onSend: (text: string) => void;
    onStop: () => void;
  }
>(function ChatComposer(props, ref) {
  const { chips, onRemoveChip, streaming, onSend, onStop } = props;
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const tokenCount = estimateTokenCount(text, chips);
  const tokenRatio = Math.min(tokenCount / TOKEN_BUDGET, 1);

  /**
   * @purpose Submit the composed question and clear the input; no-op on blank text.
   */
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border p-2">
      {chips.length > 0 && (
        <ul aria-label="Контекст вопроса" className="flex flex-wrap gap-1.5">
          {chips.map((chip, index) => (
            <li
              key={`${chip.source}-${index}`}
              className="group flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-foreground/90"
            >
              <span className="max-w-[220px] truncate" title={chip.quote}>
                {chip.origin.artifact}#L{chip.origin.startLine}-L{chip.origin.endLine}
              </span>
              <button
                onClick={() => onRemoveChip(index)}
                disabled={streaming}
                aria-label="Убрать контекст"
                className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity disabled:opacity-0"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          disabled={streaming}
          rows={2}
          placeholder="Спросить о ревью..."
          className="flex-1 resize-none rounded-md border border-border bg-background p-1.5 text-[12px] disabled:opacity-60"
        />
        <button
          onClick={streaming ? onStop : submit}
          disabled={!streaming && !text.trim()}
          className={cn(
            'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            streaming
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {streaming ? <Square className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
          {streaming ? 'Stop' : 'Send'}
        </button>
      </div>

      <div
        role="progressbar"
        aria-label="Использование токенового бюджета"
        aria-valuenow={Math.round(tokenRatio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 w-full rounded-full bg-secondary/50"
      >
        <div
          style={{ width: `${tokenRatio * 100}%` }}
          className={cn(
            'h-full rounded-full transition-[width]',
            tokenRatio > 0.9 ? 'bg-destructive' : 'bg-primary'
          )}
        />
      </div>
    </div>
  );
});
