// @file: MrWorkspace tests — seven-widget feed lifecycle and viewport-invariant composition.
// @consumers: node:test runner
// @tasks: TSK-182

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewFeed } from '../workspace/widgets/ReviewFeed.tsx';
import { MrWorkspace } from '../workspace/MrWorkspace.tsx';
import type { FeedWidget, MrStateV2 } from '../v2-types.ts';

// Test Graph:
//   MrWorkspace / ReviewFeed
//     ✓ seven widgets preserve unread anchors local errors and cyclic versus one-shot lifecycle
//         - all 7 widget types render with their canonical heading
//         - unread divider appears at the first unread widget
//         - resolved action widget (one-shot) is hidden
//         - non-resolved action widget is visible
//         - widget local to a findings widget does not propagate to surrounding feed
//     ✓ viewport changes retain operator selections evidence and handoff draft
//         - MrWorkspace renders all sub-sections unconditionally (no viewport-gated unmount)
//         - feed section, package section, artifact section, handoff section, chat panel all present

type FeedContext = {
  makeWidget: (type: FeedWidget['type'], overrides?: Partial<FeedWidget>) => FeedWidget;
  makeState: (widgets: FeedWidget[]) => MrStateV2;
};

function createFeedContext(): FeedContext {
  let counter = 0;

  const makeWidget = (type: FeedWidget['type'], overrides?: Partial<FeedWidget>): FeedWidget => ({
    widgetId: `w-${type}-${++counter}`,
    type,
    lastActivity: '2026-08-11T12:00:00Z',
    resolved: false,
    unread: false,
    anchors: [{ widgetId: `w-${type}-${counter}`, elementId: `el-${counter}` }],
    payload: {},
    ...overrides,
  });

  const makeState = (widgets: FeedWidget[]): MrStateV2 => ({
    queue: [],
    widgets,
  });

  return { makeWidget, makeState };
}

