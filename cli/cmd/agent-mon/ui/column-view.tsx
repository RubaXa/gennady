// @file: ColumnView ink component — dashboard with provider columns arranged horizontally.
// @consumers: AgentMonApp
// @tasks: TSK-46

import { Box, Text } from 'ink';
import type { ViewModel } from '../state/view-model.type.ts';
import { ProviderColumn } from './provider-column.tsx';

/** @purpose Props for the ColumnView component — dashboard ViewModel. */
export type ColumnViewProps = {
  viewModel: ViewModel;
  maxRows?: number;
};

/**
 * @purpose Dashboard view that renders provider columns horizontally.
 * @invariant Empty columns → "No active sessions." message (degradation per spec).
 */
export function ColumnView({ viewModel, maxRows }: ColumnViewProps) {
  const columns = viewModel.data?.columns ?? [];
  const nCols = columns.length || 1;
  const perColumn = maxRows ? Math.floor(maxRows / nCols) : undefined;

  // #region START_EMPTY_STATE — invariant: no columns = no data yet or all providers idle → show placid message
  if (columns.length === 0) {
    return <Text>No active sessions.</Text>;
  }
  // #endregion END_EMPTY_STATE

  return (
    <Box flexDirection="row" gap={1}>
      {columns.map((col) => (
        <ProviderColumn key={col.provider} column={col} maxCards={perColumn} />
      ))}
    </Box>
  );
}
