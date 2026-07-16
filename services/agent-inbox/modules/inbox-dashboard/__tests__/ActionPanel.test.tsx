// @file: Unit tests for ActionPanel — reviewer buttons [Постить/Approve(гейт)/Дослать/Skip],
//   author buttons incl. [Копировать задание] with no Approve, candidates checkboxes
//   + inline-edit, posting a subset builds the expected payload.
// @consumers: node:test runner
// @tasks: TSK-107

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { resolve } from 'node:path';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';
import type { MrDetail } from '../../inbox-api/types.ts';

const TESTS_DIR = new URL('.', import.meta.url).pathname;
const API_CLIENT_PATH = resolve(TESTS_DIR, '../services/api-client.ts');

const executeActionMock = mock.fn(
  async (_mrId: string, _questionId: string, _choice: string, _payload?: unknown) => undefined
);

mock.module(API_CLIENT_PATH, {
  namedExports: { executeAction: executeActionMock },
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
const { ActionPanel } = await import('../components/ActionPanel.tsx');

/** @purpose Build a minimal MrDetail report, reviewer role by default with 3 findings. */
function mockReport(overrides?: Partial<MrDetail> & { role?: 'reviewer' | 'author' }): MrDetail {
  const { role = 'reviewer', ...rest } = overrides ?? {};
  return {
    mr: mockActionableMr({ role }),
    findings: [
      { severity: 'warning', file: 'src/a.ts', line: 10, message: 'finding one' },
      { severity: 'warning', file: 'src/b.ts', line: 20, message: 'finding two' },
      { severity: 'warning', file: 'src/c.ts', line: 30, message: 'finding three' },
    ],
    verdict: 'request_changes',
    audit: [],
    revision: 0,
    ...rest,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ActionPanel', () => {
  beforeEach(() => {
    executeActionMock.mock.resetCalls();
  });

  describe('reviewer role', () => {
    it('renders reviewer action buttons: Постить/Approve/Дослать/Skip', () => {
      const container = createTestContainer();
      act(() => {
        render(createElement(ActionPanel, { mrId: 'g/p!510', report: mockReport() }), container);
      });
      try {
        const html = container.innerHTML;
        assert.ok(html.includes('Постить выбранное'));
        assert.ok(html.includes('Approve'));
        assert.ok(html.includes('Дослать'));
        assert.ok(html.includes('Skip'));
        assert.ok(!html.includes('Копировать задание'), 'reviewer has no author-only button');
      } finally {
        act(() => cleanup());
      }
    });

    it('renders one checkbox per candidate finding', () => {
      const container = createTestContainer();
      act(() => {
        render(createElement(ActionPanel, { mrId: 'g/p!510', report: mockReport() }), container);
      });
      try {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        assert.equal(checkboxes.length, 3);
      } finally {
        act(() => cleanup());
      }
    });

    it('inline-edits a candidate message', () => {
      const container = createTestContainer();
      act(() => {
        render(createElement(ActionPanel, { mrId: 'g/p!510', report: mockReport() }), container);
      });
      try {
        const editButton = Array.from(container.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('finding one')
        );
        assert.ok(editButton, 'inline-edit trigger for the first candidate found');

        act(() => {
          editButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const textarea = container.querySelector('textarea');
        assert.ok(textarea, 'textarea appears after clicking the candidate text');
        assert.equal(textarea!.value, 'finding one');
      } finally {
        act(() => cleanup());
      }
    });

    it('posts only the checked subset with edits applied → payload.kind=candidates', async () => {
      const container = createTestContainer();
      act(() => {
        render(createElement(ActionPanel, { mrId: 'g/p!510', report: mockReport() }), container);
      });
      try {
        const checkboxes = Array.from(
          container.querySelectorAll('input[type="checkbox"]')
        ) as HTMLInputElement[];
        assert.equal(checkboxes.length, 3);

        // Check candidates 0 and 2 (2 of 3), leave candidate 1 unchecked.
        act(() => {
          checkboxes[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        act(() => {
          checkboxes[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const postButton = Array.from(container.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('Постить выбранное')
        );
        assert.ok(postButton, 'post button found');
        assert.equal(postButton!.disabled, false, 'post button enabled once ≥1 checked');

        await act(async () => {
          postButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await flush();
        });

        assert.equal(executeActionMock.mock.callCount(), 1);
        const call = executeActionMock.mock.calls[0]!;
        assert.equal(call.arguments[0], 'g/p!510');
        assert.equal(call.arguments[1], 'review-decision');
        assert.equal(call.arguments[2], 'post');
        const payload = call.arguments[3] as { kind: string; candidates: Array<{ file: string }> };
        assert.equal(payload.kind, 'candidates');
        assert.equal(payload.candidates.length, 2);
        assert.deepEqual(
          payload.candidates.map((c) => c.file),
          ['src/a.ts', 'src/c.ts']
        );
      } finally {
        await act(async () => cleanup());
      }
    });

    it('disables Post with no candidates checked, disables Approve on a blocking finding', () => {
      const report = mockReport();
      report.findings[0]!.severity = 'error';
      const container = createTestContainer();
      act(() => {
        render(createElement(ActionPanel, { mrId: 'g/p!510', report }), container);
      });
      try {
        const postButton = Array.from(container.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('Постить выбранное')
        ) as HTMLButtonElement;
        const approveButton = Array.from(container.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('Approve')
        ) as HTMLButtonElement;

        assert.equal(postButton.disabled, true, 'post disabled — nothing checked yet');
        assert.equal(approveButton.disabled, true, 'approve gated off by severity=error finding');
      } finally {
        act(() => cleanup());
      }
    });
  });

  describe('author role', () => {
    it('renders author action buttons incl. "Копировать задание", no Approve', () => {
      const container = createTestContainer();
      act(() => {
        render(
          createElement(ActionPanel, { mrId: 'g/p!510', report: mockReport({ role: 'author' }) }),
          container
        );
      });
      try {
        const html = container.innerHTML;
        assert.ok(html.includes('Опубликовать черновики'));
        assert.ok(html.includes('Копировать задание'));
        assert.ok(html.includes('Обновить описание'));
        assert.ok(html.includes('Дослать'));
        assert.ok(html.includes('Skip'));
        assert.ok(!html.includes('Approve'), 'author panel has no Approve button');
      } finally {
        act(() => cleanup());
      }
    });

    it('publishing drafts dispatches choice=post payload.kind=publish-drafts', async () => {
      const container = createTestContainer();
      act(() => {
        render(
          createElement(ActionPanel, { mrId: 'g/p!510', report: mockReport({ role: 'author' }) }),
          container
        );
      });
      try {
        const publishButton = Array.from(container.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('Опубликовать черновики')
        );
        assert.ok(publishButton);

        await act(async () => {
          publishButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await flush();
        });

        assert.equal(executeActionMock.mock.callCount(), 1);
        const call = executeActionMock.mock.calls[0]!;
        assert.equal(call.arguments[2], 'post');
        assert.deepEqual(call.arguments[3], { kind: 'publish-drafts' });
      } finally {
        await act(async () => cleanup());
      }
    });
  });
});
