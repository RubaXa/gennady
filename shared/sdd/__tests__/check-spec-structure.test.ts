// @file: Unit tests for checkSpecStructure (spec-file section-anchor balance).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSpecStructure } from '../check.ts';

describe('checkSpecStructure', () => {
  it('balanced anchors → no findings', () => {
    const md = '<!--SECTION:VISION-->\n## Vision\nx\n<!--/SECTION:VISION-->';
    assert.deepStrictEqual(checkSpecStructure('s.spec.md', md), []);
  });

  it('flags an unbalanced section anchor', () => {
    const md = '<!--SECTION:VISION-->\n## Vision\nx'; // no close
    const codes = checkSpecStructure('s.spec.md', md).map((f) => f.code);
    assert.ok(codes.includes('SDD_ANCHOR_UNBALANCED'));
  });

  it('flags interleaved sections that balance by count (A closes inside B)', () => {
    // counts balance (A 1/1, B 1/1) so SDD_ANCHOR_UNBALANCED stays silent — overlap must catch it
    const md = '<!--SECTION:A-->\nx\n<!--SECTION:B-->\ny\n<!--/SECTION:A-->\n<!--/SECTION:B-->';
    const codes = checkSpecStructure('s.spec.md', md).map((f) => f.code);
    assert.ok(
      !codes.includes('SDD_ANCHOR_UNBALANCED'),
      'counts balance, so unbalanced must not fire'
    );
    assert.ok(codes.includes('SDD_SECTION_OVERLAP'), 'interleave must be caught by overlap');
  });

  it('flags a nested section (B opens while A is still open)', () => {
    const md = '<!--SECTION:A-->\nx\n<!--SECTION:B-->\ny\n<!--/SECTION:B-->\n<!--/SECTION:A-->';
    assert.ok(
      checkSpecStructure('s.spec.md', md)
        .map((f) => f.code)
        .includes('SDD_SECTION_OVERLAP')
    );
  });

  it('flat sibling sections (A then B, no overlap) → no overlap finding', () => {
    const md = [block('A'), block('B')].join('\n');
    assert.ok(
      !checkSpecStructure('s.spec.md', md)
        .map((f) => f.code)
        .includes('SDD_SECTION_OVERLAP')
    );
  });
});

const block = (name: string): string =>
  `<!--SECTION:${name}-->\n## ${name}\nx\n<!--/SECTION:${name}-->`;
const scopeSpec = (type: string, sections: string[]): string =>
  [
    `<!--SECTION:SCOPE_TYPE-->\n## scope-type\n${type}\n<!--/SECTION:SCOPE_TYPE-->`,
    ...sections.map(block),
  ].join('\n\n');
const sectionCodes = (md: string): string[] =>
  checkSpecStructure('s.spec.md', md).map((f) => f.code);

describe('checkSpecStructure — required sections per scope-type', () => {
  const PRODUCT = [
    'VISION',
    'GOLDEN_DX',
    'REQUIREMENTS_AND_CONSTRAINTS',
    'ARCHITECTURE',
    'DECISION_LOG',
    'MODULE_MAP',
  ];

  it('a complete product scope spec → no missing-section findings', () => {
    assert.ok(!sectionCodes(scopeSpec('product', PRODUCT)).includes('SDD_SPEC_SECTION_MISSING'));
  });

  it('flags a product scope spec missing ARCHITECTURE', () => {
    const without = PRODUCT.filter((s) => s !== 'ARCHITECTURE');
    assert.ok(sectionCodes(scopeSpec('product', without)).includes('SDD_SPEC_SECTION_MISSING'));
  });

  it('a non-scope spec (no SCOPE_TYPE) is not section-checked', () => {
    const moduleSpec = [block('MODULE_VISION'), block('ENTITY_INVENTORY')].join('\n\n');
    assert.ok(!sectionCodes(moduleSpec).includes('SDD_SPEC_SECTION_MISSING'));
  });

  it('a module spec that carries SCOPE_TYPE (parent type) is NOT section-checked', () => {
    const md = [
      '<!--SECTION:SCOPE_TYPE-->\n## scope-type\nproduct\n<!--/SECTION:SCOPE_TYPE-->',
      block('MODULE_VISION'),
      block('ENTITY_INVENTORY'),
      block('MODULE_CONTRACTS'),
    ].join('\n\n');
    assert.ok(!sectionCodes(md).includes('SDD_SPEC_SECTION_MISSING'));
  });
});

const moduleWithEntities = (n: number): string => {
  const rows = Array.from({ length: n }, (_, i) => `| Entity${i} | Service | v1 |`).join('\n');
  const inventory = `<!--SECTION:ENTITY_INVENTORY-->\n## Entity Inventory\n\n| Entity | Kind | Consumer |\n| --- | --- | --- |\n${rows}\n<!--/SECTION:ENTITY_INVENTORY-->`;
  return [block('MODULE_VISION'), inventory, block('MODULE_CONTRACTS')].join('\n\n');
};

