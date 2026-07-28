// @file: B1 — cold start: while /api/board is still in flight the board shows a loading
//   skeleton, never a zeroed-out board (BoardSkeleton.tsx, TSK-107). Delays the FIRST response so
//   the loading frame is actually observable instead of racing localhost's real latency.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-107

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, BASE_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('B1 cold start', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('skeleton renders while /api/board is in flight; real board renders after — no false zeros', async ({
    page,
  }) => {
    let boardRouteHit = false;
    await page.route('**/api/board', async (route) => {
      boardRouteHit = true;
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto(BASE_URL);

    // While the (delayed) fetch is in flight: skeleton visible, no lane counts on screen yet.
    const skeleton = page.getByRole('status', { name: 'Loading dashboard' });
    await expect(skeleton, 'BoardSkeleton must render during the in-flight /api/board fetch').toBeVisible({
      timeout: 1000,
    });
    expect(boardRouteHit, 'test route must have actually intercepted /api/board').toBe(true);

    const zeroCountDuringLoad = await page.getByText('0', { exact: true }).count();
    expect(
      zeroCountDuringLoad,
      'no lane-count "0" should render while the skeleton is up — that would be a false zero'
    ).toBe(0);

    // After the delayed response resolves: skeleton gone, real board (role blocks) visible.
    await expect(skeleton, 'skeleton must disappear once real data has loaded').toBeHidden({
      timeout: 5000,
    });
    await expect(page.getByRole('region', { name: 'Unassigned MRs' })).toBeVisible({ timeout: 5000 });
  });
});
