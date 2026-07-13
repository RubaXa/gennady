// @file: dashboard.spec.ts — behavioral e2e tests for inbox-dashboard via Playwright.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.config.ts
// @tasks: TSK-108, TSK-107

import { test, expect, type Page } from '@playwright/test';
import { mrArtifactRefs510, mrArtifactContents510 } from './fixtures/mock-data.ts';

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

  test('click "Смотреть" navigates to #/mr/:id with split view (artifact browser + action panel)', async ({
    page,
  }) => {
    await routeArtifacts510(page);
    await page.goto('/');

    // Find MR 510 card in the INBOX lane of reviewer
    const reviewerBlock = page.locator('section[aria-label="Role: reviewer"]');
    await expect(reviewerBlock).toBeVisible({ timeout: 10_000 });

    const inboxLane = reviewerBlock.locator('[aria-label="INBOX lane"]');

    // Click the "Смотреть" button — use evaluate to bypass dnd-kit pointer interception
    const viewBtn = inboxLane.locator('button[aria-label="View MR group/project!510"]');
    await expect(viewBtn).toBeVisible();
    await viewBtn.evaluate((el: HTMLButtonElement) => el.click());

    // URL hash should have changed to #/mr/...
    await expect(page).toHaveURL(/#\/mr\//);

    // Page title area shows MR title (MrDetailPage header, no modal overlay).
    await expect(page.locator('main')).toContainText('feat: add new feature');

    // Left: ArtifactBrowser nav; right: ActionPanel with candidates ("findings" renamed per D-86).
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Кандидаты')).toBeVisible({ timeout: 5_000 });

    // "Назад к доске" replaces the old modal Close button.
    await page.locator('button[aria-label="Назад к доске"]').click();
    await expect(page).toHaveURL(/#\/?$/);
  });

  test('deep-link #/mr/:id works directly', async ({ page }) => {
    await routeArtifacts510(page);
    // Navigate directly to the MR detail page via hash
    await page.goto('/#/mr/group%2Fproject!510');

    // Split view should appear immediately — no modal, no board underneath.
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 10_000 });

    // Should show the MR title
    await expect(page.locator('main')).toContainText('feat: add new feature');

    // Should show the candidates panel (ActionPanel — replaces the old "Findings" modal section)
    await expect(page.locator('text=Кандидаты')).toBeVisible({ timeout: 5_000 });
  });

  test('reviewer Approve: gate passes with no error findings, board returns to DONE lane', async ({
    page,
  }) => {
    await routeArtifacts510(page);
    // Navigate to MR detail
    await page.goto('/#/mr/group%2Fproject!510');

    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 10_000 });

    // ActionPanel visible with the candidates list loaded (2 findings from dev-seed, both non-error).
    await expect(page.locator('text=Кандидаты (2)')).toBeVisible({ timeout: 5_000 });

    // Approve is enabled — AI-13 gate only blocks on severity=error findings, dev-seed MR 510 has none.
    const approveBtn = page.locator('button', { hasText: 'Approve' });
    await expect(approveBtn).toBeEnabled();
    await approveBtn.click();

    // Wait for the action to complete server-side.
    await page.waitForTimeout(1_500);

    // ActionPanel calls executeAction() directly (api-client), not BoardStore's executeMrAction —
    // the split view does not optimistically refresh board state (discovery, logged below). A full
    // reload re-mounts BoardStore and re-fetches, same as the operator navigating back afresh.
    await page.goto('/');
    await expect(page.locator('section[aria-label="Role: reviewer"]')).toBeVisible({
      timeout: 10_000,
    });

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
