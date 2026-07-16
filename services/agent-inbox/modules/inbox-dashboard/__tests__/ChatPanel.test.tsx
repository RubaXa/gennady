// @file: Component/contract tests for the ChatPanel family — ChatApiClient contract
//   (mutate discriminated result + exhaustive SSE frame dispatch), ChatComposer Send↔Stop toggle
//   + disabled-while-streaming + origin-based chip label (D-115), MutationProposalCard
//   provenance-before-Apply + Undo-after-applied, ChatThread aria-live streaming region.
// @consumers: node:test runner
// @tasks: TSK-130, TSK-132

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import type { ChatTurn, MutationProposal } from '../../inbox-chat/types.ts';
import type { MutationProposalStatus } from '../components/MutationProposalCard.tsx';

// Node 22+ ships a built-in getter-only `navigator` global; test-setup.ts's plain assignment
// throws against it (pre-existing helper, not a P2 Target File — not edited here). Re-defining
// as a writable data property first lets createTestContainer's assignment succeed.
Object.defineProperty(globalThis, 'navigator', {
  value: undefined,
  writable: true,
  configurable: true,
});

const { createTestContainer, render, cleanup } = await import('./test-setup.ts');
const { ChatComposer } = await import('../components/ChatComposer.tsx');
const { ChatThread } = await import('../components/ChatThread.tsx');
const { MutationProposalCard } = await import('../components/MutationProposalCard.tsx');
const { ChatApiClient } = await import('../services/chat-api-client.ts');

/** @purpose Build a minimal MutationProposal, `edit` op by default. */
function mockMutationProposal(overrides?: Partial<MutationProposal>): MutationProposal {
  return {
    op: 'edit',
    target: 'candidate-1',
    before: 'old text',
    after: 'new text',
    ...overrides,
  };
}

/** @purpose Build a minimal ChatTurn. */
function mockChatTurn(overrides?: Partial<ChatTurn>): ChatTurn {
  return {
    id: 'turn-1',
    ts: '2026-07-15T00:00:00Z',
    question: 'Why was this flagged?',
    chips: [],
    answer: 'Because it violates the naming rule.',
    reviewRevision: 1,
    ...overrides,
  };
}

