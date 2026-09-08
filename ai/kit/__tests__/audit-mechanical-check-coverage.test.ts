// @file: Coverage test — every sdd-check code family documented in help.ts is also named where the
//   audit directive teaches AX_MECHANICAL_VIA_SDD_CHECK, so the audit worker never "hand-redoes" a
//   check it doesn't know sdd-check already performs (B2-11).
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HELP_TS = fileURLToPath(new URL('../../../cli/cmd/sdd-check/help.ts', import.meta.url));
const STEP_1_MECHANICAL = fileURLToPath(
  new URL('../../directives/sdd-v2/audit/steps/STEP_1_MECHANICAL.xml', import.meta.url)
);
const AX_MECHANICAL_SOURCE = fileURLToPath(
  new URL('../axiom/audit/ax-mechanical-via-sdd-check.xml', import.meta.url)
);

/** @purpose Every ALL_CAPS check-family label help.ts documents with a trailing colon (e.g. "BDD_COVERAGE: "). */
function checkFamilyLabels(text: string): Set<string> {
  const labels = [...text.matchAll(/\b([A-Z][A-Z_]{3,}): /g)].map((m) => m[1] as string);
  // DONE: is prose ("DONE with an unresolved BLOCKED"), not a check-family label.
  return new Set(labels.filter((l) => l !== 'DONE'));
}

describe('B2-11 — help.ts check families ⊆ AX_MECHANICAL_VIA_SDD_CHECK', () => {
  it('help.ts names at least the families this test knows to check (guards against a silently empty comparison)', () => {
    const labels = checkFamilyLabels(readFileSync(HELP_TS, 'utf-8'));
    for (const expected of [
      'RULES_CASCADE_CLOSURE',
      'BDD_COVERAGE',
      'BDD_NEGATIVE',
      'BDD_TRACE',
      'COVERAGE_POLICY',
      'PHASE_RECEIPT',
    ]) {
      assert.ok(labels.has(expected), `help.ts no longer documents ${expected}`);
    }
  });

  it('every help.ts check family is named in the built STEP_1_MECHANICAL.xml (ai/directives/sdd-v2/audit/steps/)', () => {
    const labels = checkFamilyLabels(readFileSync(HELP_TS, 'utf-8'));
    const directive = readFileSync(STEP_1_MECHANICAL, 'utf-8');
    const missing = [...labels].filter((label) => !directive.includes(label));
    assert.deepStrictEqual(missing, [], `families missing from STEP_1_MECHANICAL.xml: ${missing.join(', ')}`);
  });

  it('every help.ts check family is named in its axiom brick too (ai/kit/axiom/audit/ax-mechanical-via-sdd-check.xml — the single home audit.directive.hbs includes as a partial, post T-B6-18 de-inlining)', () => {
    const labels = checkFamilyLabels(readFileSync(HELP_TS, 'utf-8'));
    const source = readFileSync(AX_MECHANICAL_SOURCE, 'utf-8');
    const missing = [...labels].filter((label) => !source.includes(label));
    assert.deepStrictEqual(missing, [], `families missing from audit.directive.hbs: ${missing.join(', ')}`);
  });
});
