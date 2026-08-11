// @file: ARIA snapshot helpers for visual testing of inbox-dashboard.
// @consumers: Playwright e2e tests for inbox-serve
// @tasks: TSK-114

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * @purpose Capture the full-page ARIA snapshot as a YAML string.
 * @param page Playwright Page instance.
 * @returns ARIA snapshot YAML string representing the accessibility tree.
 * @sideEffect Browser: ariaSnapshot() call.
 */
export async function captureAriaSnapshot(page: Page): Promise<string> {
  return page.ariaSnapshot();
}

/**
 * @purpose Assert that the page body matches the expected ARIA snapshot YAML.
 * @param page Playwright Page instance.
 * @param expected Expected ARIA snapshot as YAML string.
 * @throws {Error} When the snapshot does not match — Playwright assertion failure with diff.
 * @returns Void promise that resolves after the snapshot assertion completes.
 * @sideEffect Browser: toMatchAriaSnapshot() assertion.
 */
export async function compareAriaSnapshot(page: Page, expected: string): Promise<void> {
  await expect(page.locator('body')).toMatchAriaSnapshot(expected);
}

/**
 * @purpose Generate an ARIA snapshot for a specific locator's subtree.
 * @param locator Playwright Locator instance targeting a subtree.
 * @returns ARIA snapshot YAML string for the locator's elements.
 * @sideEffect Browser: ariaSnapshot() call.
 */
export async function generateAriaSnapshot(locator: Locator): Promise<string> {
  return locator.ariaSnapshot();
}
