// @file: optimistic dashboard test — pending overlay renders before task confirmation.
// @tasks: TSK-164
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedList } from '../dashboard-v2-ui.tsx';
test('action shows pending state before server confirms', () => {
  const html = renderToStaticMarkup(
    <FeedList
      state={{
        queue: [],
        widgets: [
          {
            widgetId: 'f',
            type: 'findings',
            lastActivity: new Date().toISOString(),
            resolved: false,
            unread: false,
            anchors: [],
            payload: { items: [] },
          },
        ],
      }}
      onAction={() => undefined}
      pending="#7"
    />
  );
  assert.match(html, /⏳ #7/);
});
