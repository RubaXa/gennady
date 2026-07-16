// @file: Unit tests for SelectionPill — debounced post-mouseup appearance under a non-empty
//   selection, attaching the selection as a ContextChip via onAttach on click (D-113, CH-01), and
//   origin capture against the active artifact's raw source (D-115, TSK-132).
// @consumers: node:test runner
// @tasks: TSK-130, TSK-132

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import type { ContextChip } from '../../inbox-chat/types.ts';

// Node 22+ ships a built-in getter-only `navigator` global; test-setup.ts's plain assignment
// throws against it (pre-existing helper, not a P2 Target File — not edited here). Re-defining
// as a writable data property first lets createTestContainer's assignment succeed.
Object.defineProperty(globalThis, 'navigator', {
  value: undefined,
  writable: true,
  configurable: true,
});

const { createTestContainer, render, cleanup } = await import('./test-setup.ts');
const { SelectionPill } = await import('../components/SelectionPill.tsx');

/** @purpose Debounce window the component waits after mouseup before evaluating the selection. */
const SELECTION_DEBOUNCE_MS = 250;

/**
 * @purpose Stub `window.getSelection()` to return a non-empty selection with a fixed bounding rect,
 * so the pill has a real position to render at without depending on jsdom's Range geometry.
 * @param text Selected text the fake selection reports via `toString()`.
 */
function stubNonEmptySelection(text: string): void {
  const fakeSelection = {
    toString: () => text,
    rangeCount: 1,
    getRangeAt: () => ({
      getBoundingClientRect: () => ({
        bottom: 40,
        left: 12,
        top: 20,
        right: 80,
        width: 68,
        height: 20,
      }),
    }),
  };
  (globalThis.window as unknown as { getSelection: () => unknown }).getSelection = () =>
    fakeSelection;
}

describe('SelectionPill', () => {
  it('появляется под выделением после debounced post-mouseup', () => {
    // invariant: pill is NOT rendered synchronously on mouseup — only after the debounce window
    const container = createTestContainer();
    stubNonEmptySelection('flagged review line');
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      act(() => {
        render(createElement(SelectionPill, { onAttach: () => {} }), container);
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
      assert.equal(container.querySelector('button'), null, 'pill absent before debounce fires');

      act(() => {
        mock.timers.tick(SELECTION_DEBOUNCE_MS);
      });

      const button = container.querySelector('button');
      assert.ok(button, 'pill rendered once the debounce window elapses');
      assert.match(button!.textContent ?? '', /Спросить · В контекст/);
    } finally {
      mock.timers.reset();
      act(() => cleanup());
    }
  });

  it('клик прикрепляет чип через onAttach с {kind:"selection", quote, source} (D-113, CH-01)', () => {
    // non-goal: focusing the composer after attach is cross-component wiring owned by
    // ChatPanel/MrDetailPage (attachChip via ChatPanelHandle) — verified at e2e level (TSK-131),
    // not by this unit, which only covers SelectionPill's own onAttach contract.
    const attached: ContextChip[] = [];
    const container = createTestContainer();
    stubNonEmptySelection('flagged review line');
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      act(() => {
        render(
          createElement(SelectionPill, { onAttach: (chip) => attached.push(chip) }),
          container
        );
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
      act(() => {
        mock.timers.tick(SELECTION_DEBOUNCE_MS);
      });

      const button = container.querySelector('button') as HTMLButtonElement;
      assert.ok(button, 'pill rendered before click');
      const expectedSource = window.location.hash || window.location.pathname;

      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      assert.deepStrictEqual(attached, [
        {
          kind: 'selection',
          quote: 'flagged review line',
          source: expectedSource,
          origin: { artifact: expectedSource, startLine: 1, endLine: 1 },
        },
      ]);
      assert.equal(container.querySelector('button'), null, 'pill dismissed after attach');
    } finally {
      mock.timers.reset();
      act(() => cleanup());
    }
  });

  it('клавиатурный триггер Mod+. вычисляет выделение без mouseup (NFC-CH-a11y)', () => {
    const container = createTestContainer();
    stubNonEmptySelection('flagged review line');
    // test-setup.ts polyfills Event/CustomEvent/MouseEvent onto globalThis but not KeyboardEvent;
    // pull the constructor off the jsdom window instance instead of adding a new global here.
    const KeyboardEventCtor = (globalThis.window as unknown as { KeyboardEvent: typeof Event })
      .KeyboardEvent;

    try {
      act(() => {
        render(createElement(SelectionPill, { onAttach: () => {} }), container);
      });

      act(() => {
        document.dispatchEvent(
          new KeyboardEventCtor('keydown', { key: '.', ctrlKey: true, bubbles: true } as never)
        );
      });

      const button = container.querySelector('button');
      assert.ok(button, 'pill rendered immediately via keyboard trigger, no debounce needed');
    } finally {
      act(() => cleanup());
    }
  });

  it('SelectionPill захватывает origin при выделении', () => {
    const attached: ContextChip[] = [];
    const container = createTestContainer();
    const rawText = 'line one\nflagged review line\nline three';
    stubNonEmptySelection('flagged review line');
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      act(() => {
        render(
          createElement(SelectionPill, {
            onAttach: (chip) => attached.push(chip),
            activeArtifact: { name: 'PLAN.md', rawText },
          }),
          container
        );
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
      act(() => {
        mock.timers.tick(SELECTION_DEBOUNCE_MS);
      });

      const button = container.querySelector('button') as HTMLButtonElement;
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      assert.deepStrictEqual(attached[0]!.origin, {
        artifact: 'PLAN.md',
        startLine: 2,
        endLine: 2,
      });
    } finally {
      mock.timers.reset();
      act(() => cleanup());
    }
  });

  it('SelectionPill деградирует без построчных маркеров', () => {
    // contract: quote not locatable inside the active artifact's raw text → conservative {1,1}
    // default rather than a thrown error (selection-to-context must never crash the panel)
    const attached: ContextChip[] = [];
    const container = createTestContainer();
    stubNonEmptySelection('text nowhere in the artifact');
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      act(() => {
        render(
          createElement(SelectionPill, {
            onAttach: (chip) => attached.push(chip),
            activeArtifact: { name: 'PLAN.md', rawText: 'unrelated content only' },
          }),
          container
        );
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
      act(() => {
        mock.timers.tick(SELECTION_DEBOUNCE_MS);
      });

      const button = container.querySelector('button') as HTMLButtonElement;
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      assert.deepStrictEqual(attached[0]!.origin, {
        artifact: 'PLAN.md',
        startLine: 1,
        endLine: 1,
      });
    } finally {
      mock.timers.reset();
      act(() => cleanup());
    }
  });
});
