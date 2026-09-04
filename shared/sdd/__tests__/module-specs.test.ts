// @file: Unit tests for countModuleSpecs — the MODULE_VISION marker walk under specs/.
// @consumers: module-specs
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  countModuleSpecs,
  resolveModuleScopeOwnership,
  resolveScopeDecomposition,
  resolveTaskOutputOwnership,
  resolveTaskOwnership,
} from '../module-specs.ts';

let root: string;

describe('countModuleSpecs', () => {
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'module-specs-'));
    mkdirSync(join(root, 'specs', 'backend', 'api'), { recursive: true });
    mkdirSync(join(root, 'specs', 'node_modules', 'x'), { recursive: true });

    writeFileSync(join(root, 'specs', 'README.md'), '# proj\n');
    writeFileSync(
      join(root, 'specs', 'backend', 'backend.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n'
    );
    writeFileSync(
      join(root, 'specs', 'backend', 'api', 'api.spec.md'),
      '<!--SECTION:MODULE_VISION-->\nvision\n<!--/SECTION:MODULE_VISION-->\n'
    );
    writeFileSync(
      join(root, 'specs', 'backend', 'other.spec.md'),
      '<!--SECTION:MODULE_VISION-->\nvision\n<!--/SECTION:MODULE_VISION-->\n'
    );
    // a node_modules dir under specs/ is never descended into
    writeFileSync(
      join(root, 'specs', 'node_modules', 'x', 'x.spec.md'),
      '<!--SECTION:MODULE_VISION-->\n<!--/SECTION:MODULE_VISION-->\n'
    );
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('counts only MODULE_VISION-marked spec files, skipping the portal and scope specs', () => {
    assert.strictEqual(countModuleSpecs(join(root, 'specs')), 2);
  });

  it('returns 0 when specs/ is absent', () => {
    assert.strictEqual(countModuleSpecs(join(root, 'no-such-dir')), 0);
  });

  it('requires a non-empty Module Map whose declared members exactly equal canonical module specs', () => {
    const scope = join(root, 'specs', 'backend', 'backend.spec.md');
    writeFileSync(
      scope,
      [
        '<!--SECTION:SCOPE_TYPE-->',
        'product',
        '<!--/SECTION:SCOPE_TYPE-->',
        '<!--SECTION:MODULE_MAP-->',
        '- [api](./api/api.spec.md)',
        '<!--/SECTION:MODULE_MAP-->',
      ].join('\n')
    );
    const incomplete = resolveScopeDecomposition(scope);
    assert.strictEqual(incomplete.status, 'invalid');
    assert.match(incomplete.reason ?? '', /other\.spec\.md.*does not match|undeclared/);

    rmSync(join(root, 'specs', 'backend', 'other.spec.md'));
    const complete = resolveScopeDecomposition(scope);
    assert.strictEqual(complete.status, 'complete');
    assert.deepStrictEqual(complete.moduleSpecs, [
      join(root, 'specs', 'backend', 'api', 'api.spec.md'),
    ]);
  });

  it('rejects zero, duplicate, missing, and non-module declarations', () => {
    const scopeDir = join(root, 'specs', 'strict');
    mkdirSync(scopeDir, { recursive: true });
    const scope = join(scopeDir, 'strict.spec.md');
    const writeMap = (rows: string): void =>
      writeFileSync(
        scope,
        [
          '<!--SECTION:SCOPE_TYPE-->',
          'library',
          '<!--/SECTION:SCOPE_TYPE-->',
          '<!--SECTION:MODULE_MAP-->',
          rows,
          '<!--/SECTION:MODULE_MAP-->',
        ].join('\n')
      );

    writeMap('Modules not yet decomposed');
    assert.match(resolveScopeDecomposition(scope).reason ?? '', /zero module specs/);
    writeMap('- [x](./x/x.spec.md)\n- [x again](./x/x.spec.md)');
    // Semantic dedup: duplicate aliases to the SAME module spec are redundant, not a duplicate-member
    // error; the real error surfaces on the module's own state (here: missing), never "duplicate".
    {
      const dupReason = resolveScopeDecomposition(scope).reason ?? '';
      assert.doesNotMatch(dupReason, /duplicate/);
      assert.match(dupReason, /is missing/);
    }
    writeMap('- [missing](./missing/missing.spec.md)');
    assert.match(resolveScopeDecomposition(scope).reason ?? '', /is missing/);
    mkdirSync(join(scopeDir, 'plain'), { recursive: true });
    writeFileSync(join(scopeDir, 'plain', 'plain.spec.md'), '# not a module');
    writeMap('- [plain](./plain/plain.spec.md)');
    assert.match(resolveScopeDecomposition(scope).reason ?? '', /is not a module spec/);
  });

  it('reports an unreplaced Module Map placeholder plainly, not as a missing module', () => {
    const scopeDir = join(root, 'specs', 'ph');
    mkdirSync(scopeDir, { recursive: true });
    const scope = join(scopeDir, 'ph.spec.md');
    writeFileSync(
      scope,
      [
        '<!--SECTION:SCOPE_TYPE-->',
        'library',
        '<!--/SECTION:SCOPE_TYPE-->',
        '<!--SECTION:MODULE_MAP-->',
        '- [<module>](./<module>/<module>.spec.md)',
        '<!--/SECTION:MODULE_MAP-->',
      ].join('\n')
    );
    const reason = resolveScopeDecomposition(scope).reason ?? '';
    assert.match(reason, /unreplaced placeholder/);
    assert.doesNotMatch(reason, /is missing/);
  });

  it('makes infrastructure the sole flat result', () => {
    const infra = join(root, 'specs', 'infra', 'infra.spec.md');
    const iface = join(root, 'specs', 'contract', 'contract.spec.md');
    mkdirSync(join(root, 'specs', 'infra'), { recursive: true });
    mkdirSync(join(root, 'specs', 'contract'), { recursive: true });
    writeFileSync(infra, '<!--SECTION:SCOPE_TYPE-->\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->');
    writeFileSync(iface, '<!--SECTION:SCOPE_TYPE-->\ninterface\n<!--/SECTION:SCOPE_TYPE-->');
    assert.strictEqual(resolveScopeDecomposition(infra).status, 'flat');
    assert.strictEqual(resolveScopeDecomposition(iface).status, 'not-applicable');
  });

  it('resolves a declared module to exactly one complete product/library owner', () => {
    const scopeDir = join(root, 'specs', 'owned');
    const moduleDir = join(scopeDir, 'core');
    mkdirSync(moduleDir, { recursive: true });
    const scope = join(scopeDir, 'owned.spec.md');
    const module = join(moduleDir, 'core.spec.md');
    writeFileSync(
      scope,
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n<!--SECTION:MODULE_MAP-->\n- [core](./core/core.spec.md)\n<!--/SECTION:MODULE_MAP-->'
    );
    writeFileSync(module, '<!--SECTION:MODULE_VISION-->\ncore\n<!--/SECTION:MODULE_VISION-->');
    const ownership = resolveModuleScopeOwnership(module);
    assert.strictEqual(ownership.status, 'owned');
    if (ownership.status === 'owned') assert.strictEqual(ownership.decomposition.scopeSpec, scope);
  });

  it('fails closed for no owner, undeclared membership, and ambiguous nested owners', () => {
    const invalidReason = (path: string): string => {
      const result = resolveModuleScopeOwnership(path);
      assert.strictEqual(result.status, 'invalid');
      return result.status === 'invalid' ? result.reason : '';
    };
    const orphanDir = join(root, 'orphan');
    mkdirSync(orphanDir, { recursive: true });
    const orphan = join(orphanDir, 'orphan.spec.md');
    writeFileSync(orphan, '<!--SECTION:MODULE_VISION-->\norphan\n<!--/SECTION:MODULE_VISION-->');
    assert.match(invalidReason(orphan), /no canonical.*owner/);

    const undeclaredScope = join(root, 'specs', 'undeclared');
    const undeclaredDir = join(undeclaredScope, 'extra');
    mkdirSync(undeclaredDir, { recursive: true });
    writeFileSync(
      join(undeclaredScope, 'undeclared.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nlibrary\n<!--/SECTION:SCOPE_TYPE-->\n<!--SECTION:MODULE_MAP-->\nModules not yet decomposed\n<!--/SECTION:MODULE_MAP-->'
    );
    const undeclared = join(undeclaredDir, 'extra.spec.md');
    writeFileSync(undeclared, '<!--SECTION:MODULE_VISION-->\nextra\n<!--/SECTION:MODULE_VISION-->');
    assert.match(invalidReason(undeclared), /not complete/);

    const outer = join(root, 'specs', 'outer');
    const inner = join(outer, 'inner');
    const leafDir = join(inner, 'leaf');
    mkdirSync(leafDir, { recursive: true });
    const leaf = join(leafDir, 'leaf.spec.md');
    writeFileSync(leaf, '<!--SECTION:MODULE_VISION-->\nleaf\n<!--/SECTION:MODULE_VISION-->');
    writeFileSync(
      join(outer, 'outer.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n<!--SECTION:MODULE_MAP-->\n- [leaf](./inner/leaf/leaf.spec.md)\n<!--/SECTION:MODULE_MAP-->'
    );
    writeFileSync(
      join(inner, 'inner.spec.md'),
      '<!--SECTION:SCOPE_TYPE-->\nproduct\n<!--/SECTION:SCOPE_TYPE-->\n<!--SECTION:MODULE_MAP-->\n- [leaf](./leaf/leaf.spec.md)\n<!--/SECTION:MODULE_MAP-->'
    );
    assert.match(invalidReason(leaf), /ambiguous owning scopes/);
  });

  it('accepts only an exact declared canonical module for a module-owned task', () => {
    const scope = join(root, 'specs', 'owned', 'owned.spec.md');
    assert.strictEqual(resolveTaskOwnership(scope, 'module', 'core').status, 'owned');
    const ghost = resolveTaskOwnership(scope, 'module', 'ghost');
    assert.strictEqual(ghost.status, 'invalid');
    if (ghost.status === 'invalid') assert.match(ghost.reason, /no exact canonical|not.*declared/);
  });

  it('infers module ownership from an output subtree and fails closed on a conflicting owner shape', () => {
    const inferred = resolveTaskOutputOwnership('specs/owned/core/owned.task.OWN-x.md', root);
    assert.deepStrictEqual(inferred, { scope: 'owned', module: 'core' });
    const outside = resolveTaskOutputOwnership('elsewhere/task.md', root);
    assert.match(outside.reason ?? '', /outside specs/);
  });
});
