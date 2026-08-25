// @file: Publish contents test — every plugin asset the manifests declare reaches the tarball.
// @consumers: npm run test:smoke, prepublishOnly, CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { pluginPublishAssets } = await import('../../../services/plugins/plugin-assets.ts');

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const RUN = process.env.GENNADY_SMOKE === '1';

/** @purpose Paths inside the tarball npm would publish right now. */
function packedPaths(): string[] {
  const json = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const [entry] = JSON.parse(json) as [{ files: { path: string }[] }];
  return entry.files.map((file) => file.path);
}

describe('publish contents — plugin assets', { skip: !RUN }, () => {
  it('ships every asset the plugin manifests declare', () => {
    const declared = pluginPublishAssets(REPO_ROOT);
    // A silent empty list would make everything below vacuously true (plugins.spec §6.2).
    assert.ok(declared.length > 0, 'no plugin assets derived — the manifests declare nothing');
    assert.ok(
      declared.some((asset) => asset.target.includes('/directives/')),
      'expected at least one plugin-owned directive'
    );
    assert.ok(
      declared.some((asset) => asset.target.includes('/skills/')),
      'expected at least one plugin-owned skill'
    );

    const packed = new Set(packedPaths());
    const missing = declared.map((asset) => asset.target).filter((target) => !packed.has(target));
    assert.deepStrictEqual(
      missing,
      [],
      'declared plugin assets absent from the tarball: package.json#files no longer carries the ' +
        'plugin directories, so `gennady sync` would lose them (plugins.spec D-SP-008)'
    );
  });
});
