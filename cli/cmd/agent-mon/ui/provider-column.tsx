// @file: ProviderColumn ink component — one provider column with header + session cards.
// @consumers: ColumnView
// @tasks: TSK-46

import { Box, Text } from 'ink';
import type { ProviderColumn as ProviderColumnData } from '../state/view-model.type.ts';
import { SessionCard } from './session-card.tsx';

/** @purpose Props for the ProviderColumn component — column data to render. */
export type ProviderColumnProps = {
  column: ProviderColumnData;
  maxCards?: number;
};

/**
 * @purpose Renders one provider column — header with status counts, then stacked session cards.
 * @invariant Sessions within the column are pre-sorted by status priority (active → waiting → idle → completed) by groupByProvider; no re-sort needed here.
 */
export function ProviderColumn({ column, maxCards }: ProviderColumnProps) {
  const cards = maxCards ? column.sessions.slice(0, maxCards) : column.sessions;
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} width={34}>
      <Box>
        <Text bold>{column.provider}</Text>
        <Text>  </Text>
        {column.activeCount > 0 && <Text color="red">🔴{column.activeCount} </Text>}
        {column.waitingCount > 0 && <Text color="yellow">⏳{column.waitingCount} </Text>}
        {column.idleCount > 0 && <Text dimColor>🟡{column.idleCount}</Text>}
      </Box>
      {cards.map((card) => (
        <SessionCard key={card.sessionId} card={card} />
      ))}
    </Box>
  );
}
