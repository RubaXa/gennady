// @file: Plugin publish assets — which plugin files are staged into the package's ai/ tree.
// @consumers: prepare-publish-artifacts, cleanup-publish-artifacts, publish-contents test
// @tasks: TSK-96

import fs from 'node:fs';
import path from 'node:path';
import { resolvePlugins } from './resolve-plugins.ts';

/** One file to stage, as source plus its path inside the package. */
export type StagedAsset = {
  /** @purpose Absolute path inside the plugin directory. */
  readonly source: string;
  /** @purpose Package-relative destination, e.g. `ai/directives/infra/golang-setup.xml`. */
  readonly target: string;
};

/**
 * @purpose Every file under a directory, recursively.
 * @param dir Absolute directory.
 * @returns Absolute file paths.
 */
function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else {
      found.push(full);
    }
  }
  return found;
}

/**
 * @purpose List the plugin files the published package must carry, derived from the manifests.
 * @invariant Derived from resolved manifests, never a `plugins/**` glob: a .gitignore inside a
 *   plugin directory subtracts silently from `npm pack` (plugins.spec D-SP-008).
 * @invariant A plugin's directives/skills subtree is mirrored, so `gennady sync infra` keeps
 *   finding a directive the golang plugin owns.
 * @param repoRoot Repository root holding `plugins/`.
 * @returns Every staged asset, sorted by target.
 */
export function pluginPublishAssets(repoRoot: string): readonly StagedAsset[] {
  const { plugins, errors } = resolvePlugins([path.join(repoRoot, 'plugins')], 'stack');
  if (errors.length > 0) {
    throw new Error(
      `[pluginPublishAssets] unresolvable plugins: ${errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`
    );
  }

  const assets: StagedAsset[] = [];
  for (const plugin of plugins) {
    for (const [dir, prefix] of [
      [plugin.directivesDir, 'ai/directives'],
      [plugin.skillsDir, 'ai/skills'],
    ] as const) {
      if (dir === null) {
        continue;
      }
      // The whole declared subtree, not just the files the resolver indexes: a skill may ship
      // helper files next to its SKILL.md, and shipping half of one is worse than shipping none.
      for (const file of walk(dir)) {
        assets.push({ source: file, target: path.join(prefix, path.relative(dir, file)) });
      }
    }
  }

  return assets.sort((a, b) => a.target.localeCompare(b.target));
}
