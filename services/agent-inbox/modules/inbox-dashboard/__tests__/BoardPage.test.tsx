// @file: BoardPage tests — responsibility queue placement, priority order, and lifecycle controls.
// @consumers: node:test runner
// @tasks: TSK-182

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResponsibilityQueue } from '../board/ResponsibilityQueue.tsx';
import type { MrCardV2 } from '../v2-types.ts';

// Test Graph:
//   responsibility board
//     ✓ responsibility queues place each MR once in product priority order
//         - reviewer role → Review queue; author/mentioned/null → Mine queue
//         - sort: ⏳/💬 (decision-required) before 🔀 (agent-working) before ✅ (external-wait) before 😴 (no-action)
//         - each MR appears exactly once across both queues
//     ✓ open merged and closed state completion and horizon matrix controls active cards
//         - open lifecycle → Complete button absent; Update description present
//         - merged lifecycle → both controls present
//         - closed lifecycle → both controls present
//         - all lifecycle states render in the board without horizon filtering on client

type BoardContext = {
  makeCard: (overrides: Partial<MrCardV2>) => MrCardV2;
};

function createBoardContext(): BoardContext {
  const makeCard = (overrides: Partial<MrCardV2>): MrCardV2 => ({
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
    work: { state: 'idle', label: 'Нет работы', startedAt: null },
    ...overrides,
  });

  return { makeCard };
}

