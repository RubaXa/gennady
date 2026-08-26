// @file: Playwright config for TSK-164. The spec owns a real CLI serve process and deliberately
// has no Vite webServer, so every browser request reaches the production static bundle/API.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.dashboard-v2.config.ts
// @tasks: TSK-164

import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));

/**
 * @purpose Playwright config for dashboard-v2: real CLI serve, no Vite webServer;
 *   browser hits production static bundle and API directly.
 */
export default defineConfig({
  testDir: directory,
  testMatch: 'dashboard-v2.spec.ts',
  outputDir: resolve(directory, 'test-results/dashboard-v2'),
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: { screenshot: 'off', trace: 'off' },
});
