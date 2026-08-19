// @file: Locality enforcement — plugins resolve, declare what they ship, and import the host by specifier.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { resolvePlugins } = await import('../resolve-plugins.ts');

/** Repository root, three levels above this test file. */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

/** The single plugin root (plugins.spec §5). */
const PLUGINS_ROOT = path.join(REPO_ROOT, 'services/stack/plugins');

/**
 * Built-in ids that must always resolve. Without this floor a resolver that finds
 * nothing turns every derived check below into a vacuous pass (plugins.spec §6.2).
 */
const FLOOR = ['golang', 'node'] as const;

/** @purpose Every `.ts` file under a directory, recursively. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

/** Every `from '<specifier>'` in a module, import and re-export alike. */
const SPECIFIER_RE = /from\s+'([^']+)'/g;

describe('plugin locality', () => {
  const { plugins, errors } = resolvePlugins([PLUGINS_ROOT], 'stack');

  it('resolves the built-in floor with no errors', () => {
    assert.deepStrictEqual(
      errors,
      [],
      'every declared surface must exist (plugins.spec §6, rule 3)'
    );
    for (const id of FLOOR) {
      assert.ok(
        plugins.some((plugin) => plugin.id === id),
        `built-in plugin "${id}" must resolve — see plugins.spec §6.2`
      );
    }
  });

  it('no plugin reaches outside its own directory for host code', () => {
    assert.ok(plugins.length > 0, 'nothing to check means the check is not running');
    const escapes: string[] = [];
    for (const plugin of plugins) {
      for (const file of sourceFiles(plugin.dir)) {
        const source = fs.readFileSync(file, 'utf-8');
        for (const [, specifier] of source.matchAll(SPECIFIER_RE)) {
          if (specifier === undefined || !specifier.startsWith('.')) {
            continue;
          }
          const target = path.resolve(path.dirname(file), specifier);
          if (!target.startsWith(plugin.dir + path.sep)) {
            escapes.push(`${path.relative(REPO_ROOT, file)} → ${specifier}`);
          }
        }
      }
    }
    assert.deepStrictEqual(
      escapes,
      [],
      `relative imports must not leave the plugin directory; use 'gennady/stack' (plugins.spec D-SP-007)`
    );
  });
});
