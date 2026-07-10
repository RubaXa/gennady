// @file: Unit tests for AwaitingQueue — renders MR cards in the "Ждут меня" queue.
// @consumers: node:test runner
// @tasks: TSK-107

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AwaitingQueue } from '../components/AwaitingQueue.tsx';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';
import type { MrCard as MrCardType } from '../../inbox-api/types.ts';

describe('AwaitingQueue', () => {
  it('renders empty state when no cards', async () => {
    const html = renderToString(createElement(AwaitingQueue, { cards: [] }));
    assert.ok(html.includes('Ждут меня'));
    assert.ok(html.includes('Нет MR'));
  });

  it('renders multiple awaiting cards', async () => {
    const cards: MrCardType[] = [
      mockActionableMr({ iid: 500, title: 'Fix login bug', directlyAddressed: true }),
      mockActionableMr({ iid: 501, title: 'Add pagination', directlyAddressed: true }),
    ];

    let html = '';
    try {
      html = renderToString(createElement(AwaitingQueue, { cards }));
    } catch (err) {
      assert.fail(`renderToString failed: ${String(err)}`);
    }
    // Strip HTML comments inserted by React server rendering
    const cleanHtml = html.replace(/<!-- -->/g, '');
    assert.ok(cleanHtml.includes('Ждут меня'), 'should contain "Ждут меня"');
    assert.ok(cleanHtml.includes('Fix login bug'), 'should contain "Fix login bug"');
    assert.ok(cleanHtml.includes('Add pagination'), 'should contain "Add pagination"');
    assert.ok(cleanHtml.includes('(2)'), 'should contain "(2)"');
  });

  it('renders MR card with project and IID info', async () => {
    const cards: MrCardType[] = [
      mockActionableMr({ project: 'team/backend', iid: 999, title: 'Refactor service' }),
    ];

    const html = renderToString(createElement(AwaitingQueue, { cards }));
    assert.ok(html.includes('team/backend'));
    assert.ok(html.includes('999'));
    assert.ok(html.includes('Refactor service'));
  });
});
