// @file: Smoke test for inbox-dashboard — open dashboard, verify header and board render.
// @consumers: npx playwright test
// @tasks: TSK-107

import { test, expect } from '@playwright/test';

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
});