describe('ChatApiClient', () => {
  it('Типизация контракта ChatApiClient', async () => {
    // contract: mutate() returns a discriminated union, never throws on CAS conflict (D-99);
    // subscribe() dispatches every SseFrame variant to its matching handler (exhaustive switch)
    // failure mode: do not assert only the happy path — STALE_REVISION and each frame type must
    // each reach the caller through the typed surface, not just compile

    // #region START_CONTRACT_SETUP_FAKES
    class FakeMessageEvent {
      data: string;
      constructor(data: string) {
        this.data = data;
      }
    }
    (globalThis as Record<string, unknown>).MessageEvent = FakeMessageEvent;

    class FakeEventSource {
      listeners: Record<string, Array<(ev: unknown) => void>> = {};
      closed = false;
      addEventListener(type: string, cb: (ev: unknown) => void): void {
        (this.listeners[type] ??= []).push(cb);
      }
      close(): void {
        this.closed = true;
      }
      emit(type: string, ev: unknown): void {
        for (const cb of this.listeners[type] ?? []) cb(ev);
      }
    }
    let lastSource: FakeEventSource | null = null;
    (globalThis as Record<string, unknown>).EventSource = class extends FakeEventSource {
      constructor(_url: string) {
        super();
        lastSource = this;
      }
    };

    const okBody = { ok: true, snapshot: 'snap-1', revision: 2 };
    const originalFetch = globalThis.fetch;
    let call = 0;
    (globalThis as Record<string, unknown>).fetch = async (_url: string, _init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify(okBody), { status: 200 });
      }
      return new Response(null, { status: 409 });
    };
    // #endregion END_CONTRACT_SETUP_FAKES

    try {
      const client = new ChatApiClient();
      const proposal = mockMutationProposal();

      const okResult = await client.mutate('g/p!1', proposal, 1);
      const staleResult = await client.mutate('g/p!1', proposal, 1);

      const received: {
        tokens: string[];
        turns: ChatTurn[];
        mutations: MutationProposal[];
        refreshed: number;
        errors: Array<{ code: string; detail: string }>;
      } = { tokens: [], turns: [], mutations: [], refreshed: 0, errors: [] };

      client.subscribe('g/p!1', {
        onToken: (token) => received.tokens.push(token),
        onTurnDone: (turn) => received.turns.push(turn),
        onMutation: (mutation) => received.mutations.push(mutation),
        onRefresh: () => (received.refreshed += 1),
        onError: (error, detail) => received.errors.push({ code: error, detail }),
      });

      const turn = mockChatTurn();
      // #region START_CONTRACT_TRIGGER_EMIT_FRAMES
      lastSource!.emit('token', { data: JSON.stringify({ type: 'token', token: 'hel' }) });
      lastSource!.emit('turn_done', { data: JSON.stringify({ type: 'turn_done', turn }) });
      lastSource!.emit('mutation', {
        data: JSON.stringify({ type: 'mutation', mutation: proposal }),
      });
      lastSource!.emit('refresh', { data: JSON.stringify({ type: 'refresh' }) });
      lastSource!.emit(
        'error',
        new FakeMessageEvent(
          JSON.stringify({ type: 'error', error: 'SESSION_ERROR', detail: 'boom' })
        )
      );
      // #endregion END_CONTRACT_TRIGGER_EMIT_FRAMES

      // #region START_CONTRACT_ASSERT_COMPOSITE
      assert.deepStrictEqual(
        { mutate: { ok: okResult, stale: staleResult }, sse: received },
        {
          mutate: {
            ok: { ok: true, snapshot: 'snap-1', revision: 2 },
            stale: { ok: false, error: 'STALE_REVISION' },
          },
          sse: {
            tokens: ['hel'],
            turns: [turn],
            mutations: [proposal],
            refreshed: 1,
            errors: [{ code: 'SESSION_ERROR', detail: 'boom' }],
          },
        }
      );
      // #endregion END_CONTRACT_ASSERT_COMPOSITE
    } finally {
      (globalThis as Record<string, unknown>).fetch = originalFetch;
    }
  });
});

