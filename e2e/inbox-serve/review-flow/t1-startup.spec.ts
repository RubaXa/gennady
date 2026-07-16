// @file: t1 — startup: the REAL product boots in-process (mocks:false, dryRun:true), its HTTP server
//   answers GET /api/board with 200, and the built SPA index is served. No review, no browser.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, BASE_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('t1 startup', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('GET /api/board → 200 ok; SPA index served', async ({ request }) => {
    const board = await request.get(`${BASE_URL}/api/board`);
    expect(board.status()).toBe(200);
    const body = await board.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.roles)).toBe(true);

    const index = await request.get(`${BASE_URL}/`);
    expect(index.status()).toBe(200);
    const html = await index.text();
    expect(html).toContain('<div id="root">');
    expect(html).toMatch(/<script[^>]+src="[^"]*assets\//);
  });
});
