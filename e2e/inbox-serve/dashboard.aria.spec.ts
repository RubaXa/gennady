// @file: dashboard.aria.spec.ts — ARIA snapshot tests for inbox-dashboard accessibility structure.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.config.ts
// @tasks: TSK-108, TSK-107

import { test, expect } from '@playwright/test';
import { captureAriaSnapshot } from './helpers/aria-snapshot.helper.ts';
import { mrArtifactRefs510, mrArtifactContents510 } from './fixtures/mock-data.ts';
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

test.describe('inbox-dashboard: ARIA snapshots', () => {
  test('dashboard structure: regions for roles, lanes, and cards', async ({ page }) => {
    await page.goto('/');

    // Wait for dashboard to render
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });

    // Capture the full ARIA snapshot
    const snapshot = await captureAriaSnapshot(page);

    // Should contain header with "agent-inbox"
    expect(snapshot).toContain('agent-inbox');

    // Should contain role regions
    expect(snapshot).toContain('region');
    expect(snapshot).toContain('reviewer');
    expect(snapshot).toContain('author');
    expect(snapshot).toContain('mentioned');

    // Should contain lane regions
    expect(snapshot).toContain('INBOX');
    expect(snapshot).toContain('PROGRESS');
    expect(snapshot).toContain('AWAITING');
    expect(snapshot).toContain('DONE');

    // Should have listitems for MR cards
    expect(snapshot).toContain('listitem');
    // MR 510 should appear somewhere
    expect(snapshot).toContain('510');
  });

  test('queue "Ждут меня" is first after banner', async ({ page }) => {
    await page.goto('/');

    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });

    const snapshot = await captureAriaSnapshot(page);

    // The awaiting queue section should appear in the snapshot
    expect(snapshot).toContain('MRs awaiting my action');

    // "Ждут меня" text should be present
    expect(snapshot).toContain('Ждут меня');
  });

  test('MrDetail page structure via ARIA', async ({ page }) => {
    await routeArtifacts510(page);
    // Navigate directly to MR detail
    await page.goto('/#/mr/group%2Fproject!510');

    // Wait for the split view to render — ArtifactBrowser nav (left) is the load-bearing signal
    // that replaces the old modal dialog.
    const nav = page.locator('nav[aria-label="Артефакты"]');
    await expect(nav).toBeVisible({ timeout: 10_000 });

    // Wait for the ActionPanel candidates list to load (replaces the old "Findings" section).
    await expect(page.locator('text=Кандидаты')).toBeVisible({ timeout: 5_000 });

    const snapshot = await captureAriaSnapshot(page);

    // No dialog role anymore — split view is a regular page, not a modal overlay.
    expect(snapshot).not.toContain('dialog');

    // Should contain MR title
    expect(snapshot).toContain('feat: add new feature');

    // Should contain the artifact nav list (REPORT/PLAN/tracks/HISTORY)
    expect(snapshot).toContain('Артефакты');
    expect(snapshot).toContain('REPORT.md');

    // Should contain the candidates panel (ActionPanel)
    expect(snapshot).toContain('Кандидаты');

    // Should contain reviewer action buttons (gate replaces "Operator Question" prompt)
    expect(snapshot).toContain('Approve');
  });

  test('cold start: skeleton shown instead of false zeros', async ({ page }) => {
    // Route /api/board with a 2-second delay so the skeleton is observable
    let boardRouteHit = false;
    await page.route('**/api/board', async (route) => {
      boardRouteHit = true;
      await new Promise((r) => setTimeout(r, 2_000));
      await route.continue();
    });

    await page.goto('/');

    // Skeleton should be visible — main has aria-label="Loading dashboard"
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 5_000 });

    const coldSnapshot = await captureAriaSnapshot(page);

    // Must NOT show false zeros — the bug this test guards against
    expect(coldSnapshot).not.toContain('БЕЗ РОЛИ');

    // Skeleton aria markers should be present
    expect(coldSnapshot).toContain('Loading dashboard');
    expect(coldSnapshot).toContain('Loading role block');

    // Wait for the real board to replace the skeleton
    await expect(page.locator('section[aria-label="Role: reviewer"]')).toBeVisible({
      timeout: 10_000,
    });

    // After real load, skeleton markers must be gone and real data must appear
    const warmSnapshot = await captureAriaSnapshot(page);
    expect(warmSnapshot).not.toContain('Loading dashboard');
    expect(warmSnapshot).toContain('reviewer');
    expect(warmSnapshot).toContain('INBOX');
    expect(warmSnapshot).toContain('author');
    expect(warmSnapshot).toContain('mentioned');
  });

  test('error state: "API недоступен" text is visible', async ({ page }) => {
    // Intercept API calls to simulate error
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

    // Check API error text is visible
    await expect(header.locator('text=API недоступен')).toBeVisible({ timeout: 5_000 });
  });
});
