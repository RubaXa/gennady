// @file: StatusBadge ink component — visual indicator for session status.
// @consumers: SessionCard
// @tasks: TSK-46

import { Text } from 'ink';

/** @purpose Props for the StatusBadge component — status selector. */
export type StatusBadgeProps = {
  /** @purpose Session status driving the visual indicator */
  status: 'active' | 'waiting' | 'idle' | 'completed';
};

/** @purpose Emoji + label mapping for each session status. */
const STATUS_DISPLAY: Record<StatusBadgeProps['status'], { emoji: string; label: string }> = {
  active: { emoji: '🔴', label: 'active' },
  waiting: { emoji: '⏳', label: 'waiting' },
  idle: { emoji: '🟡', label: 'idle' },
  completed: { emoji: '⬜', label: 'completed' },
};

/** @purpose Visual indicator of agent session status — emoji icon + text label.
 * @param props Component properties from StatusBadgeProps. */
export function StatusBadge(props: StatusBadgeProps) {
  const { status } = props;
  const display = STATUS_DISPLAY[status];
  return <Text>{display.emoji} {display.label}</Text>;
}
