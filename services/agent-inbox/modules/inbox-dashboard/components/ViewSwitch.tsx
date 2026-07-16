// @file: ViewSwitch — always-visible segmented control (Candidates|Chat) for narrow viewport MrDetailPage (D-106).
// @consumers: MrDetailPage
// @tasks: TSK-130

import { cn } from '../lib/utils.ts';

/** @purpose Which single pane is active on a narrow viewport. */
export type MrDetailView = 'candidates' | 'chat';

/**
 * @purpose Segmented control always rendered on narrow viewport, never hidden (D-106) — flips
 * between ActionPanel and ChatPanel when both cannot fit side by side.
 * @param props Current active view and the change callback.
 */
export function ViewSwitch(props: {
  active: MrDetailView;
  onChange: (view: MrDetailView) => void;
}) {
  const { active, onChange } = props;

  return (
    <div
      role="tablist"
      className="flex shrink-0 gap-1 rounded-md border border-border bg-secondary/30 p-1"
    >
      <SegmentButton label="Кандидаты" view="candidates" active={active} onChange={onChange} />
      <SegmentButton label="Чат" view="chat" active={active} onChange={onChange} />
    </div>
  );
}

/**
 * @purpose One segment of the ViewSwitch control.
 * @param props Segment label/view id, current active view, and the change callback.
 */
function SegmentButton(props: {
  label: string;
  view: MrDetailView;
  active: MrDetailView;
  onChange: (view: MrDetailView) => void;
}) {
  const { label, view, active, onChange } = props;
  const isActive = active === view;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => onChange(view)}
      className={cn(
        'flex-1 rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}