describe('responsibility board', () => {
  it('responsibility queues place each MR once in product priority order', () => {
    // invariant: reviewer role → Review queue; all other roles → Mine queue
    // invariant: within each queue sort order is decision-required → agent-working → external-wait → no-action
    // failure mode: card appearing in both queues or in wrong order

    const { makeCard } = createBoardContext();

    // #region START_QUEUE_PLACEMENT_SETUP
    const cards: MrCardV2[] = [
      // Mine queue — non-reviewer roles sorted by priority
      makeCard({ ref: 'proj!10', myRole: 'author', attention: '✅' }), // external-wait
      makeCard({ ref: 'proj!11', myRole: 'mentioned', attention: '💬' }), // decision-required
      makeCard({ ref: 'proj!12', myRole: null, attention: '😴' }), // no-action
      // Review queue — reviewer role sorted by priority
      makeCard({ ref: 'proj!20', myRole: 'reviewer', attention: '😴' }), // no-action
      makeCard({ ref: 'proj!21', myRole: 'reviewer', attention: '🔀' }), // agent-working
      makeCard({ ref: 'proj!22', myRole: 'reviewer', attention: '⏳' }), // decision-required
    ];
    // #endregion END_QUEUE_PLACEMENT_SETUP

    const html = renderToStaticMarkup(
      <ResponsibilityQueue cards={cards} syncState="ok" onOpen={() => undefined} />
    );

    // #region START_QUEUE_PLACEMENT_ASSERT_SECTIONS
    assert.match(html, /aria-label="Ревью"/, 'Review queue section absent');
    assert.match(html, /aria-label="Мои \/ назначенные"/, 'Mine queue section absent');
    // #endregion END_QUEUE_PLACEMENT_ASSERT_SECTIONS

    // #region START_QUEUE_PLACEMENT_ASSERT_ORDER
    // Extract Review queue HTML segment by finding the section between the two queue sections
    const reviewIdx = html.indexOf('aria-label="Ревью"');
    const mineIdx = html.indexOf('aria-label="Мои');
    const reviewSection = html.slice(reviewIdx, mineIdx);
    const mineSection = html.slice(mineIdx);

    // reviewer refs must appear in review section only
    assert.match(reviewSection, /proj!22/, 'proj!22 (reviewer ⏳) not in review queue');
    assert.match(reviewSection, /proj!21/, 'proj!21 (reviewer 🔀) not in review queue');
    assert.match(reviewSection, /proj!20/, 'proj!20 (reviewer 😴) not in review queue');
    assert.doesNotMatch(reviewSection, /proj!10|proj!11|proj!12/, 'non-reviewer in review queue');

    // non-reviewer refs must appear in mine section only
    assert.match(mineSection, /proj!11/, 'proj!11 (mentioned 💬) not in mine queue');
    assert.match(mineSection, /proj!10/, 'proj!10 (author ✅) not in mine queue');
    assert.match(mineSection, /proj!12/, 'proj!12 (null 😴) not in mine queue');
    assert.doesNotMatch(mineSection, /proj!20|proj!21|proj!22/, 'reviewer in mine queue');
    // #endregion END_QUEUE_PLACEMENT_ASSERT_ORDER

    // #region START_QUEUE_PLACEMENT_ASSERT_SORT
    // Review queue: ⏳(proj!22) must appear before 🔀(proj!21) must appear before 😴(proj!20)
    const pos22 = reviewSection.indexOf('proj!22');
    const pos21 = reviewSection.indexOf('proj!21');
    const pos20 = reviewSection.indexOf('proj!20');
    assert.ok(pos22 < pos21, 'decision-required ⏳ must precede agent-working 🔀 in review queue');
    assert.ok(pos21 < pos20, 'agent-working 🔀 must precede no-action 😴 in review queue');

    // Mine queue: 💬(proj!11) must appear before ✅(proj!10) must appear before 😴(proj!12)
    const mpos11 = mineSection.indexOf('proj!11');
    const mpos10 = mineSection.indexOf('proj!10');
    const mpos12 = mineSection.indexOf('proj!12');
    assert.ok(mpos11 < mpos10, 'decision-required 💬 must precede external-wait ✅ in mine queue');
    assert.ok(mpos10 < mpos12, 'external-wait ✅ must precede no-action 😴 in mine queue');
    // #endregion END_QUEUE_PLACEMENT_ASSERT_SORT
  });

  it('open merged and closed state completion and horizon matrix controls active cards', () => {
    // invariant: Complete button visible only for merged or closed lifecycle
    // invariant: Update description visible for all lifecycle states
    // failure mode: Complete shown for open MR (would allow completing non-merged work)

    const { makeCard } = createBoardContext();

    // #region START_HORIZON_SETUP
    const cards: MrCardV2[] = [
      makeCard({ ref: 'h!1', myRole: 'reviewer', attention: '⏳', lifecycle: 'open' }),
      makeCard({ ref: 'h!2', myRole: 'reviewer', attention: '✅', lifecycle: 'merged' }),
      makeCard({ ref: 'h!3', myRole: 'reviewer', attention: '😴', lifecycle: 'closed' }),
    ];
    // #endregion END_HORIZON_SETUP

    const html = renderToStaticMarkup(
      <ResponsibilityQueue cards={cards} syncState="ok" onOpen={() => undefined} />
    );

    // #region START_HORIZON_ASSERT_CONTROLS
    // All cards render Update description (always)
    // count by title attribute — the text "Обновить описание" also appears in aria-label and element content
    const updateCount = (html.match(/title="Обновить описание"/g) ?? []).length;
    assert.strictEqual(updateCount, 3, 'all three cards must show Update description');

    // Extract per-card regions by reference
    const openCardIdx = html.indexOf('h!1');
    const mergedCardIdx = html.indexOf('h!2');
    const closedCardIdx = html.indexOf('h!3');

    // open card region: up to merged card start
    const openRegion = html.slice(openCardIdx, mergedCardIdx);
    // merged card region: up to closed card start
    const mergedRegion = html.slice(mergedCardIdx, closedCardIdx);
    // closed card region: rest
    const closedRegion = html.slice(closedCardIdx);

    assert.doesNotMatch(openRegion, /Завершить/, 'open card must not show Complete button');
    assert.match(mergedRegion, /Завершить/, 'merged card must show Complete button');
    assert.match(closedRegion, /Завершить/, 'closed card must show Complete button');
    // #endregion END_HORIZON_ASSERT_CONTROLS
  });
});