describe('checkSpecStructure — module bloat (soft signal)', () => {
  it('an oversized module inventory (> 20, P90) → SDD_MODULE_OVERSIZED at warn severity', () => {
    const findings = checkSpecStructure('m.spec.md', moduleWithEntities(21));
    const f = findings.find((x) => x.code === 'SDD_MODULE_OVERSIZED');
    assert.ok(f, 'expected SDD_MODULE_OVERSIZED');
    assert.strictEqual(f?.severity, 'warn');
  });

  it('a healthy upper-quartile module (14, ≤ threshold) → NO oversized finding (calibration: not the core)', () => {
    assert.ok(!sectionCodes(moduleWithEntities(14)).includes('SDD_MODULE_OVERSIZED'));
  });

  it('a cohesive module (few entities) → no oversized finding', () => {
    assert.ok(!sectionCodes(moduleWithEntities(5)).includes('SDD_MODULE_OVERSIZED'));
  });

  it('a scope spec (no ENTITY_INVENTORY) is never flagged oversized', () => {
    assert.ok(!sectionCodes(scopeSpec('product', PRODUCT_ALL)).includes('SDD_MODULE_OVERSIZED'));
  });

  const longModuleSpec = (entities: number, lines: number): string => {
    const rows = Array.from({ length: entities }, (_, i) => `| Entity${i} | Service | v1 |`).join(
      '\n'
    );
    const inventory = `<!--SECTION:ENTITY_INVENTORY-->\n## Entity Inventory\n\n| Entity | Kind | Consumer |\n| --- | --- | --- |\n${rows}\n<!--/SECTION:ENTITY_INVENTORY-->`;
    const padding = Array.from({ length: lines }, (_, i) => `prose line ${i}`).join('\n');
    return [block('MODULE_VISION'), inventory, padding, block('MODULE_CONTRACTS')].join('\n\n');
  };

  it('a verbose spec with a cohesive inventory → SDD_MODULE_SPEC_VERBOSE, not OVERSIZED', () => {
    const codes = sectionCodes(longModuleSpec(4, 800));
    assert.ok(codes.includes('SDD_MODULE_SPEC_VERBOSE'));
    assert.ok(!codes.includes('SDD_MODULE_OVERSIZED'));
  });

  it('a big-world spec fires OVERSIZED, not VERBOSE (decompose first)', () => {
    const codes = sectionCodes(longModuleSpec(21, 600));
    assert.ok(codes.includes('SDD_MODULE_OVERSIZED'));
    assert.ok(!codes.includes('SDD_MODULE_SPEC_VERBOSE'));
  });
});

const scopeDepsBlock = (sections: string[]): string =>
  [
    '<!--SECTION:SCOPE_TYPE-->\n## scope-type\nproduct\n<!--/SECTION:SCOPE_TYPE-->',
    ...sections.map(block),
  ].join('\n\n');

describe('checkSpecStructure — scope bloat (AX_SCOPE_STAYS_THIN)', () => {
  it('a scope spec carrying ENTITY_INVENTORY → SDD_SCOPE_BLOATED (warn)', () => {
    const md = scopeDepsBlock(['VISION', 'MODULE_MAP', 'ENTITY_INVENTORY']);
    const f = checkSpecStructure('s.spec.md', md).find((x) => x.code === 'SDD_SCOPE_BLOATED');
    assert.ok(f, 'expected SDD_SCOPE_BLOATED');
    assert.strictEqual(f?.severity, 'warn');
    assert.match(f?.message ?? '', /ENTITY_INVENTORY/);
  });

  it('a scope spec carrying MODULE_CONTRACTS → SDD_SCOPE_BLOATED', () => {
    const md = scopeDepsBlock(['VISION', 'MODULE_CONTRACTS']);
    assert.ok(sectionCodes(md).includes('SDD_SCOPE_BLOATED'));
  });

  it('a thin scope spec (no module-level sections) → no bloat finding', () => {
    const md = scopeDepsBlock(['VISION', 'MODULE_MAP', 'DECISION_LOG']);
    assert.ok(!sectionCodes(md).includes('SDD_SCOPE_BLOATED'));
  });

  it('a module spec (has MODULE_VISION) carrying ENTITY_INVENTORY is NOT scope-bloat', () => {
    // module specs legitimately carry the inventory + the parent SCOPE_TYPE — must not be flagged as a bloated scope
    const md = [
      '<!--SECTION:SCOPE_TYPE-->\n## scope-type\nproduct\n<!--/SECTION:SCOPE_TYPE-->',
      block('MODULE_VISION'),
      block('ENTITY_INVENTORY'),
    ].join('\n\n');
    assert.ok(!sectionCodes(md).includes('SDD_SCOPE_BLOATED'));
  });
});

const PRODUCT_ALL = [
  'VISION',
  'GOLDEN_DX',
  'REQUIREMENTS_AND_CONSTRAINTS',
  'ARCHITECTURE',
  'DECISION_LOG',
  'MODULE_MAP',
];
