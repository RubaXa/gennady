// @file: MrCard tests — lifecycle controls and accessibility rules for ReviewMrCard.
// @consumers: node:test runner
// @tasks: TSK-182

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewMrCard } from '../board/ResponsibilityQueue.tsx';
import type { MrCardV2 } from '../v2-types.ts';

// Test Graph:
//   ReviewMrCard
//     ✓ description and completion controls follow lifecycle and accessibility rules
//         - open → Update description present, Complete absent
//         - merged → both controls present
//         - closed → both controls present
//         - lifecycle absent (defaults to open) → Complete absent
//         - aria labels on controls are descriptive (non-colour cues)
//         - counter row labels include text alongside icons (non-colour accessibility)

type CardContext = {
  baseCard: MrCardV2;
};

function createCardContext(overrides?: Partial<MrCardV2>): CardContext {
  return {
    baseCard: {
      ref: 'group/project!99',
      title: 'Accessibility test MR',
      author: 'alice',
      myRole: 'reviewer',
      attention: '⏳',
      counters: {
        approvals: '1/3',
        reviewers: [
          { user: 'alice', voted: true },
          { user: 'bob', voted: false },
        ],
        ci: 'passed',
        threads: '2/5',
        awaitingMe: 2,
        newCommits: 3,
        unread: 1,
      },
      work: { state: 'idle', label: 'Нет работы', startedAt: null },
      ...overrides,
    },
  };
}

describe('ReviewMrCard', () => {
  it('description and completion controls follow lifecycle and accessibility rules', () => {
    // invariant: Complete only visible for merged or closed lifecycle state
    // invariant: Update description always visible — operator must be able to update at any stage
    // invariant: counter labels include text alongside emoji — non-colour accessibility requirement
    // failure mode: showing Complete for open MR allows premature completion

    // #region START_CARD_LIFECYCLE_OPEN
    const { baseCard } = createCardContext({ lifecycle: 'open' });
    const openHtml = renderToStaticMarkup(
      <ReviewMrCard card={baseCard} onOpen={() => undefined} />
    );
    assert.match(openHtml, /Обновить описание/, 'open: update description absent');
    assert.doesNotMatch(openHtml, /Завершить/, 'open: complete must be absent');
    // #endregion END_CARD_LIFECYCLE_OPEN

    // #region START_CARD_LIFECYCLE_MERGED
    const { baseCard: mergedCard } = createCardContext({ lifecycle: 'merged' });
    const mergedHtml = renderToStaticMarkup(
      <ReviewMrCard card={mergedCard} onOpen={() => undefined} />
    );
    assert.match(mergedHtml, /Обновить описание/, 'merged: update description absent');
    assert.match(mergedHtml, /Завершить/, 'merged: complete absent');
    // #endregion END_CARD_LIFECYCLE_MERGED

    // #region START_CARD_LIFECYCLE_CLOSED
    const { baseCard: closedCard } = createCardContext({ lifecycle: 'closed' });
    const closedHtml = renderToStaticMarkup(
      <ReviewMrCard card={closedCard} onOpen={() => undefined} />
    );
    assert.match(closedHtml, /Обновить описание/, 'closed: update description absent');
    assert.match(closedHtml, /Завершить/, 'closed: complete absent');
    // #endregion END_CARD_LIFECYCLE_CLOSED

    // #region START_CARD_LIFECYCLE_DEFAULT
    // lifecycle absent defaults to 'open' → same rules as open
    const { baseCard: noLifecycleCard } = createCardContext();
    const noLifecycleHtml = renderToStaticMarkup(
      <ReviewMrCard card={noLifecycleCard} onOpen={() => undefined} />
    );
    assert.match(noLifecycleHtml, /Обновить описание/, 'no-lifecycle: update description absent');
    assert.doesNotMatch(noLifecycleHtml, /Завершить/, 'no-lifecycle: complete must be absent');
    // #endregion END_CARD_LIFECYCLE_DEFAULT

    // #region START_CARD_ACCESSIBILITY
    // aria labels on controls are descriptive — screen reader must identify the target MR
    assert.match(
      openHtml,
      /aria-label="Обновить описание MR group\/project!99"/,
      'update description aria-label missing MR ref'
    );

    // counter labels include text alongside emoji (non-colour accessibility requirement)
    // approvals: "✅ 1/3" — text fraction not just icon
    assert.match(openHtml, /Аппрувы:/, 'approvals counter missing text label');
    // threads: "💬 2/5" — text fraction
    assert.match(openHtml, /Треды:/, 'threads counter missing text label');
    // awaitingMe: includes "мне" text
    assert.match(openHtml, /мне/, 'awaitingMe counter missing "мне" text label');
    // #endregion END_CARD_ACCESSIBILITY
  });
});
