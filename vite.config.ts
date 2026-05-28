// @file: Vite build configuration — lib mode, node22 target, external deps
// @consumers: npm run build, npm run build:publish
// @tasks: TSK-33
import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string;
};

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
  define: {
    __GENNADY_VERSION__: JSON.stringify(pkg.version),
  },
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
      external: [...nodeBuiltins, 'tree-sitter', 'node:sqlite'],
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
