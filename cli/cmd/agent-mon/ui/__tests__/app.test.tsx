// @file: Unit tests for AgentMonApp — loading, error states, view selection
// @consumers: test
// @tasks: TSK-46

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { render as inkRender } from 'ink';
import type { ReactElement } from 'react';
import { AgentMonApp } from '../app.tsx';
import type { StateManager } from '../../state/create-state-manager.ts';
import type { ViewModel } from '../../state/view-model.type.ts';

/**
 * @purpose Render an ink element to a plain-text string using non-interactive mode.
 */
function renderToString(el: ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const stdout = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }) as unknown as NodeJS.WriteStream;

    // ink's useInput hook requires stdin.setRawMode(), .ref(), .unref(), .setEncoding()
    // provide a PassThrough mock with the required ReadStream surface
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    (stdin as any).setRawMode = () => {};
    (stdin as any).ref = () => {};
    (stdin as any).unref = () => {};
    (stdin as any).setEncoding = () => {};
    (stdin as any).isTTY = true;

    try {
      const { unmount, waitUntilExit } = inkRender(el, {
        stdout,
        stdin,
        interactive: false,
        patchConsole: false,
        exitOnCtrlC: false,
      });
      unmount();
      waitUntilExit().then(() => resolve(output), reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * @purpose Create a minimal mock StateManager for testing AgentMonApp rendering.
 */
function createMockStateManager(viewModel: ViewModel): StateManager {
  return {
    getViewModel: () => viewModel,
    subscribe: (fn: (vm: ViewModel) => void) => {
      fn(viewModel);
      return () => {};
    },
  };
}

describe('AgentMonApp', () => {
  it('shows loading state', async () => {
    // contract: status='loading' before first scan → render "Scanning for active sessions..."
    // failure mode: do not assert ANSI escape codes — non-interactive output is plain text

    const stateManager = createMockStateManager({
      status: 'loading',
      lastUpdated: Date.now(),
    });

    const output = await renderToString(<AgentMonApp stateManager={stateManager} />);

    assert.match(output, /Scanning for active sessions/);
  });

  it('shows error with last data', async () => {
    // contract: status='error' → red error message + last known data rendered below
    // invariant: data preserved from last successful scan even on error

    const stateManager = createMockStateManager({
      status: 'error',
      error: new Error('observer crash'),
      data: {
        columns: [
          {
            provider: 'claude',
            activeCount: 1,
            waitingCount: 0,
            idleCount: 0,
            sessions: [
              {
                sessionId: 's1',
                title: 'Test Session',
                status: 'active',
                elapsed: '5m',
                isWaitingForOperator: false,
              },
            ],
          },
        ],
        summary: { total: 1, byProvider: { claude: 1 } },
      },
      lastUpdated: Date.now(),
    });

    const output = await renderToString(<AgentMonApp stateManager={stateManager} />);

    assert.match(output, /observer crash/);
    assert.match(output, /Test Session/);
  });
});
