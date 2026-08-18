// @file: Unit tests for findResearchLinks + checkResearchOrphans — the pure core behind
//   SDD_RESEARCH_REF_BROKEN (adapter-side, sdd-check.cmd) and SDD_RESEARCH_ORPHAN.
// @consumers: check

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findResearchLinks, checkResearchOrphans } from '../check.ts';

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

describe('checkResearchOrphans', () => {
  it('no research files → no findings', () => {
    assert.deepStrictEqual(checkResearchOrphans([], new Set()), []);
  });

  it('a referenced research file → no finding', () => {
    const findings = checkResearchOrphans(
      ['/repo/specs/demo/research/2026-08-18-x.research.md'],
      new Set(['/repo/specs/demo/research/2026-08-18-x.research.md'])
    );
    assert.deepStrictEqual(findings, []);
  });

  it('an unreferenced research file → one SDD_RESEARCH_ORPHAN warning', () => {
    const file = '/repo/specs/demo/research/2026-08-18-x.research.md';
    const findings = checkResearchOrphans([file], new Set());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.strictEqual(findings[0]?.code, 'SDD_RESEARCH_ORPHAN');
    assert.strictEqual(findings[0]?.file, file);
  });

  it('mixed set: only the unreferenced file is flagged', () => {
    const referenced = '/repo/specs/demo/research/2026-08-18-a.research.md';
    const orphan = '/repo/specs/demo/research/2026-08-18-b.research.md';
    const findings = checkResearchOrphans([referenced, orphan], new Set([referenced]));
    assert.deepStrictEqual(
      findings.map((f) => f.file),
      [orphan]
    );
  });
});
