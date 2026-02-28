import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nodeBuiltins = [
  'node:fs',
  'node:path',
  'node:os',
  'node:child_process',
  'node:url',
  'node:perf_hooks',
  'fs',
  'path',
  'os',
  'child_process',
  'url',
  'stream',
  'util',
  'events',
];

export default defineConfig({
  build: {
    lib: {
      entry: {
        cli: resolve(__dirname, 'cli/gennady.ts'),
        index: resolve(__dirname, 'index.ts'),
      },
      formats: ['es'],
      fileName: (_, name) => (name === 'cli' ? 'gennady.js' : 'index.js'),
    },
    rollupOptions: {
      external: nodeBuiltins,
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'cli'
            ? 'gennady.js'
            : chunkInfo.name === 'index'
              ? 'index.js'
              : '[name].js',
        manualChunks(id) {
          if (id.includes('shared/')) return 'shared';
          if (id.includes('services/')) return 'services';
          return undefined;
        },
      },
    },
    outDir: 'dist',
    target: 'node22',
  },
});
