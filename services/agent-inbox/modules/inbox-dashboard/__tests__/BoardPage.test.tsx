// @file: Unit tests for BoardPage — "Ждут меня" queue aggregation + role Kanban blocks, read-only
//   (no drag-and-drop affordances in the rendered markup).
// @consumers: node:test runner
// @tasks: TSK-107

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { resolve } from 'node:path';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';
import type { BoardData } from '../../inbox-api/types.ts';

const TESTS_DIR = new URL('.', import.meta.url).pathname;
const API_CLIENT_PATH = resolve(TESTS_DIR, '../services/api-client.ts');

const BOARD: BoardData = {
  roles: [
    {
      name: 'reviewer',
      active: true,
      lanes: {
        inbox: [mockActionableMr({ iid: 100, title: 'Inbox MR', role: 'reviewer' })],
        inProgress: [],
        awaitingMe: [
          mockActionableMr({
            iid: 101,
            title: 'Needs my review',
            role: 'reviewer',
            directlyAddressed: true,
          }),
        ],
        done: [],
      },
    },
    {
      name: 'author',
      active: false,
      lanes: { inbox: [], inProgress: [], awaitingMe: [], done: [] },
    },
  ],
  unassigned: [mockActionableMr({ iid: 200, title: 'Unassigned MR', role: null })],
};

const getBoardMock = mock.fn(async () => BOARD);
const assignMrMock = mock.fn(async () => undefined);
const setRoleActiveMock = mock.fn(async () => undefined);
const executeActionMock = mock.fn(async () => undefined);
const getReportMock = mock.fn(async () => {
  throw new Error('not used in BoardPage tests');
});

mock.module(API_CLIENT_PATH, {
  namedExports: {
    getBoard: getBoardMock,
    assignMr: assignMrMock,
    setRoleActive: setRoleActiveMock,
    executeAction: executeActionMock,
    getReport: getReportMock,
  },
});

// Node 22+ ships a built-in getter-only `navigator` global; test-setup.ts's plain assignment
// throws against it (pre-existing helper, not a P3 Target File — not edited here). Re-defining
// as a writable data property first lets createTestContainer's assignment succeed.
Object.defineProperty(globalThis, 'navigator', {
  value: undefined,
  writable: true,
  configurable: true,
});

const { createTestContainer, render, cleanup } = await import('./test-setup.ts');
const { BoardPage } = await import('../components/BoardPage.tsx');
const { BoardStore } = await import('../services/board-store.tsx');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * @purpose Render BoardPage wrapped in its BoardStore provider and let the initial fetch settle.
 */
async function renderSettled() {
  const container = createTestContainer();
  await act(async () => {
    render(createElement(BoardStore, { children: createElement(BoardPage) }), container);
  });
  await act(async () => {
    await flush();
  });
  await act(async () => {
    await flush();
  });
  return container;
}

describe('BoardPage', () => {
  beforeEach(() => {
    getBoardMock.mock.resetCalls();
  });

  it('renders the "Ждут меня" queue with cards aggregated across roles', async () => {
    const container = await renderSettled();
    try {
      assert.equal(getBoardMock.mock.callCount(), 1);
      const html = container.innerHTML;
      assert.ok(html.includes('Ждут меня'), 'awaiting-queue heading present');
      assert.ok(html.includes('Needs my review'), 'awaitingMe card surfaced in the top queue');
      assert.ok(html.includes('(1)'), 'queue count badge reflects 1 awaiting card');
    } finally {
      await act(async () => cleanup());
    }
  });

  it('renders a role Kanban block per role, active and inactive', async () => {
    const container = await renderSettled();
    try {
      const html = container.innerHTML;
      assert.ok(html.includes('reviewer'), 'active role block rendered');
      assert.ok(html.includes('author'), 'inactive role block rendered');
      assert.ok(html.includes('Inbox MR'), 'reviewer inbox lane card rendered');
      // Four Kanban lane titles per role block (RoleBlock renders INBOX/PROGRESS/AWAITING/DONE).
      assert.ok(html.includes('INBOX'));
      assert.ok(html.includes('PROGRESS'));
      assert.ok(html.includes('AWAITING'));
      assert.ok(html.includes('DONE'));
    } finally {
      await act(async () => cleanup());
    }
  });

  it('renders the unassigned block for MRs without a role', async () => {
    const container = await renderSettled();
    try {
      assert.ok(container.innerHTML.includes('Unassigned MR'));
    } finally {
      await act(async () => cleanup());
    }
  });

  it('is read-only — no draggable affordances anywhere in the board markup', async () => {
    const container = await renderSettled();
    try {
      const html = container.innerHTML;
      assert.ok(!html.includes('draggable="true"'), 'no draggable="true" attribute anywhere');
      assert.equal(
        container.querySelectorAll('[draggable]').length,
        0,
        'no element carries a draggable attribute'
      );
    } finally {
      await act(async () => cleanup());
    }
  });
});