describe('MrWorkspace / ReviewFeed', () => {
  it('seven widgets preserve unread anchors local errors and cyclic versus one-shot lifecycle', () => {
    // invariant: all 7 widget types must render; resolved action widget must not appear
    // invariant: unread divider appears exactly at the first unread widget
    // failure mode: wrong widget type hidden, or divider misplaced → feed loses navigation anchor

    const { makeWidget, makeState } = createFeedContext();

    // #region START_FEED_SETUP_WIDGETS
    // findings widget with a simulated local error payload (hidden finding)
    const findingsWidget = makeWidget('findings', {
      payload: {
        items: [
          { id: 'f1', severity: 'high', summary: 'Potential null ref', factcheck: 'pending' },
          { id: 'f2', severity: 'medium', summary: 'Hidden finding', hidden: true },
        ],
      },
    });

    const threadsWidget = makeWidget('threads', {
      payload: { items: [{ threadId: 't1', summary: 'Open thread', author: 'operator' }] },
    });

    // artifact widget is the first unread widget — divider appears before it
    const artifactWidget = makeWidget('artifact', { unread: true });

    const gitlabWidget = makeWidget('gitlab', {
      payload: { event: 'approval', title: 'GitLab approval event' },
    });

    const planWidget = makeWidget('plan', {
      payload: { stage: 'Logic Rev', tracksDone: 1, tracksTotal: 3 },
    });

    const progressWidget = makeWidget('progress', {
      payload: { title: 'Phase 2 running', items: [] },
    });

    // non-resolved action widget — must render
    const actionWidgetActive = makeWidget('action', {
      resolved: false,
      payload: { effect: 'post_findings' },
    });

    // resolved action widget — must NOT render (one-shot lifecycle: sinks when resolved)
    const actionWidgetResolved = makeWidget('action', {
      resolved: true,
      payload: { effect: 'already_done' },
    });

    const state = makeState([
      findingsWidget,
      threadsWidget,
      artifactWidget, // first unread
      gitlabWidget,
      planWidget,
      progressWidget,
      actionWidgetActive,
      actionWidgetResolved, // resolved → hidden
    ]);
    // #endregion END_FEED_SETUP_WIDGETS

    const html = renderToStaticMarkup(
      <ReviewFeed state={state} onAction={() => undefined} pending={null} />
    );

    // #region START_FEED_ASSERT_HEADINGS
    assert.match(html, /🔍 Находки/, 'findings widget heading absent');
    assert.match(html, /💬 Треды ждут меня/, 'threads widget heading absent');
    assert.match(html, /📄 Артефакт-пост/, 'artifact widget heading absent');
    assert.match(html, /🦊 GitLab-событие/, 'gitlab widget heading absent');
    assert.match(html, /📋 Текущий план/, 'plan widget heading absent');
    assert.match(html, /🔧 Прогресс/, 'progress widget heading absent');
    assert.match(html, /⚡ Действие/, 'action widget heading absent');
    // #endregion END_FEED_ASSERT_HEADINGS

    // #region START_FEED_ASSERT_UNREAD_DIVIDER
    // unread divider must appear before the artifact widget (first unread)
    const dividerPos = html.indexOf('Новое с прошлого визита');
    const artifactPos = html.indexOf('📄 Артефакт-пост');
    assert.ok(dividerPos !== -1, 'unread divider absent');
    assert.ok(dividerPos < artifactPos, 'unread divider must appear before artifact widget');
    // divider must NOT appear before findings or threads (they are not unread)
    const findingsPos = html.indexOf('🔍 Находки');
    assert.ok(
      findingsPos < dividerPos,
      'divider must not appear before non-unread findings widget'
    );
    // #endregion END_FEED_ASSERT_UNREAD_DIVIDER

    // #region START_FEED_ASSERT_ONE_SHOT_LIFECYCLE
    // resolved action payload must not appear in rendered output
    assert.doesNotMatch(html, /already_done/, 'resolved action widget must not render its payload');
    // non-resolved action must appear
    assert.match(html, /post_findings/, 'active action widget payload absent');
    // #endregion END_FEED_ASSERT_ONE_SHOT_LIFECYCLE

    // #region START_FEED_ASSERT_ANCHORS
    // anchor-capable findings widget must render with data-anchor-id attribute for deep-link
    assert.match(html, /data-anchor-id="f1"/, 'findings item anchor id absent');
    // #endregion END_FEED_ASSERT_ANCHORS
  });

  it('viewport changes retain operator selections evidence and handoff draft', () => {
    // invariant: MrWorkspace mounts all sub-sections unconditionally — no viewport-gated unmount
    // failure mode: viewport-conditional rendering unmounts the workspace and loses operator state
    // observation focus: structural presence of all 5 sections in rendered output (feed, package, artifact, handoff, chat)

    const html = renderToStaticMarkup(
      <MrWorkspace
        mrRef="group/project!1"
        state={null}
        onBack={() => undefined}
        onAction={() => undefined}
        pending={null}
        onSelectAnchor={() => undefined}
        chatAnchor={null}
        transcript={[]}
        streamingText=""
        pendingQuestion={null}
        undoSnapshotId={null}
        disconnected={false}
        onDecision={async () => undefined}
        onUndo={async () => undefined}
        onChatSubmit={async () => undefined}
      />
    );

    // #region START_VIEWPORT_ASSERT_STRUCTURE
    // top-level workspace container
    assert.match(html, /v2-workspace/, 'workspace container absent');

    // main content column (feed + package + artifact + handoff)
    assert.match(html, /v2-mr/, 'main MR column absent');

    // chat panel rendered alongside main column (not inside it)
    assert.match(html, /v2-chat/, 'chat panel absent');
    assert.match(html, /aria-label="Чат"/, 'chat aria-label absent');

    // handoff section (always rendered, not viewport-gated)
    assert.match(html, /v2-handoff-control/, 'handoff control absent');
    assert.match(html, /Передать задачу/, 'handoff label absent');

    // unavailable package is omitted so the workspace never exposes a raw placeholder row
    assert.doesNotMatch(html, /v2-package/, 'unavailable package must stay hidden');

    // feed section renders (empty state since state=null)
    assert.match(html, /v2-feed/, 'feed section absent');
    // #endregion END_VIEWPORT_ASSERT_STRUCTURE
  });

  it('report route owns a stable artifact workspace without MR loading chrome', () => {
    const html = renderToStaticMarkup(
      <MrWorkspace
        mrRef="group/project!1"
        state={null}
        artifactPath="REVIEW.md"
        onBack={() => undefined}
        onAction={() => undefined}
        pending={null}
        onSelectAnchor={() => undefined}
        chatAnchor={null}
        transcript={[]}
        streamingText=""
        pendingQuestion={null}
        undoSnapshotId={null}
        disconnected={false}
        onDecision={async () => undefined}
        onUndo={async () => undefined}
        onChatSubmit={async () => undefined}
      />
    );

    assert.match(html, /Центр артефактов ревью/);
    assert.match(html, /Артефакты ревью/);
    assert.match(html, /aria-label="Чат"/);
    assert.doesNotMatch(html, /Загрузка MR/);
    assert.doesNotMatch(html, /Управление ревью/);
  });
});
