// @file: Locality enforcement — plugins resolve, declare what they ship, and import the host by specifier.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { resolvePlugins } = await import('../resolve-plugins.ts');
const { BUILTIN_PLUGINS } = await import('../../../plugins/index.ts');

/** Repository root, three levels above this test file. */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

/** The single plugin root (plugins.spec §5). */
const PLUGINS_ROOT = path.join(REPO_ROOT, 'plugins');

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

/**
 * Every module specifier: static `from '...'` and dynamic `import('...')` alike. Dropping the
 * dynamic form is how a depth-coupled `await import('../../../gate-runner.ts')` slips through.
 */
const SPECIFIER_RE = /(?:from|\bimport)\s*\(?\s*'([^']+)'/g;

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

  it('every resolved plugin is registered in the built-in index', () => {
    // A plugin on disk that the index forgot resolves fine and then never loads: its code
    // is not in the bundle; an indexed plugin missing from disk would not have resolved at all.
    assert.deepStrictEqual(
      BUILTIN_PLUGINS.map((plugin) => plugin.id).sort(),
      plugins.map((plugin) => plugin.id).sort(),
      'plugins/index.ts and the resolver disagree: a plugin on disk but not indexed never loads, ' +
        'and one indexed but not on disk breaks the build'
    );
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
