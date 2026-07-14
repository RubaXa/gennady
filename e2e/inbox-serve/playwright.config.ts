// @file: inbox-serve Playwright config — vite dev starts both API (via plugin) and dashboard.
// @consumers: npx playwright test
// @tasks: TSK-107, TSK-122

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
    // --configLoader native (TSK-122 P3): the default 'bundle' loader pre-bundles vite.config.ts
    // with esbuild, which eagerly follows the `startLiveServer` dynamic import into
    // serve/bootstrap.ts and from there into cli/cmd/vcs-*/vcs-*.cmd.ts — CLI entrypoints carrying
    // a `#!/usr/bin/env node` shebang, which esbuild's bundler cannot parse as a dependency
    // ("Syntax error \"!\""), breaking config load for the ENTIRE e2e suite (fixture path included,
    // not just EVAL_LIVE). 'native' loads the config via Node's own runtime instead of pre-bundling.
    command: `npx vite --config ${dashboardDir}/vite.config.ts --configLoader native`,
    cwd: dashboardDir,
    port: 5174,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
