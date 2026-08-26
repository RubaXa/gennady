// @file: dashboard contract tests — every card chip widget package outcome variant.
// @consumers: node:test runner
// @tasks: TSK-182

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewMrCard, ReviewStateChip } from '../board/ResponsibilityQueue.tsx';
import { ReviewWidget } from '../workspace/widgets/ReviewFeed.tsx';
import type { Attention, FeedWidget, MrCardV2 } from '../v2-types.ts';

// Test Graph:
//   dashboard contract
//     ✓ dashboard renders every card widget package and outcome variant
//         - attention chips: 5 variants → chip class present + emoji in label
//         - widget kinds: 7 types → v2-widget rendered per type
//         - lifecycle controls: open/merged/closed → Complete button presence
//         - work chip: running state → v2-chip-work class + work label
//         - resolved action widget → empty output (one-shot lifecycle)

type ContractContext = {
  baseCard: MrCardV2;
  baseWidget: (type: FeedWidget['type']) => FeedWidget;
};

function createContractContext(): ContractContext {
  return {
    baseCard: {
      ref: 'group/project!1',
      title: 'Contract test MR',
      author: 'tester',
      myRole: 'reviewer',
      attention: '⏳',
      counters: {
        approvals: '1/2',
        reviewers: [{ user: 'tester', voted: true }],
        ci: 'ok',
        threads: '1/2',
        awaitingMe: 1,
        newCommits: 0,
        unread: 0,
      },
      work: { state: 'idle', label: 'Нет работы', startedAt: null },
    },
    baseWidget: (type: FeedWidget['type']): FeedWidget => ({
      widgetId: `w-${type}`,
      type,
      lastActivity: '2026-08-11T00:00:00Z',
      resolved: false,
      unread: false,
      anchors: [],
      payload: {},
    }),
  };
}

describe('dashboard contract', () => {
  it('dashboard renders every card widget package and outcome variant', () => {
    // invariant: every discriminant defined in the closed entity inventory renders without unknown fallback
    // failure mode: missing case in attention/widget/lifecycle maps renders silently wrong — caught here

    const { baseCard, baseWidget } = createContractContext();

    // #region START_CONTRACT_ATTENTION_CHIPS
    const attentions: Attention[] = ['⏳', '💬', '🔀', '✅', '😴'];
    for (const attention of attentions) {
      const html = renderToStaticMarkup(
        <ReviewStateChip attention={attention} workState="idle" workLabel="Нет работы" />
      );
      assert.match(html, /v2-state-chip/, `attention ${attention}: chip class absent`);
      assert.match(
        html,
        new RegExp(attention),
        `attention ${attention}: emoji absent from chip output`
      );
    }
    // #endregion END_CONTRACT_ATTENTION_CHIPS

    // #region START_CONTRACT_WIDGET_KINDS
    const widgetTypes: FeedWidget['type'][] = [
      'findings',
      'threads',
      'artifact',
      'gitlab',
      'plan',
      'progress',
      'action',
    ];
    for (const type of widgetTypes) {
      const html = renderToStaticMarkup(
        <div>
          <ReviewWidget
            widget={baseWidget(type)}
            onAction={() => undefined}
            pending={null}
            onSelectAnchor={() => undefined}
          />
        </div>
      );
      assert.match(html, /v2-widget/, `widget type ${type}: v2-widget class absent`);
    }
    // #endregion END_CONTRACT_WIDGET_KINDS

    // #region START_CONTRACT_LIFECYCLE_CONTROLS
    // open → Complete absent; Update description present
    const openHtml = renderToStaticMarkup(
      <ReviewMrCard card={{ ...baseCard, lifecycle: 'open' }} onOpen={() => undefined} />
    );
    assert.match(openHtml, /Обновить описание/, 'open: update description absent');
    assert.doesNotMatch(openHtml, /Завершить/, 'open: complete must be absent');

    // merged → both controls present
    const mergedHtml = renderToStaticMarkup(
      <ReviewMrCard card={{ ...baseCard, lifecycle: 'merged' }} onOpen={() => undefined} />
    );
    assert.match(mergedHtml, /Обновить описание/, 'merged: update description absent');
    assert.match(mergedHtml, /Завершить/, 'merged: complete absent');

    // closed → both controls present
    const closedHtml = renderToStaticMarkup(
      <ReviewMrCard card={{ ...baseCard, lifecycle: 'closed' }} onOpen={() => undefined} />
    );
    assert.match(closedHtml, /Обновить описание/, 'closed: update description absent');
    assert.match(closedHtml, /Завершить/, 'closed: complete absent');
    // #endregion END_CONTRACT_LIFECYCLE_CONTROLS

    // #region START_CONTRACT_WORK_CHIP
    // running work state → work chip class supersedes attention chip
    const runningHtml = renderToStaticMarkup(
      <ReviewStateChip attention="⏳" workState="running" workLabel="🔍 Ревью" />
    );
    assert.match(runningHtml, /v2-chip-work/, 'running: work chip class absent');
    assert.match(runningHtml, /🔍 Ревью/, 'running: work label absent (non-colour cue)');
    assert.doesNotMatch(
      runningHtml,
      /v2-chip-attention/,
      'running: attention class must be absent'
    );
    // #endregion END_CONTRACT_WORK_CHIP

    // #region START_CONTRACT_RESOLVED_ACTION
    // resolved action widget → empty (one-shot lifecycle: sinks when resolved)
    const resolvedHtml = renderToStaticMarkup(
      <div>
        <ReviewWidget
          widget={{ ...baseWidget('action'), resolved: true }}
          onAction={() => undefined}
          pending={null}
          onSelectAnchor={() => undefined}
        />
      </div>
    );
    assert.doesNotMatch(resolvedHtml, /v2-widget/, 'resolved action: widget must not render');
    // #endregion END_CONTRACT_RESOLVED_ACTION
  });
});
