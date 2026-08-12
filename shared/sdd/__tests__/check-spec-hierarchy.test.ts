// @file: Unit tests for checkSpecHierarchy — module↔parent-index verification (AX_HIERARCHICAL_SPECS / AX_SCOPE_STAYS_THIN).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSpecHierarchy, type SpecEntry } from '../check.ts';

const scopeSpec = (linksTo: string[] = []): string =>
  [
    '# Scope: s',
    '<!--SECTION:SCOPE_TYPE-->',
    '## scope-type',
    'product',
    '<!--/SECTION:SCOPE_TYPE-->',
    '<!--SECTION:MODULE_MAP-->',
    '## Module Map',
    ...linksTo.map((l) => `- [mod](${l})`),
    '<!--/SECTION:MODULE_MAP-->',
  ].join('\n');

const moduleSpec = (opts: { links?: string[]; withInventory?: boolean } = {}): string => {
  const { links = [], withInventory = false } = opts;
  const lines = [
    '# Module: m',
    '<!--SECTION:MODULE_VISION-->',
    '## Module Vision',
    ...links.map((l) => `- [parent](${l})`),
    '<!--/SECTION:MODULE_VISION-->',
  ];
  if (withInventory) {
    lines.push(
      '<!--SECTION:ENTITY_INVENTORY-->',
      '## Entity Inventory',
      '| Name | Type | Purpose |',
      '<!--/SECTION:ENTITY_INVENTORY-->'
    );
  }
  return lines.join('\n');
};

describe('checkSpecHierarchy', () => {
  it('module linked from its parent scope index → no finding', () => {
    const specs: SpecEntry[] = [
      { file: 'specs/s/s.spec.md', content: scopeSpec(['./auth/auth.spec.md']), flowVersion: 'v2' },
      { file: 'specs/s/auth/auth.spec.md', content: moduleSpec(), flowVersion: 'v2' },
    ];
    assert.deepStrictEqual(checkSpecHierarchy(specs), []);
  });

  it('module NOT linked from its parent scope index → SDD_MODULE_NOT_IN_INDEX', () => {
    const specs: SpecEntry[] = [
      { file: 'specs/s/s.spec.md', content: scopeSpec([]), flowVersion: 'v2' },
      { file: 'specs/s/auth/auth.spec.md', content: moduleSpec(), flowVersion: 'v2' },
    ];
    const findings = checkSpecHierarchy(specs);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_MODULE_NOT_IN_INDEX');
    assert.strictEqual(findings[0]?.severity, 'error');
    assert.strictEqual(findings[0]?.file, 'specs/s/s.spec.md');
  });

  it('orphan module on a v1 scope → warn, not error', () => {
    const specs: SpecEntry[] = [
      { file: 'specs/s/s.spec.md', content: scopeSpec([]), flowVersion: 'v1' },
      { file: 'specs/s/auth/auth.spec.md', content: moduleSpec(), flowVersion: 'v1' },
    ];
    const findings = checkSpecHierarchy(specs);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.severity, 'warn');
  });

  it('namespace directory (no spec of its own) between scope and module — parent lookup skips it', () => {
    // specs/s/providers/claude/claude.spec.md — "providers/" is a legal namespace dir with no spec.
    const specs: SpecEntry[] = [
      {
        file: 'specs/s/s.spec.md',
        content: scopeSpec(['./providers/claude/claude.spec.md']),
        flowVersion: 'v2',
      },
      { file: 'specs/s/providers/claude/claude.spec.md', content: moduleSpec(), flowVersion: 'v2' },
    ];
    assert.deepStrictEqual(checkSpecHierarchy(specs), []);
  });

  it('3-level nesting: grandchild module linked from its direct module parent → no finding, and parent becomes a thin index requirement', () => {
    const specs: SpecEntry[] = [
      { file: 'specs/s/s.spec.md', content: scopeSpec(['./auth/auth.spec.md']), flowVersion: 'v2' },
      {
        file: 'specs/s/auth/auth.spec.md',
        content: moduleSpec({ links: ['./tokens/tokens.spec.md'] }),
        flowVersion: 'v2',
      },
      { file: 'specs/s/auth/tokens/tokens.spec.md', content: moduleSpec(), flowVersion: 'v2' },
    ];
    assert.deepStrictEqual(checkSpecHierarchy(specs), []);
  });

  it('parent module with a child module but still carrying ENTITY_INVENTORY → SDD_PARENT_MODULE_NOT_INDEX', () => {
    const specs: SpecEntry[] = [
      { file: 'specs/s/s.spec.md', content: scopeSpec(['./auth/auth.spec.md']), flowVersion: 'v2' },
      {
        file: 'specs/s/auth/auth.spec.md',
        content: moduleSpec({ links: ['./tokens/tokens.spec.md'], withInventory: true }),
        flowVersion: 'v2',
      },
      { file: 'specs/s/auth/tokens/tokens.spec.md', content: moduleSpec(), flowVersion: 'v2' },
    ];
    const findings = checkSpecHierarchy(specs);
    const bloat = findings.filter((f) => f.code === 'SDD_PARENT_MODULE_NOT_INDEX');
    assert.strictEqual(bloat.length, 1);
    assert.strictEqual(bloat[0]?.severity, 'error');
    assert.strictEqual(bloat[0]?.file, 'specs/s/auth/auth.spec.md');
  });

  it('a leaf module (no children) keeping ENTITY_INVENTORY is fine — no SDD_PARENT_MODULE_NOT_INDEX', () => {
    const specs: SpecEntry[] = [
      { file: 'specs/s/s.spec.md', content: scopeSpec(['./auth/auth.spec.md']), flowVersion: 'v2' },
      {
        file: 'specs/s/auth/auth.spec.md',
        content: moduleSpec({ withInventory: true }),
        flowVersion: 'v2',
      },
    ];
    assert.deepStrictEqual(
      checkSpecHierarchy(specs).filter((f) => f.code === 'SDD_PARENT_MODULE_NOT_INDEX'),
      []
    );
  });
});
