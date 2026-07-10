// @file: dashboard.layout.spec.ts — layout checks for inbox-dashboard element positioning.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.config.ts
// @tasks: TSK-108

import { test, expect } from '@playwright/test';
import { isLeftOf, isBelow } from './helpers/layout.helper.ts';

test.describe('inbox-dashboard: layout', () => {
  test('queue "Ждут меня" is above role blocks', async ({ page }) => {
    await page.goto('/');

    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });

    // The awaiting queue should be the first section in main
    const awaitingQueue = main.locator('section[aria-label="MRs awaiting my action"]');
    await expect(awaitingQueue).toBeVisible();

    // The first role block (reviewer) should appear after the queue
    const reviewerBlock = main.locator('section[aria-label="Role: reviewer"]');
    await expect(reviewerBlock).toBeVisible();

    // Queue should be above reviewer block
    const queueAboveReviewer = await isBelow(awaitingQueue, reviewerBlock);
    expect(queueAboveReviewer).toBe(true);
  });

  test('columns order: INBOX left of PROGRESS left of AWAITING left of DONE', async ({ page }) => {
    await page.goto('/');

    const reviewerBlock = page.locator('section[aria-label="Role: reviewer"]');
    await expect(reviewerBlock).toBeVisible({ timeout: 10_000 });

    // Expand if collapsed
    const expandBtn = reviewerBlock.locator('[aria-expanded]');
    const expanded = await expandBtn.getAttribute('aria-expanded');
    if (expanded === 'false') {
      await expandBtn.click();
      await page.waitForTimeout(300);
    }

    const inboxLane = reviewerBlock.locator('[aria-label="INBOX lane"]');
    const progressLane = reviewerBlock.locator('[aria-label="PROGRESS lane"]');
    const awaitingLane = reviewerBlock.locator('[aria-label="AWAITING lane"]');
    const doneLane = reviewerBlock.locator('[aria-label="DONE lane"]');

    await expect(inboxLane).toBeVisible();
    await expect(progressLane).toBeVisible();
    await expect(awaitingLane).toBeVisible();
    await expect(doneLane).toBeVisible();

    // Check horizontal ordering
    const inboxLeftOfProgress = await isLeftOf(inboxLane, progressLane);
    expect(inboxLeftOfProgress).toBe(true);

    const progressLeftOfAwaiting = await isLeftOf(progressLane, awaitingLane);
    expect(progressLeftOfAwaiting).toBe(true);

    const awaitingLeftOfDone = await isLeftOf(awaitingLane, doneLane);
    expect(awaitingLeftOfDone).toBe(true);
  });

  test('role blocks order: reviewer above author above "БЕЗ РОЛИ"', async ({ page }) => {
    await page.goto('/');

    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });

    const reviewerBlock = main.locator('section[aria-label="Role: reviewer"]');
    const authorBlock = main.locator('section[aria-label="Role: author"]');
    const unassignedBlock = main.locator('section[aria-label="Unassigned MRs"]');

    await expect(reviewerBlock).toBeVisible();
    await expect(authorBlock).toBeVisible();
    await expect(unassignedBlock).toBeVisible();

    // reviewer above author
    const reviewerAboveAuthor = await isBelow(reviewerBlock, authorBlock);
    expect(reviewerAboveAuthor).toBe(true);

    // author above unassigned
    const authorAboveUnassigned = await isBelow(authorBlock, unassignedBlock);
    expect(authorAboveUnassigned).toBe(true);
  });

  test('modal overlays board (z-index above, centered)', async ({ page }) => {
    await page.goto('/#/mr/group%2Fproject!510');

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Dialog should have fixed positioning with high z-index
    const dialogClass = await dialog.getAttribute('class');
    expect(dialogClass).toContain('fixed');
    expect(dialogClass).toContain('inset-0');
    expect(dialogClass).toContain('z-50');

    // Dialog should be centered — flex items-center justify-center
    expect(dialogClass).toContain('items-center');
    expect(dialogClass).toContain('justify-center');

    // The modal content should have a reasonable max-width (not full-screen)
    const contentBox = dialog.locator('.max-w-2xl');
    await expect(contentBox).toBeVisible();
  });

  test('mobile viewport (375x812) — layout does not break', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const reviewerBlock = page.locator('section[aria-label="Role: reviewer"]');
    await expect(reviewerBlock).toBeVisible({ timeout: 10_000 });

    // Expand role block if collapsed
    const expandBtn = reviewerBlock.locator('[aria-expanded]');
    const expanded = await expandBtn.getAttribute('aria-expanded');
    if (expanded === 'false') {
      await expandBtn.click();
      await page.waitForTimeout(300);
    }

    const inboxLane = reviewerBlock.locator('[aria-label="INBOX lane"]');
    const doneLane = reviewerBlock.locator('[aria-label="DONE lane"]');

    await expect(inboxLane).toBeVisible();
    await expect(doneLane).toBeVisible();

    // At 375px with grid-cols-4, columns are narrow but still visible
    const inboxBox = await inboxLane.boundingBox();
    const doneBox = await doneLane.boundingBox();

    expect(inboxBox).not.toBeNull();
    expect(doneBox).not.toBeNull();

    // Verify columns don't overlap
    if (inboxBox && doneBox) {
      const inboxRight = inboxBox.x + inboxBox.width;
      // INBOX should be to the left of DONE, or at least not overlapping
      const noOverlapWithDone = inboxRight <= doneBox.x || doneBox.y > inboxBox.y + inboxBox.height;
      expect(noOverlapWithDone).toBe(true);

      // All columns should be at least 60px wide (readable) at 375px
      expect(inboxBox.width).toBeGreaterThan(60);
    }
  });

  test('error state: layout not broken when API returns 500', async ({ page }) => {
    await page.route('**/api/board', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'NETWORK', detail: 'Internal server error' }),
      });
    });

    await page.goto('/');

    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 10_000 });

    // Error banner should be present
    await expect(header.locator('text=API недоступен')).toBeVisible({ timeout: 5_000 });

    // Header should still be properly laid out — h1 should be visible alongside error
    await expect(header.locator('h1')).toContainText('agent-inbox');

    // The page body should be visible (app wrapper with min-h-screen)
    const appWrapper = page.locator('.min-h-screen');
    await expect(appWrapper).toBeVisible();

    // The page may show loading spinner or "No board data" fallback
    // Either way, the layout should not be broken
    const fallbackText = page.locator('text=No board data available');
    const loader = page.locator('.animate-spin');
    const hasFallback = await fallbackText.isVisible().catch(() => false);
    const hasLoader = await loader.isVisible().catch(() => false);
    expect(hasFallback || hasLoader).toBe(true);
  });
});
