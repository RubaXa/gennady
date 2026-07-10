// @file: Vite config for inbox-dashboard SPA — React + Tailwind v4.
// @consumers: vite dev, vite build
// @tasks: TSK-107

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function inboxServePlugin(): Plugin {
  let server: { start(): Promise<void>; stop(): Promise<void> } | null = null;

  return {
    name: 'inbox-serve',
    async configureServer() {
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
    outDir: resolve(__dirname, '../../../../../dist/inbox-serve'),
    emptyOutDir: true,
  },
});
