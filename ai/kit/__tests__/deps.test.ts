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

/**
 * Conduct axioms every operator-facing directive must carry (T-B6-26 concretizes T-B6-20's
 * general "every operator-facing owner declares a conduct set" requirement for one member first:
 * AX_PROGRESSIVE_DISCLOSURE — "decision first, reasoning on demand" — was 7 independent local
 * partial-includes with 7 operator-facing owners carrying none at all. This set is expected to
 * grow as T-B6-20 lands; adding an id here without also adding it to every owner below is
 * deliberately a failing test, not a silent no-op.
 */
const REQUIRED_CONDUCT = ['AX_PROGRESSIVE_DISCLOSURE'] as const;

/** The top-level sdd-v2 directives whose prose an operator directly reads/acts on — router's
 * stateful branches (spec/task authoring, execute, the two review workers) — as opposed to
 * formats/*, agent-inbox/*, or class-3 subagent-world directives. */
const OPERATOR_FACING_OWNERS = [
  'infra.directive.xml',
  'root.directive.xml',
  'discover-from-code.directive.xml',
  'interface.directive.xml',
  'migration-v1-v2.directive.xml',
  'readiness.directive.xml',
  'recover-from-code.directive.xml',
  'scope.directive.xml',
  'module.directive.xml',
  'scaffold.directive.xml',
  'execute.directive.xml',
  'critic.directive.xml',
  'audit.directive.xml',
  'code-review.directive.xml',
] as const;

describe('every operator-facing owner declares the REQUIRED_CONDUCT set (T-B6-26)', () => {
  for (const file of OPERATOR_FACING_OWNERS) {
    it(`${file} carries every id in REQUIRED_CONDUCT`, () => {
      const text = readFileSync(join(SDD_V2, file), 'utf8');
      const missing = REQUIRED_CONDUCT.filter((id) => !new RegExp(`\\b${id}\\b`).test(text));
      assert.deepEqual(missing, [], `${file} is missing: ${missing.join(', ')}`);
    });
  }
});
