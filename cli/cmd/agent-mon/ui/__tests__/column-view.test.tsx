// @file: Unit tests for ColumnView — grouping, empty state
// @consumers: test
// @tasks: TSK-46

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { render as inkRender } from 'ink';
import type { ReactElement } from 'react';
import { ColumnView } from '../column-view.tsx';
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

    try {
      const { unmount, waitUntilExit } = inkRender(el, {
        stdout,
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

describe('ColumnView', () => {
  it('groups cards by status order', async () => {
    // contract: sessions within a column are pre-sorted by status priority (active → waiting → idle → completed)
    // failure mode: card order in output must match the data order — no re-sort in ColumnView

    const viewModel: ViewModel = {
      status: 'ready',
      data: {
        columns: [
          {
            provider: 'claude',
            activeCount: 2,
            waitingCount: 1,
            idleCount: 1,
            sessions: [
              {
                sessionId: 'a1',
                title: 'Active One',
                status: 'active',
                elapsed: '10m',
                isWaitingForOperator: false,
              },
              {
                sessionId: 'a2',
                title: 'Active Two',
                status: 'active',
                elapsed: '5m',
                isWaitingForOperator: false,
              },
              {
                sessionId: 'w1',
                title: 'Waiting One',
                status: 'waiting',
                elapsed: '2m',
                isWaitingForOperator: true,
              },
              {
                sessionId: 'i1',
                title: 'Idle One',
                status: 'idle',
                elapsed: '1h',
                isWaitingForOperator: false,
              },
            ],
          },
        ],
        summary: { total: 4, byProvider: { claude: 4 } },
      },
      lastUpdated: Date.now(),
    };

    const output = await renderToString(<ColumnView viewModel={viewModel} />);

    // Verify status-ordered appearance: active badges before waiting before idle
    const activeIdx = output.indexOf('Active One');
    const waitingIdx = output.indexOf('Waiting One');
    const idleIdx = output.indexOf('Idle One');

    assert.ok(activeIdx >= 0, 'Active One should be present');
    assert.ok(waitingIdx >= 0, 'Waiting One should be present');
    assert.ok(idleIdx >= 0, 'Idle One should be present');
    assert.ok(activeIdx < waitingIdx, 'active cards should appear before waiting cards');
    assert.ok(waitingIdx < idleIdx, 'waiting cards should appear before idle cards');
  });
});
