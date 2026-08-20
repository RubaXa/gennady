// @file: Unit tests for findSpecSection — v2 marker first, legacy numbered-heading fallback second.
// @consumers: spec-sections

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findSpecSection } from '../core/spec-sections.ts';

describe('findSpecSection', () => {
  it('reads a v2 SECTION marker body', () => {
    const content =
      '<!--SECTION:ENTITY_INVENTORY-->\n| `Foo` | Service | x |\n<!--/SECTION:ENTITY_INVENTORY-->';
    assert.match(findSpecSection(content, 'ENTITY_INVENTORY') ?? '', /Foo/);
  });

  it('falls back to a legacy numbered heading when no marker is present', () => {
    const content =
      '## 2. Entity Inventory (Closed-World)\n| `Foo` | Service | x |\n\n## 3. Entity Surfaces\nmore';
    assert.match(findSpecSection(content, 'ENTITY_INVENTORY') ?? '', /Foo/);
  });

  it('returns null when neither format carries the section', () => {
    assert.equal(findSpecSection('# Module\n\njust prose', 'MODULE_CONTRACTS'), null);
  });

  it('does not let "Bootstrap Requirements" satisfy a MODULE_REQUIREMENTS lookup', () => {
    const content = '## 8. Bootstrap Requirements\n| Requirement | Kind |\n| x | y |';
    assert.equal(findSpecSection(content, 'MODULE_REQUIREMENTS'), null);
  });

  it('finds legacy "Requirements & Constraints" for REQUIREMENTS_AND_CONSTRAINTS', () => {
    const content = '## 4. Requirements & Constraints\n\n### Functional Requirements\nFR-01 does X';
    assert.match(findSpecSection(content, 'REQUIREMENTS_AND_CONSTRAINTS') ?? '', /FR-01/);
  });

  it('finds legacy "Module Contracts (DbC)" for MODULE_CONTRACTS', () => {
    const content = '## 4. Module Contracts (DbC)\n\n#### Service: `Foo`\ndetail';
    assert.match(findSpecSection(content, 'MODULE_CONTRACTS') ?? '', /Foo/);
  });

  it('finds legacy "Module Map" for MODULE_MAP', () => {
    const content = '## 9. Module Map\n\n- [a](./a/a.spec.md)\n\n## 10. Handoff\nx';
    assert.match(findSpecSection(content, 'MODULE_MAP') ?? '', /a\/a\.spec\.md/);
  });

  it('a v2 spec missing the requested section falls through to legacy search harmlessly', () => {
    // A v2 spec has no numbered "## N." headings, so the fallback correctly finds nothing.
    const content = '<!--SECTION:MODULE_VISION-->\nx\n<!--/SECTION:MODULE_VISION-->';
    assert.equal(findSpecSection(content, 'ENTITY_INVENTORY'), null);
  });
});
