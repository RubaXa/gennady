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
  /** @purpose Just-sent question, echoed before the real turn lands (B9) — null when idle. */
  pendingQuestion: string | null;
  streamingText: string;
  streaming: boolean;
  resolveMutationStatus: (turn: ChatTurn, mutationIndex: number) => MutationProposalStatus;
  onApplyMutation: (turn: ChatTurn, mutation: MutationProposal, mutationIndex: number) => void;
  onRejectMutation: (turn: ChatTurn, mutation: MutationProposal, mutationIndex: number) => void;
  onUndoMutation: (turn: ChatTurn, mutation: MutationProposal, mutationIndex: number) => void;
}) {
  const {
    turns,
    pendingQuestion,
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
          {turn.chips.length > 0 && (
            <ul aria-label="Контекст вопроса" className="flex flex-wrap gap-1">
              {turn.chips.map((chip, idx) => (
                <li
                  key={idx}
                  className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {chip.origin.artifact}:{chip.origin.startLine}-{chip.origin.endLine}
                </li>
              ))}
            </ul>
          )}
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

      {pendingQuestion !== null && (
        <p
          className="text-[12px] font-medium text-foreground/90"
          data-testid="chat-pending-question"
        >
          {pendingQuestion}
        </p>
      )}

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
