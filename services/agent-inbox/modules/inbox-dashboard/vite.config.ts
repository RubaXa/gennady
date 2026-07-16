// @file: Vite config for inbox-dashboard SPA — React + Tailwind v4.
// @consumers: vite dev, vite build
// @tasks: TSK-107, TSK-122

import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @purpose Start the live API server via vite's runtime loader, so this config never bundles the
 *   backend graph — the SPA build stays frontend-only.
 * @invariant Opt-in via `EVAL_LIVE=1`; the mock path stays default for fast/reproducible CI.
 * @param vite Vite dev server — transpiles and loads the backend `.ts` at runtime.
 * @returns Started HttpServer, or null on bootstrap failure (logged via console.error).
 */
async function startLiveServer(vite: ViteDevServer): Promise<{
  start(): Promise<void>;
  stop(): Promise<void>;
} | null> {
  try {
    const { bootstrap } = await vite.ssrLoadModule(resolve(__dirname, '../../serve/bootstrap.ts'));
    const result = await bootstrap({
      mocks: false,
      port: 4174,
      stateDir: process.env.GENNADY_STATE_DIR,
    });
    await result.server.start();
    console.log('[inbox-serve] LIVE API server started on http://localhost:4174 (real StateStore)');
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
    async configureServer(vite) {
      // Backend `.ts` is loaded via vite.ssrLoadModule (runtime), NOT static import, so esbuild never
      // bundles the server graph into this config — the SPA build stays free of node/opencode deps.
      if (process.env.EVAL_LIVE === '1') {
        server = await startLiveServer(vite);
        return;
      }

      const httpMod = await vite.ssrLoadModule(resolve(__dirname, '../inbox-api/http-server.ts'));
      const mockMod = await vite.ssrLoadModule(
        resolve(__dirname, '../inbox-api/board-provider.mock.ts')
      );
      const seedMod = await vite.ssrLoadModule(resolve(__dirname, '../inbox-serve/dev-seed.ts'));

      const provider = await seedMod.seedDevData(new mockMod.BoardProviderMock());
      const instance = new httpMod.HttpServer({ port: 4174, boardProvider: provider });
      server = instance;
      await instance.start();
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
