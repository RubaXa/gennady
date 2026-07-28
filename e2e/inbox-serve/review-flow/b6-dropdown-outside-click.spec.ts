// @file: B6 — the "Assign" dropdown on an unassigned MR card must close when the operator clicks
//   outside it, not only when a role is picked (UnassignedBlock.tsx#UnassignedMrCard).
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-107

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, BASE_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('B6 dropdown outside click', () => {
  test.beforeAll(async () => {
    test.setTimeout(60_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('assign dropdown closes when clicking outside it', async ({ page }) => {
    test.setTimeout(60_000);
    // F7: unassigned needs one completed poll — tick() before navigating (t9 P3-2 sub-step).
    await app!.scheduler.tick();
    await page.goto(BASE_URL);

    const unassignedRegion = page.getByRole('region', { name: 'Unassigned MRs' });
    await expect(unassignedRegion).toBeVisible({ timeout: 10_000 });

    const firstAssignButton = unassignedRegion.getByRole('button', { name: /Assign .+ to role/ }).first();
    await firstAssignButton.click();

    const menu = page.getByRole('button', { name: 'reviewer', exact: true });
    await expect(menu, 'dropdown must open on click').toBeVisible();

    // Click somewhere clearly outside the dropdown — the page header.
    await page.getByText('agent-inbox').click();

    await expect(menu, 'dropdown must close on an outside click, not stay open').toBeHidden({
      timeout: 2000,
    });
  });
});
