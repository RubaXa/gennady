// @file: ai/inspector — Playwright config: serve web/ via serve.ts, run e2e from ./e2e.

import { defineConfig } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  outputDir: join(root, 'test-results'),
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npx tsx serve.ts',
    cwd: root,
    port: 4173,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
