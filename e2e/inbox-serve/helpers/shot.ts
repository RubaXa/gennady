// @file: shot.ts — Playwright screenshot helper. Saves a named, full-page screenshot into the
//   gitignored test-results/screenshots/ dir so each e2e run leaves visual proof of the state it asserts.
// @consumers: e2e/inbox-serve specs
// @tasks: TSK-108, TSK-107

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';

const SHOTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'test-results',
  'screenshots'
);

/**
 * @purpose Capture a named full-page screenshot of a significant asserted UI state, so the folder
 *   reads as a coverage gallery.
 * @param page Playwright page under test.
 * @param name File stem without extension; becomes `<name>.png` in test-results/screenshots.
 * @returns Resolves once the PNG has been written.
 * @sideEffect Writes a PNG into the gitignored test-results/screenshots directory.
 */
export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), fullPage: true });
}
