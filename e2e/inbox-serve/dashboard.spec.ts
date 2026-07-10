// @file: dashboard.spec.ts — behavioral e2e tests for inbox-dashboard via Playwright.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.config.ts
// @tasks: TSK-108

import { test, expect } from '@playwright/test';

test.describe('inbox-dashboard: behavioral', () => {
  test('dashboard header shows "agent-inbox"', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 10_000 });
    await expect(header.locator('h1')).toContainText('agent-inbox');
  });

  test('queue "Ждут меня" shows count when MRs are AWAITING ME', async ({ page }) => {
    await page.goto('/');

    // inbox-serve seeds MR 512 in reviewer.awaitingMe → queue should show "Ждут меня (1)"
    const awaitingQueue = page.locator('section[aria-label="MRs awaiting my action"]');
    await expect(awaitingQueue).toBeVisible({ timeout: 10_000 });

    // Heading contains "Ждут меня"
    await expect(awaitingQueue.locator('h2')).toContainText('Ждут меня');

    // Count badge shows "(1)"
    await expect(awaitingQueue).toContainText('(1)');

    // The card for MR 512 should be visible in the queue (use role=listitem to be specific)
    const mr512Card = awaitingQueue.locator('div[role="listitem"][aria-label*="!512"]');
    await expect(mr512Card.first()).toBeVisible();
  });

  test('assign role via dropdown on unassigned MrCard', async ({ page }) => {
    await page.goto('/');

    // Find the unassigned block
    const unassignedBlock = page.locator('section[aria-label="Unassigned MRs"]');
    await expect(unassignedBlock).toBeVisible({ timeout: 10_000 });

    // MR 400 should be visible in unassigned (use role=listitem to avoid matching buttons)
    const mr400Card = unassignedBlock.locator('div[role="listitem"][aria-label*="!400"]');
    await expect(mr400Card.first()).toBeVisible();

    // Click the assign button ("Назначить") — the button inside the UnassignedMrCard wrapper
    const assignBtn = unassignedBlock.locator('button[aria-label^="Assign"]');
    await expect(assignBtn).toBeVisible();
    await assignBtn.click();

    // Dropdown menu should appear with role options
    const dropdown = page.locator('.bg-popover');
    await expect(dropdown).toBeVisible();

    // Select "reviewer" role
    await dropdown.locator('button:has-text("reviewer")').click();

    // Wait for the optimistic update + re-sync
    await page.waitForTimeout(1_500);

    // The reviewer INBOX lane should now contain MR 400
    const reviewerBlock = page.locator('section[aria-label="Role: reviewer"]');
    await expect(reviewerBlock).toBeVisible();

    const inboxLane = reviewerBlock.locator('[aria-label="INBOX lane"]');
    await expect(inboxLane.locator('div[role="listitem"][aria-label*="!400"]').first()).toBeVisible(
      { timeout: 5_000 }
    );
  });

  test('click "Смотреть" navigates to #/mr/:id with report modal', async ({ page }) => {
    await page.goto('/');

    // Find MR 510 card in the INBOX lane of reviewer
    const reviewerBlock = page.locator('section[aria-label="Role: reviewer"]');
    await expect(reviewerBlock).toBeVisible({ timeout: 10_000 });

    const inboxLane = reviewerBlock.locator('[aria-label="INBOX lane"]');

    // Click the "Смотреть" button — use evaluate to bypass dnd-kit pointer interception
    const viewBtn = inboxLane.locator('button[aria-label="View MR group/project!510"]');
    await expect(viewBtn).toBeVisible();
    await viewBtn.evaluate((el: HTMLButtonElement) => el.click());

    // Modal dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // URL hash should have changed to #/mr/...
    await expect(page).toHaveURL(/#\/mr\//);

    // Modal should show MR title
    await expect(dialog).toContainText('feat: add new feature');

    // Modal should show findings
    await expect(dialog.locator('text=Findings')).toBeVisible({ timeout: 5_000 });

    // Close modal
    await dialog.locator('button[aria-label="Close"]').click();
    await expect(dialog).not.toBeVisible();
  });

  test('deep-link #/mr/:id works directly', async ({ page }) => {
    // Navigate directly to the MR detail page via hash
    await page.goto('/#/mr/group%2Fproject!510');

    // Modal dialog should appear immediately
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Should show the MR title
    await expect(dialog).toContainText('feat: add new feature');

    // Should show findings section
    await expect(dialog.locator('text=Findings')).toBeVisible({ timeout: 5_000 });
  });

  test('OperatorQuestion: select answer returns to board', async ({ page }) => {
    // Navigate to MR detail
    await page.goto('/#/mr/group%2Fproject!510');

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Wait for report to load — findings section appears
    await expect(dialog.locator('text=Findings')).toBeVisible({ timeout: 5_000 });

    // Operator question section should be visible
    await expect(dialog.locator('text=Operator Question')).toBeVisible();

    // Click "Approve" button inside the dialog
    const approveBtn = dialog.locator('button:has-text("Approve")');
    await approveBtn.click();

    // Wait for the action to complete and board to refresh
    await page.waitForTimeout(1_500);

    // Close the modal via the close button
    await dialog.locator('button[aria-label="Close"]').click();

    // Wait for board page
    await page.waitForTimeout(500);

    // Should be back on the board page (no dialog)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 });

    // The MR should now be in DONE lane
    const reviewerBlock = page.locator('section[aria-label="Role: reviewer"]');
    const doneLane = reviewerBlock.locator('[aria-label="DONE lane"]');
    await expect(doneLane.locator('div[role="listitem"][aria-label*="!510"]').first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('API degraded: error banner appears', async ({ page }) => {
    // Intercept all API calls to /api/board and return 500
    await page.route('**/api/board', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'NETWORK', detail: 'Internal server error' }),
      });
    });

    await page.goto('/');

    // The header should show API error
    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 10_000 });

    // "API недоступен" text should appear
    await expect(header).toContainText('API недоступен', { timeout: 5_000 });
  });
});
