// @file: SelectionPill — floating "attach selection" pill over any selectable panel; attaches the selection as a ContextChip (D-113, CH-01).
// @consumers: ArtifactView, ArtifactBrowser, ActionPanel (any panel with selectable text)
// @tasks: TSK-130, TSK-132

import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { ContextChip, ContextChipKind, ContextChipOrigin } from '../../inbox-chat/types.ts';
import { resolveOrigin } from '../../inbox-chat/origin.ts';

/**
 * @purpose Derive a chip's file:line origin from the live selection (D-115) via `resolveOrigin`
 *   against the active artifact's raw source — a real quote→offset→line-number computation, not a
 *   DOM marker walk (no rendered artifact in this codebase carries `data-line`/`data-artifact`
 *   markers, so that path never resolved; TSK-132 P1 replaces it).
 * @invariant Degrades to `{ artifact, startLine: 1, endLine: 1 }` when there is no active artifact
 *   (`activeArtifact` null — e.g. selection made outside ArtifactBrowser) or the quote cannot be
 *   located inside its raw text — selection-to-context must never crash the panel.
 * @param text Selected text (already trimmed by the caller).
 * @param activeArtifact Name + raw text of the artifact currently rendered by ArtifactBrowser, or
 *   `null` when none is active.
 * @returns Concrete origin — real line span when resolvable, `{1,1}` sentinel otherwise.
 */
function resolveSelectionOrigin(
  text: string,
  activeArtifact: { name: string; rawText: string } | null
): ContextChipOrigin {
  const fallbackArtifact = window.location.hash || window.location.pathname;
  if (!activeArtifact) return { artifact: fallbackArtifact, startLine: 1, endLine: 1 };
  return resolveOrigin(activeArtifact.name, activeArtifact.rawText, text);
}

/** @purpose Debounce window after mouseup before the pill appears — avoids flicker mid-drag-selection. */
const SELECTION_DEBOUNCE_MS = 250;

/** @purpose Floating pill's screen position, anchored under the current selection's bounding rect. */
type PillPosition = { top: number; left: number };

/**
 * @purpose One shared floating pill mounted once at app shell level — listens for selection across
 * the document, not a per-panel copy (D-113).
 * @invariant Trigger is debounced post-mouseup on non-empty selection, PLUS a keyboard trigger
 * (`Mod+.`) for operators who select via keyboard, not mouse (NFC-CH-a11y).
 * @invariant Native copy/other mouseup behavior is left untouched — this only observes selection,
 * it never calls `preventDefault()` on mouseup.
 * @param props Callback invoked with a `ContextChip` when the operator attaches the selection; the
 *   composer is expected to gain focus after `onAttach` (CH-01). `activeArtifact` is the name + raw
 *   text of whatever ArtifactBrowser currently renders (D-115, TSK-132) — `null` when none is
 *   active, in which case origin degrades to the route-based `{1,1}` sentinel.
 */
export function SelectionPill(props: {
  onAttach: (chip: ContextChip) => void;
  activeArtifact?: { name: string; rawText: string } | null;
}) {
  const { onAttach, activeArtifact = null } = props;
  const [position, setPosition] = useState<PillPosition | null>(null);
  const [selectionText, setSelectionText] = useState('');
  const [origin, setOrigin] = useState<ContextChipOrigin | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    /**
     * @purpose Read the current window selection; if non-empty, place the pill under its bounding rect.
     */
    const evaluateSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';

      // #region START_HIDE_ON_EMPTY_SELECTION — invariant: pill must vanish the instant selection collapses (e.g. click elsewhere)
      if (!text || !selection || selection.rangeCount === 0) {
        setPosition(null);
        setSelectionText('');
        setOrigin(null);
        return;
      }
      // #endregion END_HIDE_ON_EMPTY_SELECTION

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionText(text);
      setOrigin(resolveSelectionOrigin(text, activeArtifact));
      setPosition({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
    };

    /**
     * @purpose Debounced mouseup handler — waits SELECTION_DEBOUNCE_MS before reading selection so
     *   the pill does not flicker while the operator is still dragging.
     */
    const onMouseUp = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(evaluateSelection, SELECTION_DEBOUNCE_MS);
    };

    /**
     * @purpose Keyboard trigger for operators who select text without a mouse (NFC-CH-a11y).
     * @param event Keyboard event; `Mod+.` (Cmd on Mac, Ctrl elsewhere) attaches the current selection.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      const modPressed = event.metaKey || event.ctrlKey;
      if (modPressed && event.key === '.') {
        event.preventDefault();
        evaluateSelection();
      }
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [activeArtifact]);

  if (!position) return null;

  /**
   * @purpose Attach the current selection as a ContextChip and dismiss the pill.
   */
  const attach = () => {
    const chip: ContextChip = {
      kind: 'selection' as ContextChipKind,
      quote: selectionText,
      source: window.location.hash || window.location.pathname,
      origin: origin ?? {
        artifact: window.location.hash || window.location.pathname,
        startLine: 1,
        endLine: 1,
      },
    };
    onAttach(chip);
    setPosition(null);
    setSelectionText('');
    setOrigin(null);
  };

  return (
    <button
      onClick={attach}
      style={{ position: 'absolute', top: position.top, left: position.left }}
      className="z-50 flex items-center gap-1.5 rounded-full border border-border bg-popover px-2.5 py-1 text-[12px] font-medium text-foreground shadow-md hover:bg-accent transition-colors"
    >
      <MessageSquarePlus className="h-3.5 w-3.5" />
      Спросить · В контекст
    </button>
  );
}
