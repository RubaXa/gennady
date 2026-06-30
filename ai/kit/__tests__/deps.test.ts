// @file: Verifies every directive's `BeliefState deps` are provided by the router core.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_ROOT } from '../render.ts';

const SDD_V2 = join(OUT_ROOT, 'sdd-v2');

/** Axiom IDs the router provides through its rendered BeliefState — the inherited core. */
function routerCore(): Set<string> {
  const text = readFileSync(join(SDD_V2, 'router.directive.xml'), 'utf8');
  const ids = new Set<string>();
  for (const m of text.matchAll(/<Axiom id="(AX_[A-Z0-9_]+)"/g)) ids.add(m[1] as string);
  return ids;
}

/** The axiom IDs a directive declares it inherits, via `<BeliefState deps="A, B">` (empty when none). */
function declaredDeps(text: string): string[] {
  const m = text.match(/<BeliefState\s+deps="([^"]*)"/);
  if (!m) return [];
  return (m[1] as string)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

describe('directive deps are satisfied by the router core', () => {
  const provided = routerCore();
  const files = readdirSync(SDD_V2).filter((f) => f.endsWith('.directive.xml'));

  it('router exposes a non-trivial core', () => {
    assert.ok(provided.size >= 5, `router core too small: ${[...provided].sort().join(', ')}`);
  });

  for (const f of files) {
    const deps = declaredDeps(readFileSync(join(SDD_V2, f), 'utf8'));
    if (deps.length === 0) continue;
    it(`${f}: every declared dep is in the router core`, () => {
      const missing = deps.filter((d) => !provided.has(d));
      assert.deepEqual(
        missing,
        [],
        `${f} declares deps the router does not provide: ${missing.join(', ')}`
      );
    });
  }

  it('at least the known thin branches declare deps (root, discover)', () => {
    const withDeps = files.filter(
      (f) => declaredDeps(readFileSync(join(SDD_V2, f), 'utf8')).length > 0
    );
    assert.ok(
      withDeps.some((f) => f.startsWith('root.')) && withDeps.some((f) => f.startsWith('discover')),
      `expected root + discover to declare deps, got: ${withDeps.join(', ')}`
    );
  });
});
