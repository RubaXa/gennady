// @file: MrCard — single MR card with project info, time, status; click opens detail.
// @consumers: KanbanLane, UnassignedBlock, AwaitingQueue
// @tasks: TSK-107

import { ExternalLink } from 'lucide-react';
import type { MrCard as MrCardType } from '../../inbox-api/types.ts';
import { cn, formatTimeAgo } from '../lib/utils.ts';

/** @purpose Display label + accent color for a pipeline stage (AI-04), rendered as the card's graph-node status. */
const STAGE_BADGE: Record<string, { label: string; className: string }> = {
  review_needed: { label: 'Review needed', className: 'bg-blue-400/15 text-blue-300' },
  reply_needed: { label: 'Reply needed', className: 'bg-amber-400/15 text-amber-300' },
  awaiting_reply: { label: 'Awaiting reply', className: 'bg-purple-400/15 text-purple-300' },
  idle: { label: 'Idle', className: 'bg-white/8 text-muted-foreground' },
};

/**
 * @purpose Resolve the graph-node badge for a stage value, falling back to the raw string for unknown stages.
 * @param stage Pipeline stage (AI-04).
 * @returns Badge label and accent class.
 */
function resolveStageBadge(stage: string): { label: string; className: string } {
  return STAGE_BADGE[stage] ?? { label: stage, className: 'bg-white/8 text-muted-foreground' };
}

/**
 * @purpose A single MR card showing project, IID, title, time since update, and graph-node status.
 * @invariant Per-track progress is NOT rendered — `ActionableMr` carries only a single `stage` string,
 *   no per-track summary; showing it needs an inbox-api contract addition.
 * @param props MR card data and optional CSS class.
 */
export function MrCard(props: { mr: MrCardType; className?: string }) {
  const { mr, className } = props;
  const mrKey = `${mr.project}!${mr.iid}`;
  const stageBadge = resolveStageBadge(mr.stage);

  /**
   * @purpose Navigate to MR detail via hash router.
   */
  const openDetail = () => {
    window.location.hash = `#/mr/${encodeURIComponent(mrKey)}`;
  };

  return (
    <div
      onClick={openDetail}
      className={cn(
        'group relative rounded-md border border-border/80 bg-card p-2.5 cursor-pointer',
        'hover:border-primary/50 hover:bg-accent/40 transition-colors',
        className
      )}
      role="listitem"
      aria-label={`MR ${mr.project}!${mr.iid}: ${mr.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
            <span className="font-mono truncate">{mr.project}</span>
            <span className="font-semibold text-foreground/90">!{mr.iid}</span>
          </div>
          <p className="text-[13px] font-medium leading-snug line-clamp-2">{mr.title}</p>
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn('rounded px-1.5 py-px text-[10px] font-medium', stageBadge.className)}
            >
              {stageBadge.label}
            </span>
            <span>{formatTimeAgo(mr.updatedAt)}</span>
            {mr.draft && (
              <span className="rounded bg-white/8 px-1.5 py-px text-[10px] font-medium">Draft</span>
            )}
            {mr.directlyAddressed && (
              <span className="rounded bg-blue-400/15 px-1.5 py-px text-[10px] font-medium text-blue-300">
                @me
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openDetail();
          }}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-all"
          aria-label={`View MR ${mr.project}!${mr.iid}`}
          title="Смотреть"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
