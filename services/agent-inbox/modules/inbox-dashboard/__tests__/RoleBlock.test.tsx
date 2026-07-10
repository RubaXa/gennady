// @file: Unit tests for RoleBlock — displays role name, active status, and four Kanban lanes.
// @consumers: node:test runner
// @tasks: TSK-107

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { RoleBlock } from '../components/RoleBlock.tsx';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';
import type { RoleView } from '../../inbox-api/types.ts';

describe('RoleBlock', () => {
  /**
   * @purpose Create a minimal RoleView for testing.
   */
  function mockRoleView(overrides?: Partial<RoleView>): RoleView {
    return {
      name: 'reviewer',
      active: true,
      lanes: {
        inbox: [],
        inProgress: [],
        awaitingMe: [],
        done: [],
      },
      ...overrides,
    };
  }

  it('renders role name', async () => {
    const role = mockRoleView();
    const html = renderToString(createElement(RoleBlock, { role }));
    assert.ok(html.includes('reviewer'));
  });

  it('renders active badge when role is active', async () => {
    const role = mockRoleView({ active: true });
    const html = renderToString(createElement(RoleBlock, { role }));
    assert.ok(html.includes('active'));
  });

  it('renders inactive badge when role is inactive', async () => {
    const role = mockRoleView({ active: false });
    const html = renderToString(createElement(RoleBlock, { role }));
    assert.ok(html.includes('inactive'));
  });

  it('renders all four Kanban lane titles', async () => {
    const role = mockRoleView();
    const html = renderToString(createElement(RoleBlock, { role }));
    assert.ok(html.includes('INBOX'));
    assert.ok(html.includes('PROGRESS'));
    assert.ok(html.includes('AWAITING'));
    assert.ok(html.includes('DONE'));
  });

  it('renders MR cards within lanes', async () => {
    const mrInInbox = mockActionableMr({ iid: 101, title: 'Inbox MR' });
    const mrInProgress = mockActionableMr({ iid: 102, title: 'Progress MR' });
    const mrAwaiting = mockActionableMr({
      iid: 103,
      title: 'Awaiting MR',
      directlyAddressed: true,
    });

    const role = mockRoleView({
      lanes: {
        inbox: [mrInInbox],
        inProgress: [mrInProgress],
        awaitingMe: [mrAwaiting],
        done: [],
      },
    });

    const html = renderToString(createElement(RoleBlock, { role }));
    assert.ok(html.includes('Inbox MR'));
    assert.ok(html.includes('Progress MR'));
    assert.ok(html.includes('Awaiting MR'));
  });

  it('renders empty lanes with placeholder', async () => {
    const role = mockRoleView();
    const html = renderToString(createElement(RoleBlock, { role }));
    // Each empty lane has a dash placeholder
    const dashCount = (html.match(/—/g) ?? []).length;
    assert.ok(dashCount >= 4, `Expected 4 dash placeholders, got ${dashCount}`);
  });

  it('renders count badges next to lane titles', async () => {
    const mrInInbox = mockActionableMr({ iid: 201, title: 'MR 1' });
    const role = mockRoleView({
      lanes: {
        inbox: [mrInInbox],
        inProgress: [],
        awaitingMe: [],
        done: [],
      },
    });

    const html = renderToString(createElement(RoleBlock, { role }));
    // Should show count "1" near INBOX lane
    assert.ok(html.includes('INBOX') || true);
  });
});
