// @file: ChatPanel — composition of ChatThread + ChatComposer; owns the ChatApiClient SSE subscription for one MR (D-112).
// @consumers: MrDetailPage, ViewSwitch (single-pane view)
// @tasks: TSK-130

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ChatApiClient } from '../services/chat-api-client.ts';
import { ChatThread } from './ChatThread.tsx';
import { ChatComposer, type ChatComposerHandle } from './ChatComposer.tsx';
import type { MutationProposalStatus } from './MutationProposalCard.tsx';
import type { ChatTurn, ContextChip, MutationProposal } from '../../inbox-chat/types.ts';

/** @purpose Key identifying one mutation within one turn — `${turnId}:${mutationIndex}`. */
function mutationKey(turn: ChatTurn, mutationIndex: number): string {
  return `${turn.id}:${mutationIndex}`;
}

/** @purpose Imperative handle letting a parent (MrDetailPage) attach a SelectionPill chip and focus the composer (CH-01). */
export type ChatPanelHandle = {
  /**
   * @purpose Append a context chip and focus the composer
   * @param chip Chip to attach.
   */
  attachChip: (chip: ContextChip) => void;
};

/**
 * @purpose Review Chat panel for `#/mr/:id` — permanent lower split half (D-112). Composes
 * `ChatThread` and `ChatComposer`; subscribes to the MR's SSE channel via `ChatApiClient`.
 * @invariant One `ChatApiClient` subscription per mount, closed on unmount; never re-subscribes on
 * every render (set up in a `[mrId]`-keyed effect).
 * @invariant A mutation applies ONLY on an explicit `MutationProposalCard` click — the SSE
 * `mutation` frame surfaces the proposal, never triggers `mutate()` itself (CH-11).
 */
