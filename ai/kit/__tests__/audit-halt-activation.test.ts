// @file: Regression tests for recursive lazy step-package assembly in the halt audit.
// @consumers: audit-halt-activation.mjs

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAssembledFragments } from '../audit-halt-fragments.mjs';

const roots: string[] = [];

function fixture(): { root: string; skeleton: string; steps: string } {
  const root = mkdtempSync(join(tmpdir(), 'halt-audit-lazy-'));
  roots.push(root);
  const steps = join(root, 'ai', 'directives', 'sdd-v2', 'demo', 'steps');
  mkdirSync(steps, { recursive: true });
  return {
    root,
    skeleton: join(root, 'ai', 'directives', 'sdd-v2', 'demo.directive.xml'),
    steps,
  };
}

function ref(path: string): string {
  return `Before executing this step, READ_AND_USE_DIRECTIVE("${path}").`;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('halt audit lazy package traversal', () => {
  it('reads a bounded skeleton → step1 → step2 chain where the terminal package uses the halt', () => {
    const { root, skeleton, steps } = fixture();
    writeFileSync(
      skeleton,
      `<HaltConditions>| \`H_CHAIN\` | terminal condition |</HaltConditions>\n${ref('ai/directives/sdd-v2/demo/steps/STEP_1.xml')}`
    );
    writeFileSync(
      join(steps, 'STEP_1.xml'),
      ref('ai/directives/sdd-v2/demo/steps/STEP_2.xml')
    );
    writeFileSync(join(steps, 'STEP_2.xml'), '<Action>halt with `H_CHAIN`</Action>');

    const fragments = readAssembledFragments(skeleton, { repoRoot: root, lazy: true });
    assert.equal(fragments.length, 3);
    assert.match(fragments[2], /H_CHAIN/);
  });

  it('fails closed on a missing nested step package', () => {
    const { root, skeleton, steps } = fixture();
    writeFileSync(skeleton, ref('ai/directives/sdd-v2/demo/steps/STEP_1.xml'));
    writeFileSync(
      join(steps, 'STEP_1.xml'),
      ref('ai/directives/sdd-v2/demo/steps/MISSING.xml')
    );

    assert.throws(
      () => readAssembledFragments(skeleton, { repoRoot: root, lazy: true }),
      /missing step-package ref/
    );
  });

  it('fails closed on a nested step-package cycle', () => {
    const { root, skeleton, steps } = fixture();
    writeFileSync(skeleton, ref('ai/directives/sdd-v2/demo/steps/STEP_1.xml'));
    writeFileSync(
      join(steps, 'STEP_1.xml'),
      ref('ai/directives/sdd-v2/demo/steps/STEP_2.xml')
    );
    writeFileSync(
      join(steps, 'STEP_2.xml'),
      ref('ai/directives/sdd-v2/demo/steps/STEP_1.xml')
    );

    assert.throws(
      () => readAssembledFragments(skeleton, { repoRoot: root, lazy: true }),
      /cyclic step-package ref/
    );
  });

  it('refuses a canonical-looking package edge that escapes the owning directive package', () => {
    const { root, skeleton } = fixture();
    writeFileSync(skeleton, ref('ai/directives/sdd-v2/other.directive.xml'));

    assert.throws(
      () => readAssembledFragments(skeleton, { repoRoot: root, lazy: true }),
      /step-package ref escapes its directive package/
    );
  });
});
