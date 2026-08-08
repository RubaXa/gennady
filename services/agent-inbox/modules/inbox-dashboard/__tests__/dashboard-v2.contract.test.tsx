// @file: Dashboard v2 BDD — canonical card, loading error, and SSE fallback semantics.
// @consumers: node:test runner
// @tasks: TSK-164

import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadingScreen, MrCard, sseBackoffMs } from '../dashboard-v2-ui.tsx';
import { dashboardV2Api } from '../dashboard-v2-api.ts';
import type { MrCardV2 } from '../v2-types.ts';

const card: MrCardV2 = {
  ref: 'group/project!174',
  title: 'Починка ретраев в очереди сообщений',
  author: 'mail-bot',
  myRole: 'reviewer',
  attention: '🔀',
  counters: {
    approvals: '2/3',
    reviewers: [
      { user: 'me', voted: true },
      { user: 'author', voted: false },
    ],
    ci: '✓',
    threads: '4/9',
    awaitingMe: 2,
    newCommits: 2,
    unread: 3,
  },
  work: { state: 'running', label: 'Синтез', taskId: 'task-41', startedAt: '2026-08-08T00:00:00Z' },
};

test('card renders all four canonical rows with counters', () => {
  const html = renderToStaticMarkup(<MrCard card={card} onOpen={() => undefined} />);
  assert.match(html, /mail-bot/);
  assert.match(html, /group\/project!174/);
  assert.match(html, /Починка ретраев/);
  assert.match(html, /✅ 2\/3/);
  assert.match(html, /🏗 ✓/);
  assert.match(html, /💬 4\/9/);
  assert.match(html, /🔍 Ревью/);
  assert.match(html, /Синтез/);
});

test('sse break uses bounded batch backoff and recovery resets it', () => {
  assert.equal(sseBackoffMs(3000, false), 6000);
  assert.equal(sseBackoffMs(20000, false), 30000);
  assert.equal(sseBackoffMs(30000, false), 30000);
  assert.equal(sseBackoffMs(30000, true), 3000);
});

test('boot phase error stays visible with retry instead of empty state', () => {
  const html = renderToStaticMarkup(
    <LoadingScreen
      boot={{
        phase: 'reconcile',
        ready: false,
        configured: true,
        missing: [],
        error: 'VCS недоступен',
      }}
      onOpen={() => undefined}
      onRetry={() => undefined}
    />
  );
  assert.match(html, /VCS недоступен/);
  assert.match(html, /Повторить/);
  assert.doesNotMatch(html, /лента пуста/);
});

test('undo uses the actual mutation snapshot on the MR-scoped endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (path: string | URL | Request, init?: RequestInit) => {
    calls.push({ path: String(path), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await dashboardV2Api.undo('group/project!174', 'snapshot-real-42');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.path, '/api/mr/group%2Fproject!174/chat/undo');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.equal(calls[0]?.init?.body, JSON.stringify({ snapshotId: 'snapshot-real-42' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
