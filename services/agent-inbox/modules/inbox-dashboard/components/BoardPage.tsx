// @file: BoardPage — root dashboard page: AwaitingQueue + RoleBlock list + UnassignedBlock.
// @consumers: App
// @tasks: TSK-107

import { useBoard } from '../services/board-store.tsx';
import { AwaitingQueue } from './AwaitingQueue.tsx';
import { RoleBlock } from './RoleBlock.tsx';
import { UnassignedBlock } from './UnassignedBlock.tsx';
import { Loader2 } from 'lucide-react';

/**
 * @purpose Main dashboard page with awaiting queue on top, role blocks below.
 * Lane transitions go to role engine (D-80); board is read-only overview.
 */
export function BoardPage() {
  const { board, loading } = useBoard();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No board data available.
      </div>
    );
  }

  // Aggregate all awaitingMe cards across all roles for the top queue
  const awaitingCards = board.roles.flatMap((r) => r.lanes.awaitingMe);
  const activeRoles = board.roles.filter((r) => r.active);
  const inactiveRoles = board.roles.filter((r) => !r.active);

  return (
    <main className="mx-auto max-w-[1600px] p-4 space-y-3">
      {awaitingCards.length > 0 && <AwaitingQueue cards={awaitingCards} />}

      {activeRoles.map((role) => (
        <RoleBlock key={role.name} role={role} />
      ))}

      {inactiveRoles.map((role) => (
        <RoleBlock key={role.name} role={role} />
      ))}

      <UnassignedBlock cards={board.unassigned} />
    </main>
  );
}
