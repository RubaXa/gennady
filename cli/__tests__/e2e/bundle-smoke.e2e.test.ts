// @file: Bundle smoke test — build the CLI and assert the packaged artifact actually starts (registry-independent).
// @consumers: npm run test:smoke, prepublishOnly
// @tasks: TSK-33, TSK-63

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CLI_BIN = resolve(PROJECT_ROOT, 'dist/gennady.js');

/**
 * @purpose Guard the two Vite-lib-mode publish regressions that a registry-gated e2e cannot catch offline.
 * @invariant Runs only under GENNADY_SMOKE=1 — rebuilds the bundle, so it is opt-in (test:smoke / prepublishOnly), not part of unit `npm test`.
 */
const isSmokeRun = process.env.GENNADY_SMOKE === '1';

if (isSmokeRun) {
  describe('bundle smoke', () => {
    before(() => {
      // invariant: exercise the same `npm run build` output that `npm pack` ships.
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
    });

    it('keeps the CLI entry executable (Vite writes 644, closeBundle must restore 755)', () => {
      const mode = lstatSync(CLI_BIN).mode;
      assert.notStrictEqual(mode & 0o111, 0, 'dist/gennady.js must have the executable bit set');
    });

    it('starts without crashing on a bundled data: asset URL', () => {
      // invariant: readonly.config.json is inlined as a data: URL in the bundle; module load must
      // resolve it lazily rather than call fileURLToPath(data:) and throw ERR_INVALID_URL_SCHEME.
      const stdout = execFileSync(process.execPath, [CLI_BIN, '--help'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
      });
      assert.match(stdout, /Gennady CLI/, 'CLI --help must print its banner');
    });
  });
}
