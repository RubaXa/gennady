// @file: AgentMonApp root ink component — lifecycle, input handling, state subscription → view selection.
// @consumers: cmd/agent-mon (via gennady render)
// @tasks: TSK-46

import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { StateManager } from '../state/create-state-manager.ts';
import type { ViewModel } from '../state/view-model.type.ts';
import { ColumnView } from './column-view.tsx';

/** @purpose Props for the AgentMonApp root component. */
export type AgentMonAppProps = {
  /** @purpose State manager providing ViewModel snapshots and subscription lifecycle */
  stateManager: StateManager;
  /** @purpose Dashboard view variant — 'column' renders ColumnView (default) */
  view?: 'column' | 'compact';
};

/**
 * @purpose Root ink component — subscribes to state manager, handles keyboard exit, selects the active view.
 * @invariant Subscribes on mount, unsubscribes on unmount — no leaks.
 * @invariant Loading → "Scanning for active sessions..."; error → red message + last data if available.
 * @param stateManager State manager instance for ViewModel subscriptions.
 * @param view Dashboard view variant (default 'column').
 * @sideEffect Keyboard input capture for exit (Esc, q, Ctrl+C).
 */
export function AgentMonApp({ stateManager, view = 'column' }: AgentMonAppProps) {
  const [viewModel, setViewModel] = useState<ViewModel>(() => stateManager.getViewModel());
  const { exit } = useApp();

  // #region START_STATE_SUBSCRIPTION — invariant: subscribe on mount → immediate emit + updates; unsubscribe on unmount → no leaks
  useEffect(() => {
    const unsubscribe = stateManager.subscribe(setViewModel);
    return unsubscribe;
  }, [stateManager]);
  // #endregion END_STATE_SUBSCRIPTION

  // #region START_KEYBOARD_EXIT — purpose: Esc, q, or Ctrl+C exits the TUI; no confirmation needed
  useInput((input, key) => {
    if (key.escape || input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }
  });
  // #endregion END_KEYBOARD_EXIT

  // #region START_LOADING_STATE — invariant: status='loading' before first scan iteration
  if (viewModel.status === 'loading') {
    return <Text>Scanning for active sessions...</Text>;
  }
  // #endregion END_LOADING_STATE

  // #region START_ERROR_STATE — invariant: error message shown in red; last known data rendered below if available
  if (viewModel.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {viewModel.error?.message ?? 'Unknown error'}</Text>
        {viewModel.data && view === 'column' && <ColumnView viewModel={viewModel} />}
      </Box>
    );
  }
  // #endregion END_ERROR_STATE

  // #region START_VIEW_SELECTION — purpose: route to the configured dashboard view; V1 supports 'column' only
  if (view === 'column') {
    return <ColumnView viewModel={viewModel} />;
  }

  return <Text>Unknown view: {view}</Text>;
  // #endregion END_VIEW_SELECTION
}
