// @file: feed lifecycle tests — canonical recurring/one-shot dashboard rendering.
// @tasks: TSK-164
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedList } from '../dashboard-v2-ui.tsx';
import type { MrStateV2 } from '../v2-types.ts';

const state = (widgets: MrStateV2['widgets']): MrStateV2 => ({ queue: [], widgets });
test('recurring widget shows only new items after bump', () => {
  const html = renderToStaticMarkup(
    <FeedList
      state={state([
        {
          widgetId: 'f4',
          type: 'findings',
          lastActivity: new Date().toISOString(),
          resolved: false,
          unread: true,
          anchors: [],
          payload: { items: [{ id: 'F4', summary: 'new finding' }] },
        },
      ])}
      onAction={() => undefined}
      pending={null}
    />
  );
  assert.match(html, /new finding/);
  assert.doesNotMatch(html, /F1|F2|F3/);
  assert.match(html, /Новое с прошлого визита/);
});
test('one-shot widget sinks when resolved', () => {
  const html = renderToStaticMarkup(
    <FeedList
      state={state([
        {
          widgetId: 'action-1',
          type: 'action',
          lastActivity: new Date().toISOString(),
          resolved: true,
          unread: false,
          anchors: [],
          payload: { effect: 'posted' },
        },
      ])}
      onAction={() => undefined}
      pending={null}
    />
  );
  assert.doesNotMatch(html, /posted/);
});
test('foreign thread resolve is disabled with reason', () => {
  const html = renderToStaticMarkup(
    <FeedList
      state={state([
        {
          widgetId: 'thread',
          type: 'threads',
          lastActivity: new Date().toISOString(),
          resolved: false,
          unread: false,
          anchors: [],
          payload: { items: [{ threadId: 't', author: 'stranger', quote: 'please reply' }] },
        },
      ])}
      onAction={() => undefined}
      pending={null}
    />
  );
  assert.match(html, /disabled/);
  assert.match(html, /Только свои или bot-треды/);
});
