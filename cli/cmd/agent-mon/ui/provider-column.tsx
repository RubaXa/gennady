// @file: ProviderColumn ink component — one provider column with header + session cards.
// @consumers: ColumnView
// @tasks: TSK-46

import { Box, Text } from 'ink';
import type { ProviderColumn as ProviderColumnData } from '../state/view-model.type.ts';
import { SessionCard } from './session-card.tsx';

/** @purpose Props for the ProviderColumn component — column data to render. */
export type ProviderColumnProps = {
  /** @purpose Provider column data from the ViewModel */
  column: ProviderColumnData;
};

/**
 * @purpose Renders one provider column — header with status counts, then stacked session cards.
 * @invariant Sessions within the column are pre-sorted by status priority (active → waiting → idle → completed) by groupByProvider; no re-sort needed here.
 * @param column Provider column data with sessions.
 */
export function ProviderColumn({ column }: ProviderColumnProps) {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} width={40}>
      <Box>
        <Text bold>{column.provider}</Text>
        <Text>  </Text>
        {column.activeCount > 0 && <Text color="red">🔴{column.activeCount} </Text>}
        {column.waitingCount > 0 && <Text color="yellow">⏳{column.waitingCount} </Text>}
        {column.idleCount > 0 && <Text dimColor>🟡{column.idleCount}</Text>}
      </Box>
      {column.sessions.map((card) => (
        <SessionCard key={card.sessionId} card={card} />
      ))}
    </Box>
  );
}
