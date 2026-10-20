// @file: BoardPage tests — two responsibility queues and reading-first board contract.
// @consumers: node:test runner
// @tasks: TSK-182

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResponsibilityQueue } from '../board/ResponsibilityQueue.tsx';
import type { MrCardV2 } from '../v2-types.ts';

function makeCard(overrides: Partial<MrCardV2>): MrCardV2 {
  return {
    ref: `group/project!${Math.random().toString(36).slice(2, 6)}`,
    title: 'Test MR',
    author: 'tester',
    myRole: null,
    attention: '😴',
    counters: {
      approvals: '0/1',
      reviewers: [],
      ci: null,
      threads: '0/0',
      awaitingMe: 0,
      newCommits: 0,
      unread: 0,
    },
    work: { state: 'idle', label: 'Ревью не запускалось', startedAt: null },
    ...overrides,
  };
}

describe('responsibility board', () => {
  it('places every MR once by responsibility and keeps attention inside the card', () => {
    const cards: MrCardV2[] = [
      makeCard({ ref: 'proj!10', myRole: 'reviewer', attention: '⏳' }),
      makeCard({ ref: 'proj!11', myRole: 'reviewer', attention: '😴' }),
      makeCard({ ref: 'proj!12', myRole: 'author', attention: '💬' }),
      makeCard({ ref: 'proj!13', myRole: null, attention: '✅' }),
    ];

    const html = renderToStaticMarkup(
      <ResponsibilityQueue cards={cards} syncState="ok" onOpen={() => undefined} />
    );

    assert.match(html, /aria-label="Ревью"/);
    assert.match(html, /aria-label="Мои \/ назначенные"/);

    for (const ref of ['proj!10', 'proj!11', 'proj!12', 'proj!13']) {
      assert.strictEqual((html.match(new RegExp(`aria-label="MR ${ref}:`, 'g')) ?? []).length, 1);
    }
    const review = html.slice(html.indexOf('aria-label="Ревью"'), html.indexOf('aria-label="Мои'));
    const mine = html.slice(html.indexOf('aria-label="Мои'));
    assert.match(review, /proj!10/);
    assert.match(review, /proj!11/);
    assert.doesNotMatch(review, /proj!12|proj!13/);
    assert.match(mine, /proj!12/);
    assert.match(mine, /proj!13/);
  });

  it('keeps lifecycle controls bounded by the MR lifecycle', () => {
    const html = renderToStaticMarkup(
      <ResponsibilityQueue
        cards={[makeCard({ ref: 'h!1', attention: '⏳', lifecycle: 'merged' })]}
        syncState="ok"
        onOpen={() => undefined}
      />
    );

    assert.match(html, /aria-label="Открыть h!1"/);
    assert.match(html, /Обновить описание/);
    assert.match(html, /Завершить/);
  });
});
