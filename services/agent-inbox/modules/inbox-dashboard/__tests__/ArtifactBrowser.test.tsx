// @file: Unit tests for ArtifactBrowser — artifact list from GET /artifacts, select →
//   ArtifactView render, REPORT.md default selection.
// @consumers: node:test runner
// @tasks: TSK-107

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { resolve } from 'node:path';
import type { ArtifactRef, ArtifactContent } from '../../inbox-api/types.ts';

const TESTS_DIR = new URL('.', import.meta.url).pathname;
const API_CLIENT_PATH = resolve(TESTS_DIR, '../services/api-client.ts');

const REFS: ArtifactRef[] = [
  { name: 'REPORT.md', path: 'REPORT.md', kind: 'md' },
  { name: 'PLAN.md', path: 'PLAN.md', kind: 'md' },
  { name: 'tracks/security.md', path: 'tracks/security.md', kind: 'md' },
];

const CONTENTS: Record<string, ArtifactContent> = {
  'REPORT.md': { content: 'REPORT body text', kind: 'md' },
  'PLAN.md': { content: 'PLAN body text', kind: 'md' },
  'tracks/security.md': { content: 'security track body', kind: 'md' },
};

const listArtifactsMock = mock.fn(async (_mrId: string) => REFS);
const readArtifactMock = mock.fn(async (_mrId: string, path: string) => CONTENTS[path]);

mock.module(API_CLIENT_PATH, {
  namedExports: { listArtifacts: listArtifactsMock, readArtifact: readArtifactMock },
});

// Node 22+ ships a built-in getter-only `navigator` global; test-setup.ts's plain assignment
// throws against it (pre-existing helper, not a P3 Target File — not edited here). Re-defining
// as a writable data property first lets createTestContainer's assignment succeed.
Object.defineProperty(globalThis, 'navigator', {
  value: undefined,
  writable: true,
  configurable: true,
});

const { createTestContainer, render, cleanup } = await import('./test-setup.ts');
const { ArtifactBrowser } = await import('../components/ArtifactBrowser.tsx');

/** @purpose Yield one macrotask so pending mocked-fetch promise chains settle before assertions. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** @purpose Render ArtifactBrowser and let its two effects (list, then content) settle. */
async function renderSettled(mrId: string) {
  const container = createTestContainer();
  await act(async () => {
    render(createElement(ArtifactBrowser, { mrId }), container);
  });
  await act(async () => {
    await flush();
  });
  await act(async () => {
    await flush();
  });
  return container;
}

describe('ArtifactBrowser', () => {
  beforeEach(() => {
    listArtifactsMock.mock.resetCalls();
    readArtifactMock.mock.resetCalls();
  });

  it('lists artifacts from GET /artifacts', async () => {
    const container = await renderSettled('group/project!510');
    try {
      assert.equal(listArtifactsMock.mock.callCount(), 1);
      assert.equal(listArtifactsMock.mock.calls[0].arguments[0], 'group/project!510');

      const html = container.innerHTML;
      assert.ok(html.includes('REPORT.md'), 'REPORT.md listed');
      assert.ok(html.includes('PLAN.md'), 'PLAN.md listed');
      assert.ok(html.includes('tracks/security.md'), 'tracks/security.md listed');
    } finally {
      await act(async () => cleanup());
    }
  });

  it('defaults to REPORT.md and renders its content via ArtifactView', async () => {
    const container = await renderSettled('group/project!510');
    try {
      assert.equal(readArtifactMock.mock.callCount(), 1);
      assert.equal(readArtifactMock.mock.calls[0].arguments[1], 'REPORT.md');
      assert.ok(container.innerHTML.includes('REPORT body text'));

      const reportButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('REPORT.md')
      );
      assert.ok(reportButton, 'REPORT.md nav entry present');
      assert.equal(reportButton!.getAttribute('aria-current'), 'true');
    } finally {
      await act(async () => cleanup());
    }
  });

  it('selecting a different artifact fetches and renders its content', async () => {
    const container = await renderSettled('group/project!510');
    try {
      const planButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('PLAN.md')
      );
      assert.ok(planButton, 'PLAN.md nav button found');

      await act(async () => {
        planButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
        await flush();
      });

      assert.equal(readArtifactMock.mock.callCount(), 2);
      assert.equal(
        readArtifactMock.mock.calls[1].arguments[1],
        'PLAN.md',
        'second read fetches PLAN.md'
      );
      assert.ok(container.innerHTML.includes('PLAN body text'));
      assert.ok(!container.innerHTML.includes('REPORT body text'));
    } finally {
      await act(async () => cleanup());
    }
  });

  it('falls back to the first artifact when REPORT.md is absent', async () => {
    listArtifactsMock.mock.mockImplementationOnce(async () => [
      { name: 'PLAN.md', path: 'PLAN.md', kind: 'md' },
      { name: 'HISTORY.md', path: 'HISTORY.md', kind: 'md' },
    ]);

    const container = await renderSettled('group/project!511');
    try {
      assert.equal(readArtifactMock.mock.calls[0].arguments[1], 'PLAN.md');
      assert.ok(container.innerHTML.includes('PLAN body text'));
    } finally {
      await act(async () => cleanup());
    }
  });

  it('re-fetches the artifact list and the open artifact content when refreshToken changes (TSK-133)', async () => {
    const container = createTestContainer();
    let root: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      root = render(
        createElement(ArtifactBrowser, { mrId: 'group/project!777', refreshToken: 1 }),
        container
      );
    });
    await act(async () => {
      await flush();
    });
    await act(async () => {
      await flush();
    });

    try {
      assert.equal(listArtifactsMock.mock.callCount(), 1, 'initial mount fetches the list once');
      assert.equal(readArtifactMock.mock.callCount(), 1, 'initial mount fetches content once');

      // Bumping refreshToken on the SAME mounted instance (real re-render, not remount) simulates
      // MrDetailPage relaying an SSE `refresh` frame.
      await act(async () => {
        root.render(createElement(ArtifactBrowser, { mrId: 'group/project!777', refreshToken: 2 }));
      });
      await act(async () => {
        await flush();
      });
      await act(async () => {
        await flush();
      });

      assert.equal(
        listArtifactsMock.mock.callCount(),
        2,
        'refreshToken bump should re-trigger GET /api/mr/:id/artifacts'
      );
      assert.equal(
        readArtifactMock.mock.callCount(),
        2,
        'refreshToken bump should also re-fetch the currently open artifact content'
      );
    } finally {
      await act(async () => cleanup());
    }
  });
});
