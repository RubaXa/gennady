// @file: Vite build configuration — lib mode, node22 target, external deps
// @consumers: npm run build, npm run build:publish
// @tasks: TSK-33
import { defineConfig, type Plugin } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { chmodSync, readFileSync } from 'node:fs';

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

/**
 * @purpose Restore the executable bit on the CLI entry after each build — Vite writes 644, which breaks `npm link` / direct execution.
 */
function executableBin(): Plugin {
  return {
    name: 'gennady:executable-bin',
    closeBundle() {
      chmodSync(resolve(__dirname, 'dist/gennady.js'), 0o755);
    },
  };
}

/**
 * @purpose Vite build configuration for the gennady CLI — lib mode, node22 target, chunked output.
 */
export default defineConfig({
  plugins: [executableBin()],
  define: {
    __GENNADY_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // Built-in plugins import the public `gennady/stack` specifier as a self-reference.
      // package.json#exports now points that specifier at the built `dist/stack.js` (for external
      // consumers), so resolve it back to source here for the bundle, otherwise Rollup cannot find
      // the not-yet-built output during the build.
      'gennady/stack': resolve(__dirname, 'services/stack/plugin-api.ts'),
    },
  },
  build: {
    lib: {
      entry: {
        cli: resolve(__dirname, 'cli/gennady.ts'),
        index: resolve(__dirname, 'index.ts'),
        // Public library subpath `gennady/stack` (see package.json#exports): third-party stack
        // plugins import real values from it (execFileTrimSafe, parseDuration, …), so it needs a
        // built runtime bundle in the tarball, not just the source module.
        stack: resolve(__dirname, 'services/stack/plugin-api.ts'),
      },
      formats: ['es'],
      // Entry filenames are decided by rollupOptions.output.entryFileNames below (the single
      // source of truth for cli → gennady.js, index → index.js, stack → stack.js).
    },
    rollupOptions: {
      external: [...nodeBuiltins, 'node:sqlite', 'tree-sitter', 'tree-sitter-typescript'],
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
