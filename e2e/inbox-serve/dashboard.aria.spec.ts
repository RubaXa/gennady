// @file: dashboard.aria.spec.ts — ARIA snapshot tests for inbox-dashboard accessibility structure.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.config.ts
// @tasks: TSK-108

import { test, expect } from '@playwright/test';
import { captureAriaSnapshot } from './helpers/aria-snapshot.helper.ts';

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
    // Navigate directly to MR detail
    await page.goto('/#/mr/group%2Fproject!510');

    // Wait for modal to render
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Wait for report content to load (findings section)
    await expect(dialog.locator('text=Findings')).toBeVisible({ timeout: 5_000 });

    const snapshot = await captureAriaSnapshot(page);

    // Should contain dialog role
    expect(snapshot).toContain('dialog');

    // Should contain MR title
    expect(snapshot).toContain('feat: add new feature');

    // Should contain findings
    expect(snapshot).toContain('Findings');

    // Should contain operator question
    expect(snapshot).toContain('Operator');

    // Should contain verdict
    expect(snapshot).toContain('Verdict');
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
