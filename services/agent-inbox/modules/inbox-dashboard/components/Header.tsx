// @file: Header — app header with title, status indicator, and polling countdown.
// @consumers: App
// @tasks: TSK-107

import { Activity, WifiOff } from 'lucide-react';
import { useBoard } from '../services/board-store.tsx';

/**
 * @purpose Dashboard header: title "agent-inbox", API status, polling countdown.
 */
export function Header() {
  const { error, pollCountdown } = useBoard();

  return (
    <header className="border-b border-border bg-card/60 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">agent-inbox</h1>
        {error ? (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <WifiOff className="h-3.5 w-3.5" />
            API недоступен
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            Online
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">Next poll: {pollCountdown}s</div>
    </header>
  );
}
