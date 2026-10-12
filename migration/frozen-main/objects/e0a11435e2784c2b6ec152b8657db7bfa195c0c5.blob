// @file: Plugin publish assets — which plugin files the published package must carry, in place (D-SP-008).
// @consumers: sync.cmd, sync-skills.cmd, publish-contents test
// @tasks: TSK-96

import fs from 'node:fs';
import path from 'node:path';
import { resolvePlugins } from './resolve-plugins.ts';

/** One file a plugin contributes to the published package. */
export type StagedAsset = {
  /** @purpose Absolute path inside the plugin directory. */
  readonly source: string;
  /** @purpose Package-relative path, identical to the source's place in the repository. */
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
 * @purpose Source directories plugins contribute to a sync surface.
 * @invariant Same in both installs: the package ships the plugin directories, so a checkout and
 *   an installed copy resolve identically.
 * @param pluginsRoot The package's `plugins/` directory, or null when absent.
 * @param surface Which surface to collect.
 * @returns Absolute directories, in resolver order.
 */
export function pluginSurfaceDirs(
  pluginsRoot: string | null,
  surface: 'directives' | 'skills'
): string[] {
  if (pluginsRoot === null) {
    return [];
  }
  const { plugins } = resolvePlugins([pluginsRoot], 'stack');
  return plugins
    .map((plugin) => (surface === 'directives' ? plugin.directivesDir : plugin.skillsDir))
    .filter((dir): dir is string => dir !== null);
}

/**
 * @purpose List the plugin files the published package must carry, derived from the manifests.
 * @invariant Derived from resolved manifests, never a `plugins/**` glob: a .gitignore inside a
 *   plugin directory subtracts silently from `npm pack` (plugins.spec D-SP-008).
 * @invariant Paths are where the repository keeps them: the package ships the plugin
 *   directories, so nothing is copied into the tracked tree.
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
    for (const dir of [plugin.directivesDir, plugin.skillsDir]) {
      if (dir === null) {
        continue;
      }
      // The whole declared subtree: a skill may ship helpers beside its SKILL.md, and shipping
      // half of one is worse than shipping none.
      for (const file of walk(dir)) {
        assets.push({ source: file, target: path.relative(repoRoot, file) });
      }
    }
  }

  return assets.sort((a, b) => a.target.localeCompare(b.target));
}
