// @file: UnassignedBlock — block for MRs without a role, with "Assign v" button per card.
// @consumers: BoardPage
// @tasks: TSK-107

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import type { MrCard as MrCardType } from '../../inbox-api/types.ts';
import { MrCard } from './MrCard.tsx';
import { useBoard } from '../services/board-store.tsx';
import { cn } from '../lib/utils.ts';

/** @purpose Known role targets for assignment. */
const KNOWN_ROLES = ['reviewer', 'author', 'mentioned'] as const;

/**
 * @purpose Block showing unassigned MRs with per-card "Assign" dropdown.
 * @param props Component props with unassigned MR cards.
 */
export function UnassignedBlock(props: { cards: MrCardType[] }) {
  const { cards } = props;
  const [collapsed, setCollapsed] = useState(false);
  const { assignMrToRole } = useBoard();

  return (
    <section
      className="rounded-lg border border-dashed bg-card/50 shadow-sm"
      role="region"
      aria-label="Unassigned MRs"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-t-lg hover:bg-accent/50 transition-colors',
          collapsed && 'rounded-b-lg'
        )}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <h2 className="text-sm font-semibold">БЕЗ РОЛИ</h2>
        <span className="text-xs text-muted-foreground">({cards.length})</span>
      </button>

      {!collapsed && (
        <div className="p-2.5 pt-0.5">
          {cards.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-3 text-center">
              Все MR распределены по ролям.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((mr) => (
                <UnassignedMrCard
                  key={`${mr.project}!${mr.iid}`}
                  mr={mr}
                  onAssign={(role) => void assignMrToRole(mr, role)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * @purpose An unassigned MR card with a role assignment dropdown.
 */
function UnassignedMrCard({ mr, onAssign }: { mr: MrCardType; onAssign: (role: string) => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [showMenu]);

  return (
    <div className="relative" role="listitem">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <MrCard mr={mr} />
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border border-border/80"
            title="Назначить"
            aria-label={`Assign ${mr.project}!${mr.iid} to role`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <ChevronDown className="h-3 w-3 ml-0.5 inline" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-lg p-1 w-36">
              {KNOWN_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    onAssign(role);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                >
                  {role}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
