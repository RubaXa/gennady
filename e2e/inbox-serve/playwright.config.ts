// @file: inbox-serve Playwright config — vite dev starts both API (via plugin) and dashboard.
// @consumers: npx playwright test
// @tasks: TSK-107

import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardDir = resolve(__dirname, '../../services/agent-inbox/modules/inbox-dashboard');

/** @purpose Playwright config for inbox-serve e2e: boots the dashboard vite dev server (API + SPA) and points tests at it. */
export default defineConfig({
  testDir: '.',
  outputDir: resolve(__dirname, 'test-results'),
  use: {
    baseURL: 'http://localhost:5174',
  },
  webServer: {
    command: `npx vite --config ${dashboardDir}/vite.config.ts`,
    cwd: dashboardDir,
    port: 5174,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
