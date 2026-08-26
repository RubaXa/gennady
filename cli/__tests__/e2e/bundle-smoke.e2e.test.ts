// @file: Bundle smoke test — build the CLI and assert the packaged artifact actually starts (registry-independent).
// @consumers: npm run test:smoke, prepublishOnly
// @tasks: TSK-33, TSK-63

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CLI_BIN = resolve(PROJECT_ROOT, 'dist/gennady.js');
const READONLY_CONFIG_COPY = resolve(PROJECT_ROOT, 'dist/chunks/readonly.config.json');

/**
 * @purpose Guard the Vite-lib-mode publish regressions that a registry-gated e2e cannot catch offline.
 * @invariant Runs only under GENNADY_SMOKE=1 — rebuilds the bundle via `build:publish`, so it is opt-in
 *   (test:smoke / prepublishOnly), not part of unit `npm test`.
 */
const isSmokeRun = process.env.GENNADY_SMOKE === '1';

if (isSmokeRun) {
  describe('bundle smoke', () => {
    before(() => {
      // invariant: exercise the same `npm run build:publish` output that `npm pack` ships — plain
      // `build` alone would leave dist/chunks/readonly.config.json missing (that copy is a
      // build:publish-only step), so the readonly.config assertion below needs the full pipeline.
      execSync('npm run build:publish', { cwd: PROJECT_ROOT, stdio: 'pipe' });
    });

    it('keeps the CLI entry executable (Vite writes 644, closeBundle must restore 755)', () => {
      const mode = lstatSync(CLI_BIN).mode;
      assert.notStrictEqual(mode & 0o111, 0, 'dist/gennady.js must have the executable bit set');
    });

    it('ships the readonly opencode config as a physical file next to its consuming chunk', () => {
      // invariant: opencode-engine.ts resolves READONLY_CONFIG_PATH via
      // `dirname(fileURLToPath(import.meta.url))` relative to its own bundled chunk under
      // dist/chunks/ — prepare-publish-artifacts.ts must have copied the real json there, or the
      // readonly agent config silently fails to load at runtime.
      assert.ok(
        existsSync(READONLY_CONFIG_COPY),
        `expected ${READONLY_CONFIG_COPY} to exist after build:publish`
      );
    });

    it('starts without crashing, fully offline', () => {
      const stdout = execFileSync(process.execPath, [CLI_BIN, '--help'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
      });
      assert.match(stdout, /Gennady CLI/, 'CLI --help must print its banner');
    });
  });
}
