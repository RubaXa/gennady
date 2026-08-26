// @file: playwright config for the ONE real end-to-end reviewer-flow proof (TSK-131). Unlike the
//   sibling playwright.config.ts, this config spawns NO webServer: the spec owns its entire
//   lifecycle (temp state dir → seed MR → in-process real server on :4174 → real review pipeline →
//   gracefulShutdown) inside beforeAll/afterAll. This config only names the spec and its output dir.
// @consumers: npm run test:e2e:review-flow
// @tasks: TSK-131

import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @purpose Single-spec Playwright config: the real review-flow proof drives localhost:4174,
 *   where the spec boots its own in-process server without an external dev server.
 */
export default defineConfig({
  testDir: __dirname,
  testMatch: 'review-flow/*.spec.ts',
  outputDir: resolve(__dirname, 'test-results/review-flow'),
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 780_000,
  use: {
    baseURL: 'http://localhost:4174',
    screenshot: 'off',
    trace: 'off',
  },
});