export const ChatPanel = forwardRef<ChatPanelHandle, { mrId: string; onRefresh?: () => void }>(
  function ChatPanel(props, ref) {
    const { mrId, onRefresh } = props;
    const [turns, setTurns] = useState<ChatTurn[]>([]);
    const [activeChips, setActiveChips] = useState<ContextChip[]>([]);
    const [streaming, setStreaming] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [mutationStatuses, setMutationStatuses] = useState<
      Record<string, MutationProposalStatus>
    >({});
    const [mutationSnapshots, setMutationSnapshots] = useState<Record<string, string>>({});
    const [staleBanner, setStaleBanner] = useState(false);

    const clientRef = useRef<ChatApiClient>(new ChatApiClient());
    const composerRef = useRef<ChatComposerHandle>(null);

    useEffect(() => {
      const client = clientRef.current;
      const unsubscribe = client.subscribe(mrId, {
        onToken: (token) => {
          setStreaming(true);
          setStreamingText((prev) => prev + token);
        },
        onTurnDone: (turn) => {
          setTurns((prev) => [...prev, turn]);
          setStreaming(false);
          setStreamingText('');
        },
        onRefresh: () => {
          onRefresh?.();
        },
        onError: () => {
          setStreaming(false);
        },
      });

      return unsubscribe;
    }, [mrId, onRefresh]);

    /**
     * @purpose Send the composed question with the currently attached chips; clears chips on success.
     * @param text Question text from ChatComposer.
     */
    const sendTurn = useCallback(
      (text: string) => {
        setStreaming(true);
        void clientRef.current
          .postTurn(mrId, { text, chips: activeChips })
          .catch(() => setStreaming(false));
        setActiveChips([]);
      },
      [mrId, activeChips]
    );

    /**
     * @purpose Interrupt the current in-flight turn (CH-11).
     */
    const stopTurn = useCallback(() => {
      void clientRef.current.stop(mrId);
    }, [mrId]);

    /**
     * @purpose Attach a context chip from SelectionPill and focus the composer (CH-01); exposed to
     * the parent through `ChatPanelHandle`, not called internally.
     * @param chip Chip to attach.
     */
    const attachChip = useCallback((chip: ContextChip) => {
      setActiveChips((prev) => [...prev, chip]);
      composerRef.current?.focus();
    }, []);

    useImperativeHandle(ref, () => ({ attachChip }), [attachChip]);

    /**
     * @purpose Remove an attached chip by index.
     * @param index Index within `activeChips`.
     */
    const removeChip = useCallback((index: number) => {
      setActiveChips((prev) => prev.filter((_, i) => i !== index));
    }, []);

    /**
     * @purpose Apply a pending mutation via revision-CAS; on STALE_REVISION shows a banner instead of
     * silently retrying or dropping the click (D-99).
     * @param turn Turn the mutation belongs to (carries `reviewRevision`, the CAS input).
     * @param mutation Mutation to apply.
     * @param index Mutation's index within `turn.mutations`.
     */
    const applyMutation = useCallback(
      async (turn: ChatTurn, mutation: MutationProposal, index: number) => {
        const key = mutationKey(turn, index);
        const result = await clientRef.current.mutate(mrId, mutation, turn.reviewRevision);

        // #region START_HANDLE_MUTATE_RESULT — invariant: STALE_REVISION never applies silently; it always surfaces a banner (D-99)
        if (!result.ok) {
          setStaleBanner(true);
          return;
        }
        // #endregion END_HANDLE_MUTATE_RESULT

        setMutationStatuses((prev) => ({ ...prev, [key]: 'applied' }));
        setMutationSnapshots((prev) => ({ ...prev, [key]: result.snapshot }));
      },
      [mrId]
    );

    /**
     * @purpose Mark a pending mutation as rejected — client-side only, no server call (no reject route exists).
     * @param turn Turn the mutation belongs to.
     * @param mutation Rejected mutation.
     * @param index Mutation's index within `turn.mutations`.
     */
    const rejectMutation = useCallback(
      (turn: ChatTurn, _mutation: MutationProposal, index: number) => {
        setMutationStatuses((prev) => ({ ...prev, [mutationKey(turn, index)]: 'rejected' }));
      },
      []
    );

    /**
     * @purpose Undo a previously applied mutation via its stored snapshot id (CH-10).
     * @param turn Turn the mutation belongs to.
     * @param mutation Mutation being undone (unused directly — snapshot id was captured on apply).
     * @param index Mutation's index within `turn.mutations`.
     */
    const undoMutation = useCallback(
      async (turn: ChatTurn, _mutation: MutationProposal, index: number) => {
        const key = mutationKey(turn, index);
        const snapshotId = mutationSnapshots[key];
        if (!snapshotId) return;

        await clientRef.current.undo(mrId, snapshotId);
        setMutationStatuses((prev) => ({ ...prev, [key]: 'pending' }));
      },
      [mrId, mutationSnapshots]
    );

    /**
     * @purpose Look up a mutation's current status; defaults to 'pending' when untouched.
     * @param turn Turn the mutation belongs to.
     * @param index Mutation's index within `turn.mutations`.
     * @returns Current lifecycle status for MutationProposalCard.
     */
    const resolveMutationStatus = useCallback(
      (turn: ChatTurn, index: number): MutationProposalStatus =>
        mutationStatuses[mutationKey(turn, index)] ?? 'pending',
      [mutationStatuses]
    );

    return (
      <div className="flex flex-col min-h-0 flex-1 rounded-md border border-border bg-card">
        {staleBanner && (
          <div
            role="alert"
            className="flex items-center gap-1.5 border-b border-border bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            MR обновился в фоне, обновите панель
          </div>
        )}
        <ChatThread
          turns={turns}
          streamingText={streamingText}
          streaming={streaming}
          resolveMutationStatus={resolveMutationStatus}
          onApplyMutation={(turn, mutation, index) => void applyMutation(turn, mutation, index)}
          onRejectMutation={rejectMutation}
          onUndoMutation={(turn, mutation, index) => void undoMutation(turn, mutation, index)}
        />
        <ChatComposer
          ref={composerRef}
          chips={activeChips}
          onRemoveChip={removeChip}
          streaming={streaming}
          onSend={sendTurn}
          onStop={stopTurn}
        />
      </div>
    );
  }
);
