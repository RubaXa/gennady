// @file: Unit tests for findResearchLinks + findRegisteredResearchLinks + checkResearchOrphans —
//   the pure core behind SDD_RESEARCH_REF_BROKEN (adapter-side, sdd-check.cmd), SDD_RESEARCH_ORPHAN,
//   and SDD_RESEARCH_UNREGISTERED.
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findResearchLinks, findRegisteredResearchLinks, checkResearchOrphans } from '../check.ts';

describe('findResearchLinks', () => {
  it('extracts a plain research-doc link target', () => {
    assert.deepStrictEqual(
      findResearchLinks('See [research](./research/2026-08-18-ai-tooling-stack.research.md).'),
      ['./research/2026-08-18-ai-tooling-stack.research.md']
    );
  });

  it('extracts a research-doc link with an anchor, dropping the anchor', () => {
    assert.deepStrictEqual(
      findResearchLinks('[X](../research/2026-08-18-x.research.md#decision)'),
      ['../research/2026-08-18-x.research.md']
    );
  });

  it('ignores non-research links (spec.md, xml)', () => {
    assert.deepStrictEqual(findResearchLinks('[a](./a.spec.md) [b](./b.xml)'), []);
  });

  it('finds multiple links, keeping duplicates and order', () => {
    const content = '[a](./x.research.md) prose [b](./y.research.md) [c](./x.research.md)';
    assert.deepStrictEqual(findResearchLinks(content), [
      './x.research.md',
      './y.research.md',
      './x.research.md',
    ]);
  });

  it('returns empty for content with no links', () => {
    assert.deepStrictEqual(findResearchLinks('no links here'), []);
  });
});

describe('findRegisteredResearchLinks', () => {
  it('extracts a link inside the RESEARCH section', () => {
    const content = [
      '<!--SECTION:RESEARCH-->',
      '## Research',
      '| [2026-08-18-x](./research/2026-08-18-x.research.md) | topic | decision |',
      '<!--/SECTION:RESEARCH-->',
    ].join('\n');
    assert.deepStrictEqual(findRegisteredResearchLinks(content), [
      './research/2026-08-18-x.research.md',
    ]);
  });

  it('ignores a research-doc link that lives outside the RESEARCH section (e.g. Decision Log)', () => {
    const content = [
      '<!--SECTION:DECISION_LOG-->',
      '## Decision Log',
      'See [x](./research/2026-08-18-x.research.md).',
      '<!--/SECTION:DECISION_LOG-->',
    ].join('\n');
    assert.deepStrictEqual(findRegisteredResearchLinks(content), []);
  });

  it('no RESEARCH section → empty', () => {
    assert.deepStrictEqual(findRegisteredResearchLinks('# Spec\nno research section here'), []);
  });
});

describe('checkResearchOrphans', () => {
  it('no research files → no findings', () => {
    assert.deepStrictEqual(checkResearchOrphans([], new Set(), new Set()), []);
  });

  it('a referenced and registered research file → no finding', () => {
    const file = '/repo/specs/demo/research/2026-08-18-x.research.md';
    const findings = checkResearchOrphans([file], new Set([file]), new Set([file]));
    assert.deepStrictEqual(findings, []);
  });

  it('an unreferenced research file → one SDD_RESEARCH_ORPHAN warning', () => {
    const file = '/repo/specs/demo/research/2026-08-18-x.research.md';
    const findings = checkResearchOrphans([file], new Set(), new Set());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.strictEqual(findings[0]?.code, 'SDD_RESEARCH_ORPHAN');
    assert.strictEqual(findings[0]?.file, file);
  });

  it('referenced but not registered → one SDD_RESEARCH_UNREGISTERED warning naming the scope spec', () => {
    const file = '/repo/specs/demo/research/2026-08-18-x.research.md';
    const findings = checkResearchOrphans([file], new Set([file]), new Set());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.strictEqual(findings[0]?.code, 'SDD_RESEARCH_UNREGISTERED');
    assert.match(findings[0]?.message ?? '', /specs\/demo\/demo\.spec\.md/);
  });

  it('mixed set: only the unreferenced file is flagged (orphan takes priority over unregistered)', () => {
    const referenced = '/repo/specs/demo/research/2026-08-18-a.research.md';
    const orphan = '/repo/specs/demo/research/2026-08-18-b.research.md';
    const findings = checkResearchOrphans(
      [referenced, orphan],
      new Set([referenced]),
      new Set([referenced])
    );
    assert.deepStrictEqual(
      findings.map((f) => f.file),
      [orphan]
    );
    assert.deepStrictEqual(
      findings.map((f) => f.code),
      ['SDD_RESEARCH_ORPHAN']
    );
  });
});
