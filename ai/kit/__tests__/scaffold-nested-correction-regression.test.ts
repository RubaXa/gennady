// @file: Draft.54 regression characterization for a decomposition correction discovered by scaffold.
// @consumers: sdd-scaffold, module-decomposition, session router

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');

describe('draft.54 scaffold nested decomposition correction', () => {
  const scaffold = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
  const moduleFlow = read('ai', 'kit', 'templates', 'sdd-v2', 'module.directive.hbs');

  it('preserves the scaffold intent and exact target-set across the nested correction', () => {
    assert.match(
      scaffold,
      /H_SCOPE_NOT_DECOMPOSED.+nested same-chain module-decomposition correction.+preserve.+`intent: scaffold`.+exact (?:bounded )?target-set.+return to scaffold `STEP_0_INTAKE`/s
    );
    assert.doesNotMatch(
      scaffold,
      /sdd-session set intent ["']module-decomposition["']/,
      'a nested correction must not permanently relabel the scaffold session'
    );
    assert.match(
      moduleFlow,
      /when entered as scaffold's nested decomposition correction.+return owner is scaffold `STEP_0_INTAKE`.+`TerminalDecision: continue`/s
    );
  });

  it('returns from nested correction before the standalone review/publication lifecycle', () => {
    assert.match(
      moduleFlow,
      /nested decomposition correction.+do not load `ai\/directives\/sdd-v2\/review-lifecycle\.directive\.xml` before returning to scaffold/s
    );
    assert.match(
      scaffold,
      /nested correction return.+no ticket or Gate 1.+until the corrected decomposition has its owning review disposition/s
    );
  });
});