describe('ChatComposer', () => {
  it('блокируется на время хода: input disabled, Send заменён на Stop (CH-11, D-104)', () => {
    const container = createTestContainer();
    act(() => {
      render(
        createElement(ChatComposer, {
          chips: [],
          onRemoveChip: () => {},
          streaming: true,
          onSend: () => {},
          onStop: () => {},
        }),
        container
      );
    });
    try {
      const textarea = container.querySelector('textarea');
      assert.ok(textarea, 'composer textarea rendered');
      assert.equal(textarea!.disabled, true, 'input disabled while streaming (D-104)');

      const button = container.querySelector('button');
      assert.ok(button, 'toggle button rendered');
      assert.match(button!.textContent ?? '', /Stop/, 'shows Stop while streaming (CH-11)');
    } finally {
      act(() => cleanup());
    }
  });

  it('shows Send when idle and removes a chip via its ✕ button (CH-12)', () => {
    const onRemoveChip = (index: number) => removed.push(index);
    const removed: number[] = [];
    const container = createTestContainer();
    act(() => {
      render(
        createElement(ChatComposer, {
          chips: [
            {
              kind: 'selection',
              quote: 'flagged line',
              source: '#/mr/1',
              origin: { artifact: '#/mr/1', startLine: 1, endLine: 1 },
            },
          ],
          onRemoveChip,
          streaming: false,
          onSend: () => {},
          onStop: () => {},
        }),
        container
      );
    });
    try {
      const sendButton = Array.from(container.querySelectorAll('button')).find((b) =>
        /Send|Stop/.test(b.textContent ?? '')
      );
      assert.match(sendButton?.textContent ?? '', /Send/);

      const removeChipButton = container.querySelector(
        'button[aria-label="Убрать контекст"]'
      ) as HTMLButtonElement;
      assert.ok(removeChipButton, 'chip remove button rendered');

      act(() => {
        removeChipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      assert.deepStrictEqual(removed, [0]);
    } finally {
      act(() => cleanup());
    }
  });

  it('ChatComposer отображает artifact#L<start>-L<end>', () => {
    const container = createTestContainer();
    act(() => {
      render(
        createElement(ChatComposer, {
          chips: [
            {
              kind: 'selection',
              quote: 'a fragment nobody reads directly anymore',
              source: '#/mr/1',
              origin: { artifact: 'REPORT.md', startLine: 12, endLine: 15 },
            },
          ],
          onRemoveChip: () => {},
          streaming: false,
          onSend: () => {},
          onStop: () => {},
        }),
        container
      );
    });
    try {
      const chipLabel = container.querySelector('ul[aria-label="Контекст вопроса"] li span');
      assert.ok(chipLabel, 'chip label span rendered');
      assert.strictEqual(
        chipLabel!.textContent,
        'REPORT.md#L12-L15',
        'visible chip identifier is artifact#L<start>-L<end> (Cursor/Copilot format), not the quote'
      );
    } finally {
      act(() => cleanup());
    }
  });
});

describe('MutationProposalCard', () => {
  it('несёт provenance-тег ДО кнопки Применить, когда groundedInMrText=true (CH-09, D-98)', () => {
    const proposal = mockMutationProposal({
      provenance: { groundedInMrText: true, quote: 'exact MR wording' },
    });
    const container = createTestContainer();
    act(() => {
      render(
        createElement(MutationProposalCard, {
          proposal,
          status: 'pending',
          onApply: () => {},
          onReject: () => {},
          onUndo: () => {},
        }),
        container
      );
    });
    try {
      const html = container.innerHTML;
      const provenanceIndex = html.indexOf('grounded in MR text');
      const applyIndex = html.indexOf('Применить');
      assert.ok(provenanceIndex >= 0, 'provenance tag rendered');
      assert.ok(applyIndex >= 0, 'Apply button rendered');
      assert.ok(provenanceIndex < applyIndex, 'provenance tag precedes the Apply button (CH-09)');
    } finally {
      act(() => cleanup());
    }
  });

  it('показывает [↺ Undo] в статусе applied (CH-10)', () => {
    const container = createTestContainer();
    act(() => {
      render(
        createElement(MutationProposalCard, {
          proposal: mockMutationProposal(),
          status: 'applied',
          onApply: () => {},
          onReject: () => {},
          onUndo: () => {},
        }),
        container
      );
    });
    try {
      const undoButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Undo')
      );
      assert.ok(undoButton, 'Undo button present once applied');
      assert.ok(
        !container.innerHTML.includes('Применить'),
        'Apply button no longer rendered once applied'
      );
    } finally {
      act(() => cleanup());
    }
  });
});

describe('ChatThread', () => {
  it('рендерит активный стрим в aria-live="polite" (NFC-CH-a11y)', () => {
    const container = createTestContainer();
    act(() => {
      render(
        createElement(ChatThread, {
          turns: [],
          streamingText: 'partial answer so far',
          streaming: true,
          resolveMutationStatus: (): MutationProposalStatus => 'pending',
          onApplyMutation: () => {},
          onRejectMutation: () => {},
          onUndoMutation: () => {},
        }),
        container
      );
    });
    try {
      const liveRegion = container.querySelector('[aria-live="polite"]');
      assert.ok(liveRegion, 'aria-live region rendered while streaming');
      assert.equal(liveRegion!.textContent, 'partial answer so far');
    } finally {
      act(() => cleanup());
    }
  });
});
