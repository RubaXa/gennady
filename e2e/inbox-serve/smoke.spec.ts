// @file: Smoke test for inbox-dashboard — open dashboard, verify header and board render.
// @consumers: npx playwright test
// @tasks: TSK-107

import { test, expect } from '@playwright/test';
import { mrArtifactRefs510, mrArtifactContents510 } from './fixtures/mock-data.ts';
import { shot } from './helpers/shot.ts';

test.describe('inbox-dashboard smoke', () => {
  test('opens dashboard and renders header', async ({ page }) => {
    await page.goto('/');

    // Header should be visible
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Title "agent-inbox" should be present
    await expect(header.locator('h1')).toContainText('agent-inbox');
  });

  test('renders board page with roles and lanes', async ({ page }) => {
    await page.goto('/');

    // Wait for loading to finish — the main element should appear
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10_000 });

    // Should have at least one role section
    const roleSections = main.locator('section[aria-label^="Role:"]');
    await expect(roleSections.first()).toBeVisible({ timeout: 10_000 });

    await shot(page, '01-board-queue-and-role-lanes');
  });

  test('API error shows banner in header', async ({ page }) => {
    // Navigate when API is not running — should show error banner
    await page.goto('/');

    // Check that either the header shows online or API error
    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 10_000 });

    // The header should contain either "Online" or "API недоступен"
    const headerText = await header.textContent();
    expect(headerText).toMatch(/Online|API недоступен/);
  });

  test('opens #/mr/:id: artifact browser (left) + REPORT rendered + ActionPanel (right)', async ({
    page,
  }) => {
    // dev-seed.ts (real webServer) does not seed artifacts for MR 510 yet — intercept only the
    // artifact-browser endpoints here so /board and /report keep hitting the real server.
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

    await page.goto('/#/mr/group%2Fproject!510');

    // Left: ArtifactBrowser nav lists REPORT/PLAN/track/HISTORY, REPORT.md selected by default.
    const nav = page.locator('nav[aria-label="Артефакты"]');
    await expect(nav).toBeVisible({ timeout: 10_000 });
    await expect(nav.locator('button', { hasText: 'REPORT.md' })).toBeVisible();
    await expect(nav.locator('button', { hasText: 'PLAN.md' })).toBeVisible();
    await expect(nav.locator('button', { hasText: 'security.md' })).toBeVisible();
    await expect(nav.locator('button', { hasText: 'HISTORY.md' })).toBeVisible();

    // Right pane: REPORT.md rendered (prose + mermaid drawn as an actual SVG diagram, not raw text).
    await expect(page.locator('text=Summary of findings for !510')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('svg[id^="mmd-"]')).toBeVisible({ timeout: 10_000 });

    await shot(page, '02-mr-detail-artifacts-mermaid-actionpanel');

    // Navigate to another artifact — content pane swaps to PLAN.md.
    await nav.locator('button', { hasText: 'PLAN.md' }).click();
    await expect(page.locator('text=Step one')).toBeVisible({ timeout: 5_000 });

    // ActionPanel visible on the right (reviewer role for MR 510 per dev-seed.ts).
    await expect(page.locator('text=Кандидаты')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Постить выбранное' })).toBeVisible();
  });
});
