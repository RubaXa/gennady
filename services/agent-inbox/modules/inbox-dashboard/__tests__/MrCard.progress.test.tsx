// @file: Unit tests for MrCard's review-progress informer (TSK-155) — stage/track-counter/timer
//   render only when `card.progress` is present; helpers are non-exported so assertions go via DOM text.
// @consumers: node:test runner
// @tasks: TSK-155

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MrCard } from '../components/MrCard.tsx';
import { mockActionableMr } from '../../inbox-mocks/mr.mock.ts';
import type { MrCard as MrCardType, ReviewProgress } from '../../inbox-api/types.ts';

describe('MrCard progress informer', () => {
  /**
   * @purpose Render an MrCard to static HTML — no BoardStore needed, MrCard has no board-context reads.
   */
  function renderMrCard(mr: MrCardType): string {
    return renderToString(createElement(MrCard, { mr }));
  }

  /**
   * @purpose Strip React SSR's `<!-- -->` text-node separators so adjacent-expression text
   *   (e.g. `{tracksDone}/{tracksPlanned}`) reads as plain "3/3" for substring assertions.
   */
  function stripSsrComments(html: string): string {
    return html.replace(/<!--\s*-->/g, '');
  }

  it('renders unchanged when progress is absent', () => {
    const mr = mockActionableMr({ iid: 300, title: 'No progress MR' });

    const html = renderMrCard(mr);

    assert.ok(!html.includes('дорожек'));
  });

  it('shows stage, track counter and elapsed timer', () => {
    // contract: stage label, "M/N" track counter, and a mm:ss timer string all appear in the DOM

    const progress: ReviewProgress = {
      stage: 'synthesis',
      stageLabel: 'Синтез',
      tracksPlanned: 3,
      tracksDone: 3,
      tracksInProgress: [],
      activity: 'Синтез отчёта',
      elapsedMs: 65_000,
      startedAt: new Date(Date.now() - 65_000).toISOString(),
    };
    const mr: MrCardType = { ...mockActionableMr({ iid: 301, title: 'In-review MR' }), progress };

    const html = stripSsrComments(renderMrCard(mr));

    assert.ok(html.includes('Синтез'));
    assert.ok(html.includes('3/3'));
    assert.match(html, /\b\d{1,2}:\d{2}\b/);
  });
});
