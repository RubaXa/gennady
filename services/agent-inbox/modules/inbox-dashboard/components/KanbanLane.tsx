// @file: KanbanLane — read-only Kanban column (lanes are moved by the role engine, not the operator).
// @consumers: RoleBlock
// @tasks: TSK-107

import type { MrCard as MrCardType } from '../../inbox-api/types.ts';
import { MrCard } from './MrCard.tsx';
import { cn } from '../lib/utils.ts';

/** @purpose Props for a single Kanban lane column. */
type KanbanLaneProps = {
  /** @purpose Display title (INBOX, PROGRESS, AWAITING, DONE). */
  title: string;
  /** @purpose Cards in this lane. */
  cards: MrCardType[];
  /** @purpose Accent text color class for the card counter. */
  accentClass?: string;
};

/**
 * @purpose A single read-only Kanban column.
 * @param props Lane display props — title, cards, optional accent class.
 */
export function KanbanLane(props: KanbanLaneProps) {
  const { title, cards, accentClass } = props;
  return (
    <div
      className="flex flex-col rounded-md border border-border/70 bg-white/[0.015] min-h-[88px]"
      role="region"
      aria-label={`${title} lane`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{title}</span>
        <span className={cn('font-semibold tabular-nums', accentClass)}>{cards.length}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-1.5 flex-1" role="list">
        {cards.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60 text-center py-3">—</p>
        ) : (
          cards.map((mr) => <MrCard key={`${mr.project}!${mr.iid}`} mr={mr} />)
        )}
      </div>
    </div>
  );
}
