// @file: MrCard tests — navigation and accessibility rules for ReviewMrCard.
// @consumers: node:test runner
// @tasks: TSK-182

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewMrCard } from '../board/ResponsibilityQueue.tsx';
import type { MrCardV2 } from '../v2-types.ts';

const card: MrCardV2 = {
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
  work: { state: 'idle', label: 'Ревью не запускалось', startedAt: null },
};

describe('ReviewMrCard', () => {
  it('is one accessible navigation surface with readable counters and work state', () => {
    const html = renderToStaticMarkup(<ReviewMrCard card={card} onOpen={() => undefined} />);

    assert.match(html, /aria-label="Открыть group\/project!99"/);
    assert.match(html, /Аппрувы:/);
    assert.match(html, /Ревьюеры:/);
    assert.match(html, /Треды:/);
    assert.match(html, /мне/);
    assert.match(html, /Ревью не запускалось/);
    assert.match(html, /Обновить описание/);
    assert.doesNotMatch(html, /Завершить/);
  });
});
