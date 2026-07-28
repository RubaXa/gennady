// @file: B7 — opening the detail view for an MR whose review never started must show an "not
//   started yet" empty state, not a bare "Не удалось загрузить отчёт" error indistinguishable
//   from a real failure (MrDetailPage.tsx#_isReportNotStarted).
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-107

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, BASE_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('B7 report not started', () => {
  test.beforeAll(async () => {
    test.setTimeout(60_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('detail view for a never-assigned MR shows "not started", not a bare error', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // F7: unassigned needs one completed poll (t9 P3-2) before any real project/iid exists to link to.
    await app!.scheduler.tick();
    await page.goto(BASE_URL);

    const unassignedRegion = page.getByRole('region', { name: 'Unassigned MRs' });
    await expect(unassignedRegion).toBeVisible({ timeout: 10_000 });

    const firstViewLink = unassignedRegion.getByRole('button', { name: /^View MR / }).first();
    await firstViewLink.click();

    const notStarted = page.getByRole('status').filter({ hasText: 'ещё не начато' });
    await expect(
      notStarted,
      'never-assigned MR must show the "not started" empty state'
    ).toBeVisible({
      timeout: 10_000,
    });

    const bareError = page.getByRole('alert').filter({ hasText: 'Не удалось загрузить отчёт' });
    await expect(
      bareError,
      'must NOT show the bare error for a legit "no report yet" 404'
    ).toHaveCount(0);
  });
});
