// @file: dashboard.layout.spec.ts — layout checks for inbox-dashboard element positioning.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.config.ts
// @tasks: TSK-108, TSK-107

import { test, expect } from '@playwright/test';
import { isLeftOf, isBelow } from './helpers/layout.helper.ts';
import { mrArtifactRefs510, mrArtifactContents510 } from './fixtures/mock-data.ts';
import { shot } from './helpers/shot.ts';
import type { Page } from '@playwright/test';

/**
 * @purpose Route MR 510 artifact endpoints to fixtures (dev-seed.ts seeds none yet, TSK-107 P2);
 *   /board, /report, /action still hit the real server.
 * @param page Playwright page to install the route on.
 */
async function routeArtifacts510(page: Page): Promise<void> {
  const artifactContents = mrArtifactContents510();
  await page.route('**/api/mr/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/artifacts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, artifacts: mrArtifactRefs510() }),
      });
      return;
    }
    if (url.pathname.endsWith('/artifact')) {
      const artifactPath = url.searchParams.get('path') ?? '';
      const content = artifactContents[artifactPath];
      if (!content) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'NOT_FOUND', detail: artifactPath }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, ...content }),
      });
      return;
    }
    await route.continue();
  });
}

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

  test('split view: ArtifactBrowser (left) is left of ActionPanel (right), no overlay', async ({
    page,
  }) => {
    await routeArtifacts510(page);
    await page.goto('/#/mr/group%2Fproject!510');

    // No modal overlay — the split view replaces the board's <main>, not a fixed/z-50 dialog on top of it.
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 });

    const artifactBrowser = page.locator('nav[aria-label="Артефакты"]');
    await expect(artifactBrowser).toBeVisible({ timeout: 10_000 });

    // ActionPanel is identified by its candidates heading region.
    const actionPanel = page.locator('text=Кандидаты').first();
    await expect(actionPanel).toBeVisible({ timeout: 5_000 });

    // ArtifactBrowser (left) is left of ActionPanel (right), per TSK-107 P1 layout decision.
    const browserLeftOfPanel = await isLeftOf(artifactBrowser, actionPanel);
    expect(browserLeftOfPanel).toBe(true);

    await shot(page, '06-split-view-browser-left-panel-right');
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

    await shot(page, '07-mobile-viewport-375');
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
