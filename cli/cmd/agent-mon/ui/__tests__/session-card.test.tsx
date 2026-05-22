// @file: Unit tests for SessionCard — status badge rendering
// @consumers: test
// @tasks: TSK-46

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { render as inkRender } from 'ink';
import type { ReactElement } from 'react';
import { SessionCard } from '../session-card.tsx';
import type { SessionCard as SessionCardData } from '../../state/view-model.type.ts';

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

describe('SessionCard', () => {
  it('renders correct status badge', async () => {
    // contract: StatusBadge selects emoji + label based on status
    // failure mode: do NOT assert on ANSI color codes — they vary between interactive/non-interactive modes
    // invariant: ⏳ emoji and 'waiting' label always appear for waiting status

    const card: SessionCardData = {
      sessionId: 'sess-wait',
      title: 'Waiting Session',
      status: 'waiting',
      elapsed: '3m',
      isWaitingForOperator: true,
    };

    const output = await renderToString(<SessionCard card={card} />);

    assert.match(output, /⏳/);
    assert.match(output, /waiting/);
    assert.match(output, /Waiting Session/);
  });
});
