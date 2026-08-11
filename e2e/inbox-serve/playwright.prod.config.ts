// @file: Playwright config for production-build inbox-dashboard e2e tests.
// @consumers: npm run test:e2e:prod
// @tasks: TSK-182

import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../../dist/inbox-serve');
const viteConfigPath = resolve(
  __dirname,
  '../../services/agent-inbox/modules/inbox-dashboard/vite.config.ts'
);

/**
 * @purpose Playwright config for production-built inbox-dashboard: serves the built SPA with
 *   vite preview, all API calls mocked inside specs via page.route().
 * @invariant Run `npm run inbox-serve:build` before this config to populate dist/inbox-serve.
 */
export default defineConfig({
  testDir: __dirname,
  testMatch: ['agent-inbox.closed-loop.spec.ts', 'agent-inbox.handoff.spec.ts'],
  outputDir: resolve(__dirname, 'test-results/prod'),
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5175',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite preview --config ${viteConfigPath} --port 5175 --outDir ${distDir} --configLoader native`,
    port: 5175,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
