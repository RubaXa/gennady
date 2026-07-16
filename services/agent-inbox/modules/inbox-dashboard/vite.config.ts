// @file: Vite config for inbox-dashboard SPA — React + Tailwind v4.
// @consumers: vite dev, vite build
// @tasks: TSK-107, TSK-122

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @purpose Start the live API server — BoardProviderReal over the real StateStore, as in production.
 * @invariant Opt-in via `EVAL_LIVE=1`; the mock path below stays default for fast/reproducible CI.
 * @invariant Requires a configured state dir with `reports/<mr>/` already materialized on disk.
 * @returns Started HttpServer, or null on bootstrap failure (surfaced via console.error).
 * @sideEffect Filesystem: reads state dir config; may spawn a real `opencode serve` child process.
 */
async function startLiveServer(): Promise<{
  start(): Promise<void>;
  stop(): Promise<void>;
} | null> {
  try {
    const { bootstrap } = await import('../../serve/bootstrap.ts');
    const result = await bootstrap({
      mocks: false,
      port: 4174,
      stateDir: process.env.GENNADY_STATE_DIR,
    });
    await result.server.start();
    console.log(
      '[inbox-serve] LIVE API server started on http://localhost:4174 (BoardProviderReal + real StateStore)'
    );
    return result.server;
  } catch (cause) {
    console.error('[inbox-serve] LIVE bootstrap failed', cause);
    return null;
  }
}

function inboxServePlugin(): Plugin {
  let server: { start(): Promise<void>; stop(): Promise<void> } | null = null;

  return {
    name: 'inbox-serve',
    async configureServer() {
      // #region START_LIVE_OR_MOCK — invariant: EVAL_LIVE opts into the real StateStore-backed
      // path (TSK-122 gap-4); unset (default) keeps the mock+dev-seed path for fast/reproducible CI
      if (process.env.EVAL_LIVE === '1') {
        server = await startLiveServer();
        return;
      }
      // #endregion END_LIVE_OR_MOCK

      const { HttpServer } = await import('../inbox-api/http-server.ts');
      const { BoardProviderMock } = await import('../inbox-api/board-provider.mock.ts');
      const { seedDevData } = await import('../inbox-serve/dev-seed.ts');

      const provider = await seedDevData(new BoardProviderMock());
      server = new HttpServer({ port: 4174, boardProvider: provider });
      await server.start();
      console.log('[inbox-serve] API server started on http://localhost:4174');
    },
    closeBundle() {
      return server?.stop();
    },
  };
}

/**
 * @purpose Vite configuration for the inbox-dashboard SPA — React + Tailwind v4, API proxy.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), inboxServePlugin()],
  root: __dirname,
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4174',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, '../../../../dist/inbox-serve'),
    emptyOutDir: true,
  },
});
