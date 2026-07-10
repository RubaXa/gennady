// @file: Unit tests for MrCard — displays project info, time, status badges, and "Смотреть" button.
// @consumers: node:test runner
// @tasks: TSK-107

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MrCard } from '../components/MrCard.tsx';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';

describe('MrCard', () => {
  it('renders MR project and IID', async () => {
    const mr = mockActionableMr({ project: 'mygroup/myproject', iid: 42, title: 'Test MR' });
    const html = renderToString(createElement(MrCard, { mr }));
    assert.ok(html.includes('mygroup/myproject'));
    assert.ok(html.includes('42'));
  });

  it('renders MR title', async () => {
    const mr = mockActionableMr({ title: 'feat: add dark mode support' });
    const html = renderToString(createElement(MrCard, { mr }));
    assert.ok(html.includes('feat: add dark mode support'));
  });

  it('shows Draft badge for draft MRs', async () => {
    const mr = mockActionableMr({ draft: true, title: 'WIP feature' });
    const html = renderToString(createElement(MrCard, { mr }));
    assert.ok(html.includes('Draft'));
  });

  it('shows @me badge when directly addressed', async () => {
    const mr = mockActionableMr({ directlyAddressed: true, title: 'Important MR' });
    const html = renderToString(createElement(MrCard, { mr }));
    assert.ok(html.includes('@me'));
  });

  it('renders "Смотреть" button', async () => {
    const mr = mockActionableMr({ title: 'Review me' });
    const html = renderToString(createElement(MrCard, { mr }));
    assert.ok(html.includes('Смотреть') || html.includes('View MR'));
  });

  it('does not show Draft badge for non-draft MRs', async () => {
    const mr = mockActionableMr({ draft: false, title: 'Ready MR' });
    const html = renderToString(createElement(MrCard, { mr }));
    // Should not contain Draft badge text
    assert.ok(!html.includes('Draft'));
  });

  it('does not show @me badge when not directly addressed', async () => {
    const mr = mockActionableMr({ directlyAddressed: false, title: 'Normal MR' });
    const html = renderToString(createElement(MrCard, { mr }));
    assert.ok(!html.includes('@me'));
  });
});
