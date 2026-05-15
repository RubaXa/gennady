import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nodeBuiltins = (() => {
  const entries = new Set<string>();

  for (const name of builtinModules) {
    entries.add(name);
    if (name.startsWith('node:')) {
      entries.add(name.slice('node:'.length));
    } else {
      entries.add(`node:${name}`);
    }
  }

  const subpathBuiltins = [
    'node:fs/promises',
    'fs/promises',
    'node:timers/promises',
    'timers/promises',
    'node:stream/promises',
    'stream/promises',
  ] as const;

  for (const name of subpathBuiltins) {
    entries.add(name);
  }

  return [...entries];
})();

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
      external: [...nodeBuiltins, 'tree-sitter'],
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
