// @file: MutationProposalCard — diff-preview + provenance tag + Apply/Reject/Undo for an assistant-proposed mutation (CH-09, CH-10, D-98).
// @consumers: ChatThread
// @tasks: TSK-130

import { Check, Quote, RotateCcw, X } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import type { MutationProposal } from '../../inbox-chat/types.ts';

/** @purpose Lifecycle status of one mutation proposal card within a chat turn. */
export type MutationProposalStatus = 'pending' | 'applied' | 'rejected';

/**
 * @purpose Render a value (before/after) for the diff preview; unknown shapes fall back to JSON.
 * @param value Value to render.
 * @returns Human-readable string for the diff preview.
 */
function renderDiffValue(value: unknown): string {
  if (value === undefined) return '(удалено)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * @purpose Diff-preview card for one proposed mutation — before→after, a provenance tag when
 * grounded in MR text (CH-09, D-98), plus a status-dependent action row (CH-10).
 * @invariant The provenance tag renders BEFORE the Apply button whenever present — visible to the
 * operator before they can act on the proposal (CH-09, D-98).
 * @invariant Applying a mutation is never automatic — fires `onApply` only on an explicit click;
 * nothing here applies a mutation as tokens stream in (CH-11).
 * @param props Proposal contents, its current status, and the action callbacks.
 */
export function MutationProposalCard(props: {
  proposal: MutationProposal;
  status: MutationProposalStatus;
  onApply: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const { proposal, status, onApply, onReject, onUndo } = props;
  const isRemoval = proposal.op === 'remove';

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-secondary/30 p-2 text-[12px]">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="font-mono">{proposal.op}</span>
        <span>·</span>
        <span className="font-mono truncate">{proposal.target}</span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="rounded bg-destructive/10 px-1.5 py-1 text-destructive line-through decoration-destructive/60">
          {renderDiffValue(proposal.before)}
        </div>
        {!isRemoval && (
          <div className="rounded bg-emerald-600/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-400">
            {renderDiffValue(proposal.after)}
          </div>
        )}
      </div>

      {proposal.provenance?.groundedInMrText && (
        <div className="flex items-start gap-1 rounded border border-border/60 bg-background px-1.5 py-1 text-[11px] text-muted-foreground">
          <Quote className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            grounded in MR text:{' '}
            <span className="italic">&laquo;{proposal.provenance.quote}&raquo;</span>
          </span>
        </div>
      )}

      <div className="flex gap-1.5">
        {status === 'pending' && (
          <>
            <CardActionButton icon={Check} label="Применить" onClick={onApply} primary />
            <CardActionButton icon={X} label="Отклонить" onClick={onReject} />
          </>
        )}
        {status === 'applied' && (
          <CardActionButton icon={RotateCcw} label="Undo" onClick={onUndo} />
        )}
        {status === 'rejected' && <span className="text-muted-foreground">Отклонено</span>}
      </div>
    </div>
  );
}

/**
 * @purpose Small action button used in the card's action row.
 * @param props Icon, label, click handler, primary styling flag.
 */
function CardActionButton(props: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  const { icon: Icon, label, onClick, primary } = props;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
        primary
          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
          : 'border border-border text-foreground hover:bg-accent'
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
