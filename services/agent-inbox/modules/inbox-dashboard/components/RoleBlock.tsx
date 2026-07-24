// @file: RoleBlock — collapsible role block with four Kanban lanes (INBOX → PROGRESS → AWAITING → DONE).
// @consumers: BoardPage
// @tasks: TSK-107

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RoleView } from '../../inbox-api/types.ts';
import { KanbanLane } from './KanbanLane.tsx';
import { useBoard } from '../services/board-store.tsx';
import { cn } from '../lib/utils.ts';

/**
 * @purpose A role block displaying name, active status, and four Kanban lanes.
 * @param props Component props with role view data.
 */
export function RoleBlock(props: { role: RoleView }) {
  const { role } = props;
  const [collapsed, setCollapsed] = useState(false);
  const { toggleRoleActive } = useBoard();

  return (
    <section
      className="rounded-lg border bg-card shadow-sm"
      role="region"
      aria-label={`Role: ${role.name}`}
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
        <h2 className="text-sm font-semibold" id={`role-${role.name}-heading`}>
          {role.name}
        </h2>
        <span
          role="button"
          tabIndex={0}
          aria-label={`${role.active ? 'Деактивировать' : 'Активировать'} роль ${role.name} (авто-назначение)`}
          onClick={(e) => {
            e.stopPropagation();
            void toggleRoleActive(role.name, !role.active);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              void toggleRoleActive(role.name, !role.active);
            }
          }}
          className={cn(
            'rounded-full px-2 py-px text-[11px] font-medium cursor-pointer hover:opacity-80',
            role.active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-muted-foreground'
          )}
        >
          {role.active ? 'active' : 'inactive'}
        </span>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-2.5 pt-0.5">
          <KanbanLane title="INBOX" cards={role.lanes.inbox} accentClass="text-blue-400" />
          <KanbanLane
            title="PROGRESS"
            cards={role.lanes.inProgress}
            accentClass="text-yellow-400"
          />
          <KanbanLane title="AWAITING" cards={role.lanes.awaitingMe} accentClass="text-amber-400" />
          <KanbanLane title="DONE" cards={role.lanes.done} accentClass="text-emerald-400" />
        </div>
      )}
    </section>
  );
}
