// @file: ColumnView ink component — dashboard with provider columns arranged horizontally.
// @consumers: AgentMonApp
// @tasks: TSK-46

import { Box, Text } from 'ink';
import type { ViewModel } from '../state/view-model.type.ts';
import { ProviderColumn } from './provider-column.tsx';

/** @purpose Props for the ColumnView component — dashboard ViewModel. */
export type ColumnViewProps = {
  /** @purpose Dashboard ViewModel containing columns data. */
  viewModel: ViewModel;
  /** @purpose Max rows per column for terminal height adaptation. */
  maxRows?: number;
};

/**
 * @purpose Dashboard view that renders provider columns horizontally.
 * @invariant Empty columns → "No active sessions." message (degradation per spec).
 * @param props Component properties from ColumnViewProps.
 */
export function ColumnView(props: ColumnViewProps) {
  const { viewModel, maxRows } = props;
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
