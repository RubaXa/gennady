// @file: MrCard — single MR card with project info, time, status; click opens detail.
// @consumers: KanbanLane, UnassignedBlock, AwaitingQueue
// @tasks: TSK-107, TSK-155

import { useEffect, useState } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import type { MrCard as MrCardType, ReviewProgress } from '../../inbox-api/types.ts';
import { cn, formatTimeAgo } from '../lib/utils.ts';

/** @purpose Display label + accent color for a pipeline stage (AI-04), rendered as the card's graph-node status. */
const STAGE_BADGE: Record<string, { label: string; className: string }> = {
  review_needed: { label: 'Review needed', className: 'bg-blue-400/15 text-blue-300' },
  reply_needed: { label: 'Reply needed', className: 'bg-amber-400/15 text-amber-300' },
  awaiting_reply: { label: 'Awaiting reply', className: 'bg-purple-400/15 text-purple-300' },
  idle: { label: 'Idle', className: 'bg-white/8 text-muted-foreground' },
};

/** @purpose Display label + tint strip color for an MR role — surfaces the operator's relationship to each MR. */
const ROLE_BADGE: Record<string, { label: string; className: string; stripClass: string }> = {
  author: {
    label: 'Автор',
    className: 'bg-blue-400/15 text-blue-300',
    stripClass: 'border-l-blue-500 border-l-[3px]',
  },
  reviewer: {
    label: 'Ревьюер',
    className: 'bg-emerald-400/15 text-emerald-300',
    stripClass: 'border-l-emerald-500 border-l-[3px]',
  },
  mentioned: {
    label: 'Упомянут',
    className: 'bg-purple-400/15 text-purple-300',
    stripClass: 'border-l-purple-500 border-l-[3px]',
  },
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
 * @purpose Format an elapsed duration as `mm:ss`, or `h:mm:ss` once it reaches an hour.
 * @param elapsedMs Elapsed time in milliseconds | @invariant Negative input clamps to 0.
 * @returns Zero-padded clock string.
 */
function formatElapsedClock(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs)) return '--:--';
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * @purpose Live-ticking elapsed time for a review, anchored to `startedAt` when available.
 * @invariant Falls back to the server-snapshot `staticElapsedMs` when `startedAt` is null (no client anchor to tick from).
 * @param startedAt ISO start of the review's first node, or null if unavailable.
 * @param staticElapsedMs Server-computed elapsed snapshot at fetch time, used when `startedAt` is null.
 * @returns Elapsed milliseconds, updated once per second while `startedAt` is present.
 * @sideEffect Starts a 1s `setInterval` while `startedAt` is present; cleared on unmount or `startedAt` change.
 */
function useLiveElapsedMs(startedAt: string | null, staticElapsedMs: number): number {
  const [elapsedMs, setElapsedMs] = useState(() =>
    startedAt ? Date.now() - new Date(startedAt).getTime() : staticElapsedMs
  );

  useEffect(() => {
    if (!startedAt) return;
    const startTime = new Date(startedAt).getTime();
    const tick = () => setElapsedMs(Date.now() - startTime);
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [startedAt]);

  return elapsedMs;
}

/**
 * @purpose Compact review-progress informer: stage, lens-track counter, and a live elapsed timer.
 * @invariant Rendered only when the card carries `progress` (TSK-155); absent progress leaves the card unchanged.
 * @param props Review progress snapshot for the active review.
 */
function ReviewProgressInformer(props: { progress: ReviewProgress }) {
  const { progress } = props;
  const elapsedMs = useLiveElapsedMs(progress.startedAt, progress.elapsedMs);

  return (
    <div className="flex items-center gap-1.5 mt-1 min-w-0 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1 shrink-0">
        {progress.stage === 'synthesis' && <Sparkles className="h-3 w-3 text-purple-300" />}
        {progress.stageLabel}
      </span>
      <span className="shrink-0">
        {progress.tracksDone}/{progress.tracksPlanned} дорожек
      </span>
      {progress.tracksInProgress.length > 0 && (
        <span className="truncate min-w-0">идут: {progress.tracksInProgress.join(', ')}</span>
      )}
      <span className="ml-auto shrink-0 font-mono tabular-nums">
        {formatElapsedClock(elapsedMs)}
      </span>
    </div>
  );
}

/**
 * @purpose A single MR card showing project, IID, title, time since update, and graph-node status.
 * @param props MR card data and optional CSS class.
 */
export function MrCard(props: { mr: MrCardType; className?: string }) {
  const { mr, className } = props;
  const mrKey = `${mr.project}!${mr.iid}`;
  const stageBadge = resolveStageBadge(mr.stage);
  const roleBadge = mr.role ? ROLE_BADGE[mr.role] : null;
  const roleLabel = roleBadge?.label ?? 'Без роли';
  const tooltipText = mr.role ? `${roleLabel} · ${stageBadge.label}` : stageBadge.label;

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
        roleBadge?.stripClass,
        className
      )}
      role="listitem"
      aria-label={`${roleLabel} · MR ${mr.project}!${mr.iid}: ${mr.title}`}
      title={tooltipText}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
            <span className="font-mono truncate">{mr.project}</span>
            <span className="font-semibold text-foreground/90">!{mr.iid}</span>
          </div>
          <p className="text-[13px] font-medium leading-snug line-clamp-2">{mr.title}</p>
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
            {roleBadge && (
              <span
                className={cn('rounded px-1.5 py-px text-[10px] font-medium', roleBadge.className)}
              >
                {roleBadge.label}
              </span>
            )}
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
          {mr.progress && <ReviewProgressInformer progress={mr.progress} />}
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
