// @file: ChatThread — scrollback of completed ChatTurns + the active streaming turn in an aria-live region (NFC-CH-a11y).
// @consumers: ChatPanel
// @tasks: TSK-130

import type { ChatTurn, MutationProposal } from '../../inbox-chat/types.ts';
import { MutationProposalCard, type MutationProposalStatus } from './MutationProposalCard.tsx';

/**
 * @purpose Scrollback of finished turns plus the streaming answer, in an `aria-live="polite"` region
 * for screen readers (NFC-CH-a11y). Turns with `mutations` render a `MutationProposalCard` each.
 * @param props Completed turns, the in-flight streaming text (empty when idle), the per-mutation
 *   status lookup, and the Apply/Reject/Undo callbacks threaded down to each card.
 */
export function ChatThread(props: {
  turns: ChatTurn[];
  streamingText: string;
  streaming: boolean;
  resolveMutationStatus: (turn: ChatTurn, mutationIndex: number) => MutationProposalStatus;
  onApplyMutation: (turn: ChatTurn, mutation: MutationProposal, mutationIndex: number) => void;
  onRejectMutation: (turn: ChatTurn, mutation: MutationProposal, mutationIndex: number) => void;
  onUndoMutation: (turn: ChatTurn, mutation: MutationProposal, mutationIndex: number) => void;
}) {
  const {
    turns,
    streamingText,
    streaming,
    resolveMutationStatus,
    onApplyMutation,
    onRejectMutation,
    onUndoMutation,
  } = props;

  return (
    <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 p-2">
      {turns.map((turn) => (
        <div key={turn.id} className="flex flex-col gap-1.5">
          <p className="text-[12px] font-medium text-foreground/90" data-testid="chat-question">
            {turn.question}
          </p>
          <p
            className="text-[12px] text-foreground/80 whitespace-pre-wrap"
            data-testid="chat-answer"
          >
            {turn.answer}
          </p>
          {turn.mutations?.map((mutation, index) => (
            <MutationProposalCard
              key={`${turn.id}-${index}`}
              proposal={mutation}
              status={resolveMutationStatus(turn, index)}
              onApply={() => onApplyMutation(turn, mutation, index)}
              onReject={() => onRejectMutation(turn, mutation, index)}
              onUndo={() => onUndoMutation(turn, mutation, index)}
            />
          ))}
        </div>
      ))}

      {streaming && (
        <div
          aria-live="polite"
          data-testid="chat-streaming"
          className="text-[12px] text-foreground/80 whitespace-pre-wrap"
        >
          {streamingText}
        </div>
      )}
    </div>
  );
}
