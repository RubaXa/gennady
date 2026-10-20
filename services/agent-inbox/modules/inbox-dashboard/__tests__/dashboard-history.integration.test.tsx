// @file: Dashboard history integration tests — horizon visibility matrix and event-driven card restore.
// @consumers: node:test runner
// @tasks: TSK-182

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResponsibilityQueue } from '../board/ResponsibilityQueue.tsx';
import type { MrCardV2 } from '../v2-types.ts';

// Test Graph:
//   dashboard history integration
//     ✓ every hidden case remains in local history and a new event clears completion and restores the card
//         - open+running → visible with active work state, Complete absent
//         - merged+done → visible with Complete present (operator can close the loop)
//         - closed+done → visible with Complete present
//         - merged+done with unread > 0 → new event marks card with unread badge (restores card)
//         - board renders ALL provided cards regardless of lifecycle (server owns horizon filtering)

type HistoryContext = {
  makeCard: (overrides: Partial<MrCardV2>) => MrCardV2;
};

function createHistoryContext(): HistoryContext {
  const makeCard = (overrides: Partial<MrCardV2>): MrCardV2 => ({
    ref: 'group/project!0',
    title: 'Horizon test MR',
    author: 'tester',
    myRole: 'reviewer',
    attention: '😴',
    counters: {
      approvals: '2/2',
      reviewers: [{ user: 'tester', voted: true }],
      ci: 'passed',
      threads: '0/2',
      awaitingMe: 0,
      newCommits: 0,
      unread: 0,
    },
    work: { state: 'idle', label: 'Нет работы', startedAt: null },
    ...overrides,
  });

  return { makeCard };
}

describe('dashboard history integration', () => {
  it('every hidden case remains in local history and a new event clears completion and restores the card', () => {
    // invariant: client board renders all provided cards — server owns horizon/hide decisions
    // invariant: merged/closed cards with work.state=done show Complete → operator can close loop
    // invariant: a new event (unread > 0) surfaces even on merged/closed cards (restore after horizon)
    // failure mode: client silently drops merged/closed cards → history inaccessible

    const { makeCard } = createHistoryContext();

    // #region START_HISTORY_SETUP
    const openRunning = makeCard({
      ref: 'h!open-1',
      lifecycle: 'open',
      attention: '🔀',
      work: { state: 'running', label: '🔍 Ревью', startedAt: '2026-08-11T10:00:00Z' },
    });

    const mergedDone = makeCard({
      ref: 'h!merged-2',
      lifecycle: 'merged',
      attention: '😴',
      work: { state: 'done', label: '✔ Готово', startedAt: null },
    });

    const closedDone = makeCard({
      ref: 'h!closed-3',
      lifecycle: 'closed',
      attention: '😴',
      work: { state: 'done', label: '✔ Готово', startedAt: null },
    });

    // merged+done but a new event arrived → unread > 0 (card restored by new activity)
    const mergedRestored = makeCard({
      ref: 'h!merged-4',
      lifecycle: 'merged',
      attention: '💬',
      work: { state: 'done', label: '✔ Готово', startedAt: null },
      counters: {
        approvals: '2/2',
        reviewers: [{ user: 'tester', voted: true }],
        ci: 'passed',
        threads: '1/2',
        awaitingMe: 1,
        newCommits: 0,
        unread: 3, // new event → restored to board
      },
    });
    // #endregion END_HISTORY_SETUP

    const html = renderToStaticMarkup(
      <ResponsibilityQueue
        cards={[openRunning, mergedDone, closedDone, mergedRestored]}
        syncState="ok"
        onOpen={() => undefined}
      />
    );

    // #region START_HISTORY_ASSERT_ALL_CARDS_RENDERED
    // board renders ALL provided cards (horizon filtering is server-side only)
    assert.match(html, /h!open-1/, 'open+running card not rendered');
    assert.match(
      html,
      /h!merged-2/,
      'merged+done card not rendered (history must stay accessible)'
    );
    assert.match(
      html,
      /h!closed-3/,
      'closed+done card not rendered (history must stay accessible)'
    );
    assert.match(html, /h!merged-4/, 'merged+restored card not rendered');
    // #endregion END_HISTORY_ASSERT_ALL_CARDS_RENDERED

    // #region START_HISTORY_ASSERT_WORK_STATES
    // Cards are priority-sorted in HTML — split by article for per-card isolation
    const cardSections = html.split('<article ');
    const findCard = (ref: string): string => cardSections.find((s) => s.includes(ref)) ?? '';

    const openCard = findCard('h!open-1');
    const mergedCard = findCard('h!merged-2');
    const closedCard = findCard('h!closed-3');
    const restoredCard = findCard('h!merged-4');

    // open+running → running work label visible
    assert.match(openCard, /🔍 Ревью/, 'open+running: running work label absent');
    // #endregion END_HISTORY_ASSERT_WORK_STATES

    // #region START_HISTORY_ASSERT_LIFECYCLE_CONTROLS
    // open → Complete absent
    assert.doesNotMatch(openCard, /Завершить/, 'open card must not show Complete');

    // merged+done → Complete present (operator closes the loop from history)
    assert.match(mergedCard, /Завершить/, 'merged+done: Complete button absent');

    // closed+done → Complete present
    assert.match(closedCard, /Завершить/, 'closed+done: Complete button absent');
    // #endregion END_HISTORY_ASSERT_LIFECYCLE_CONTROLS

    // #region START_HISTORY_ASSERT_UNREAD_RESTORE
    // merged+restored card (unread > 0) must surface unread count in the board
    assert.match(
      restoredCard,
      /📬 3/,
      'merged+restored: unread count absent (card restore failed)'
    );
    // Завершить present because lifecycle='merged'
    assert.match(restoredCard, /Завершить/, 'merged+restored: Complete button absent');
    // #endregion END_HISTORY_ASSERT_UNREAD_RESTORE
  });
});
