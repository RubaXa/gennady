// @file: Unit tests for legacySpecSectionBody / stripHeadingNumbering / hasAnySectionMarker — the v1 (pre-marker) section fallback.
// @consumers: legacy-headings

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  legacySpecSectionBody,
  stripHeadingNumbering,
  hasAnySectionMarker,
} from '../legacy-headings.ts';

describe('stripHeadingNumbering', () => {
  it('strips a single-level number', () => {
    assert.equal(
      stripHeadingNumbering('4. Requirements & Constraints'),
      'Requirements & Constraints'
    );
  });

  it('strips a multi-level number', () => {
    assert.equal(
      stripHeadingNumbering('9.2 Inter-Module Dependency Map'),
      'Inter-Module Dependency Map'
    );
  });

  it('leaves unnumbered text untouched', () => {
    assert.equal(stripHeadingNumbering('Module Vision'), 'Module Vision');
  });
});

describe('legacySpecSectionBody', () => {
  const doc = [
    '# Module: foo',
    '',
    '## 1. Module Vision',
    'What foo owns.',
    '',
    '## 2. Entity Inventory (Closed-World)',
    '| Name | Type | Purpose |',
    '| `Foo` | Service | x |',
    '',
    '## 3. Entity Surfaces',
    'detail',
  ].join('\n');

  it('finds a body by fuzzy heading match, numbering stripped', () => {
    const body = legacySpecSectionBody(doc, /entity inventory/i);
    assert.match(body ?? '', /Foo.*Service/s);
  });

  it('stops at the next heading of the same level', () => {
    const body = legacySpecSectionBody(doc, /module vision/i);
    assert.equal(body, 'What foo owns.');
  });

  it('returns null when no heading matches', () => {
    assert.equal(legacySpecSectionBody(doc, /module contracts/i), null);
  });

  it('does not match a differently-numbered but textually similar heading elsewhere', () => {
    // "Bootstrap Requirements" must not satisfy a `^requirements\b` matcher.
    const withBootstrap = `${doc}\n\n## 8. Bootstrap Requirements\nsome table`;
    const body = legacySpecSectionBody(withBootstrap, /^requirements\b/i);
    assert.equal(body, null);
  });

  it('respects an explicit level (does not match a level-3 heading at level 2)', () => {
    const body = legacySpecSectionBody(doc, /entity surfaces/i, 3);
    assert.equal(body, null); // "## 3. Entity Surfaces" is level 2, not level 3
  });

  it('runs to end of document when the matched heading is the last one', () => {
    const body = legacySpecSectionBody(doc, /entity surfaces/i);
    assert.equal(body, 'detail');
  });
});

describe('hasAnySectionMarker', () => {
  it('is true when a v2 marker is present anywhere', () => {
    assert.equal(
      hasAnySectionMarker('# x\n<!--SECTION:MODULE_VISION-->\nbody\n<!--/SECTION:MODULE_VISION-->'),
      true
    );
  });

  it('is false for a legacy plain-heading document', () => {
    assert.equal(hasAnySectionMarker('# Module: foo\n\n## 1. Module Vision\ntext'), false);
  });
});
