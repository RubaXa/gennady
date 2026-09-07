// @file: Unit tests for resolveOrientTarget — path-or-scope-name resolution, against an in-memory SpecSectionSource fixture (no real filesystem).
// @consumers: resolve-target

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { resolveOrientTarget } from '../core/resolve-target.ts';
import type { SpecSectionSource } from '../core/spec-section-source.ts';

const ROOT = '/proj';

function fixtureSource(files: Record<string, string>): SpecSectionSource {
  return { read: (path: string) => files[path] ?? null };
}

const PORTAL = [
  '## Scopes',
  '| Scope | Type | Spec | Description |',
  '|---|---|---|---|',
  '| [`todos-app`](./todos-app/todos-app.spec.md) | product | ✅ | Todo app |',
].join('\n');

describe('resolveOrientTarget', () => {
  it('resolves a readable path directly, without consulting the portal', () => {
    const files = { [resolve(ROOT, 'specs/todos-app/ui/ui.spec.md')]: '# Module: ui' };
    const got = resolveOrientTarget('specs/todos-app/ui/ui.spec.md', ROOT, fixtureSource(files));
    assert.equal(got.ok, true);
    if (got.ok) {
      assert.equal(got.resolvedFrom, 'path');
      assert.equal(got.content, '# Module: ui');
    }
  });

  it('resolves a scope name via the portal Scopes table', () => {
    const files = {
      [join(ROOT, 'specs', 'README.md')]: PORTAL,
      [resolve(join(ROOT, 'specs'), './todos-app/todos-app.spec.md')]: '# todos-app',
    };
    const got = resolveOrientTarget('todos-app', ROOT, fixtureSource(files));
    assert.equal(got.ok, true);
    if (got.ok) {
      assert.equal(got.resolvedFrom, 'scope');
      assert.equal(got.content, '# todos-app');
    }
  });

  it('fails with no-portal when the arg is not a path and the portal is missing', () => {
    const got = resolveOrientTarget('todos-app', ROOT, fixtureSource({}));
    assert.deepStrictEqual(got, { ok: false, reason: 'no-portal' });
  });

  it('fails with unknown-scope when the name is not in the Scopes table, listing known scopes', () => {
    const files = { [join(ROOT, 'specs', 'README.md')]: PORTAL };
    const got = resolveOrientTarget('no-such', ROOT, fixtureSource(files));
    assert.equal(got.ok, false);
    if (!got.ok && got.reason === 'unknown-scope') {
      assert.equal(got.name, 'no-such');
      assert.deepStrictEqual(
        got.scopes.map((s) => s.name),
        ['todos-app']
      );
    } else {
      assert.fail('expected unknown-scope');
    }
  });

  it('resolves a portal-listed scope whose spec file does not exist yet as pre-materialized', () => {
    // A portal row is enough orientation evidence for a greenfield scope: the neighbourhood still
    // has portal edges and consumers to show, so this is a resolution, not a failure (df3771e2).
    const files = { [join(ROOT, 'specs', 'README.md')]: PORTAL };
    const got = resolveOrientTarget('todos-app', ROOT, fixtureSource(files));
    assert.equal(got.ok, true);
    if (got.ok) {
      assert.equal(got.resolvedFrom, 'scope-placeholder');
      assert.equal(got.scope, 'todos-app');
      assert.match(got.content, /pre-materialized/);
    }
  });

  it('path wins even when a scope of the same name would also resolve via the portal', () => {
    const files = {
      [resolve(ROOT, 'todos-app')]: 'literally a file named todos-app',
      [join(ROOT, 'specs', 'README.md')]: PORTAL,
    };
    const got = resolveOrientTarget('todos-app', ROOT, fixtureSource(files));
    assert.equal(got.ok, true);
    if (got.ok) assert.equal(got.resolvedFrom, 'path');
  });
});
