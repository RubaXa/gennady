// @file: AwaitingQueue — "Waiting for me" queue aggregating all AWAITING ME cards across roles.
// @consumers: BoardPage
// @tasks: TSK-107

import { Clock } from 'lucide-react';
import type { MrCard as MrCardType } from '../../inbox-api/types.ts';
import { MrCard } from './MrCard.tsx';

/**
 * @purpose Top-level queue showing all MRs that are awaiting operator action across all roles.
 * @param props Component props with MR cards array.
 */
export function AwaitingQueue(props: { cards: MrCardType[] }) {
  const { cards } = props;
  return (
    <section
      aria-label="MRs awaiting my action"
      className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-semibold text-amber-300">Ждут меня</h2>
        <span className="text-xs text-amber-400/80">({cards.length})</span>
      </div>
      {cards.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Нет MR, ожидающих вашего действия.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((mr) => (
            <MrCard key={`${mr.project}!${mr.iid}`} mr={mr} className="bg-card/80" />
          ))}
        </div>
      )}
    </section>
  );
}
