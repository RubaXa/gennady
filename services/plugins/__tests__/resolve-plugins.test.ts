// @file: Unit tests for the plugin resolver — manifest schema, surface resolution, kind filter.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { resolvePlugins } = await import('../resolve-plugins.ts');

/** @purpose Materialize a plugins root from a path→content map, run fn, clean up. */
function withRoot<T>(files: Record<string, string>, fn: (root: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-root-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** @purpose The minimal legal plugin: identity only, code in the conventional entry. */
function minimal(id: string, kind = 'stack'): Record<string, string> {
  return {
    [`${id}/plugin.json`]: JSON.stringify({ id, kind }),
    [`${id}/plugin.ts`]: 'export const x = 1;\n',
  };
}

describe('resolvePlugins — discovery', () => {
  it('returns nothing and no errors when the root does not exist', () => {
    const result = resolvePlugins(['/nonexistent/plugins/root']);
    assert.deepStrictEqual(result.plugins, []);
    assert.deepStrictEqual(result.errors, []);
  });

  it('resolves a minimal plugin with conventional defaults', () => {
    withRoot(minimal('rust'), (root) => {
      const { plugins, errors } = resolvePlugins([root]);
      assert.deepStrictEqual(errors, []);
      assert.strictEqual(plugins.length, 1);
      const plugin = plugins[0]!;
      assert.strictEqual(plugin.id, 'rust');
      assert.strictEqual(plugin.kind, 'stack');
      assert.strictEqual(plugin.entry, path.join(root, 'rust/plugin.ts'));
      assert.strictEqual(plugin.specRoot, null, 'no specs directory — absent, not an error');
      assert.deepStrictEqual(plugin.specs, []);
      assert.deepStrictEqual(plugin.directives, []);
      assert.deepStrictEqual(plugin.skills, []);
      assert.strictEqual(plugin.e2eFixtures, null);
    });
  });

  it('orders lexicographically by id, not by readdir order', () => {
    withRoot({ ...minimal('zig'), ...minimal('awk'), ...minimal('rust') }, (root) => {
      const { plugins } = resolvePlugins([root]);
      assert.deepStrictEqual(
        plugins.map((p) => p.id),
        ['awk', 'rust', 'zig']
      );
    });
  });

  it('filters by kind without reporting other kinds as errors', () => {
    withRoot({ ...minimal('rust'), ...minimal('git', 'vcs') }, (root) => {
      const stacks = resolvePlugins([root], 'stack');
      assert.deepStrictEqual(stacks.errors, []);
      assert.deepStrictEqual(
        stacks.plugins.map((p) => p.id),
        ['rust']
      );
      const all = resolvePlugins([root]);
      assert.strictEqual(all.plugins.length, 2);
    });
  });

  it('reports a duplicate id across roots instead of silently preferring one', () => {
    withRoot(minimal('rust'), (a) =>
      withRoot(minimal('rust'), (b) => {
        const { plugins, errors } = resolvePlugins([a, b]);
        assert.strictEqual(plugins.length, 1);
        assert.match(errors[0]!.message, /duplicate plugin id/);
      })
    );
  });
});

describe('resolvePlugins — manifest schema', () => {
  it('rejects a directory without a manifest', () => {
    withRoot({ 'rust/plugin.ts': 'export const x = 1;\n' }, (root) => {
      const { plugins, errors } = resolvePlugins([root]);
      assert.deepStrictEqual(plugins, []);
      assert.strictEqual(errors[0]!.path, 'plugins.rust');
      assert.match(errors[0]!.message, /missing plugin\.json/);
    });
  });

  it('rejects an unknown key with a did-you-mean hint', () => {
    withRoot(
      {
        'rust/plugin.json': JSON.stringify({ id: 'rust', kind: 'stack', skils: 'skills' }),
        'rust/plugin.ts': 'export const x = 1;\n',
      },
      (root) => {
        const { plugins, errors } = resolvePlugins([root]);
        assert.deepStrictEqual(plugins, []);
        assert.strictEqual(errors[0]!.path, 'plugins.rust.skils');
        assert.match(errors[0]!.message, /did you mean "skills"/);
      }
    );
  });

  it('rejects an id that disagrees with the directory name', () => {
    withRoot(
      {
        'rust/plugin.json': JSON.stringify({ id: 'rustlang', kind: 'stack' }),
        'rust/plugin.ts': 'export const x = 1;\n',
      },
      (root) => {
        const { errors } = resolvePlugins([root]);
        assert.strictEqual(errors[0]!.path, 'plugins.rust.id');
        assert.match(errors[0]!.message, /must equal the directory name "rust"/);
      }
    );
  });

  it('requires kind', () => {
    withRoot(
      {
        'rust/plugin.json': JSON.stringify({ id: 'rust' }),
        'rust/plugin.ts': 'export const x = 1;\n',
      },
      (root) => {
        const { errors } = resolvePlugins([root]);
        assert.strictEqual(errors[0]!.path, 'plugins.rust.kind');
      }
    );
  });

  it('reports unparseable JSON as one error, not a crash', () => {
    withRoot({ 'rust/plugin.json': '{ nope' }, (root) => {
      const { errors } = resolvePlugins([root]);
      assert.match(errors[0]!.message, /cannot parse JSON/);
    });
  });
});

describe('resolvePlugins — surfaces', () => {
  it('collects declared surfaces recursively and sorted', () => {
    withRoot(
      {
        'rust/plugin.json': JSON.stringify({
          id: 'rust',
          kind: 'stack',
          specs: 'specs',
          directives: 'directives',
          skills: 'skills',
          e2eFixtures: 'e2e/fixtures',
        }),
        'rust/plugin.ts': 'export const x = 1;\n',
        'rust/specs/rust.spec.md': '# root\n',
        'rust/specs/codegen/codegen.spec.md': '# feature\n',
        'rust/specs/notes.md': 'not a spec\n',
        'rust/directives/setup.xml': '<x/>\n',
        'rust/directives/nested/more.xml': '<x/>\n',
        'rust/directives/README.md': 'not xml\n',
        'rust/skills/sdd-rust/SKILL.md': '# skill\n',
        'rust/skills/sdd-rust/extra.md': 'not a skill\n',
        'rust/e2e/fixtures/case/expect.yaml': 'notes: x\n',
      },
      (root) => {
        const { plugins, errors } = resolvePlugins([root]);
        assert.deepStrictEqual(errors, []);
        const plugin = plugins[0]!;
        const rel = (p: string) => path.relative(path.join(root, 'rust'), p);
        assert.strictEqual(rel(plugin.specRoot!), path.join('specs', 'rust.spec.md'));
        assert.deepStrictEqual(plugin.specs.map(rel), [
          path.join('specs', 'codegen', 'codegen.spec.md'),
          path.join('specs', 'rust.spec.md'),
        ]);
        assert.deepStrictEqual(plugin.directives.map(rel), [
          path.join('directives', 'nested', 'more.xml'),
          path.join('directives', 'setup.xml'),
        ]);
        assert.deepStrictEqual(plugin.skills.map(rel), [
          path.join('skills', 'sdd-rust', 'SKILL.md'),
        ]);
        assert.strictEqual(rel(plugin.e2eFixtures!), path.join('e2e', 'fixtures'));
      }
    );
  });

  it('picks up conventional surfaces that exist without being declared', () => {
    withRoot(
      {
        ...minimal('rust'),
        'rust/specs/rust.spec.md': '# root\n',
        'rust/skills/sdd-rust/SKILL.md': '# skill\n',
      },
      (root) => {
        const { plugins, errors } = resolvePlugins([root]);
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(plugins[0]!.specs.length, 1);
        assert.strictEqual(plugins[0]!.skills.length, 1);
      }
    );
  });

  it('a declared-but-missing path is fatal — that is a typo, not an absence', () => {
    withRoot(
      {
        'rust/plugin.json': JSON.stringify({ id: 'rust', kind: 'stack', skills: 'skils' }),
        'rust/plugin.ts': 'export const x = 1;\n',
      },
      (root) => {
        const { plugins, errors } = resolvePlugins([root]);
        assert.deepStrictEqual(plugins, []);
        assert.strictEqual(errors[0]!.path, 'plugins.rust.skills');
        assert.match(errors[0]!.message, /declared path does not exist: skils/);
      }
    );
  });

  it('a specs directory without its root spec is fatal', () => {
    withRoot({ ...minimal('rust'), 'rust/specs/codegen.spec.md': '# feature\n' }, (root) => {
      const { plugins, errors } = resolvePlugins([root]);
      assert.deepStrictEqual(plugins, []);
      assert.strictEqual(errors[0]!.path, 'plugins.rust.specs');
      assert.match(errors[0]!.message, /missing root spec rust\.spec\.md/);
    });
  });

  it('missing plugin code is fatal even though entry is conventional', () => {
    withRoot({ 'rust/plugin.json': JSON.stringify({ id: 'rust', kind: 'stack' }) }, (root) => {
      const { plugins, errors } = resolvePlugins([root]);
      assert.deepStrictEqual(plugins, []);
      assert.strictEqual(errors[0]!.path, 'plugins.rust.entry');
      assert.match(errors[0]!.message, /missing plugin code/);
    });
  });

  it('does not import the entry — a throwing module still resolves', () => {
    withRoot(
      {
        'rust/plugin.json': JSON.stringify({ id: 'rust', kind: 'stack' }),
        'rust/plugin.ts': 'throw new Error("plugin code must not be imported by the resolver");\n',
      },
      (root) => {
        const { plugins, errors } = resolvePlugins([root]);
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(plugins.length, 1);
      }
    );
  });
});
