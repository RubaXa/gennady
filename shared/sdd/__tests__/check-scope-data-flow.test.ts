// @file: Unit tests for checkScopeDataFlowDiagram — product/library scope specs already on the new
// Requirements format must show a data-flow rung (subheading, or a diagram captioned as such).
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkScopeDataFlowDiagram } from '../check.ts';

const SPEC_FILE = 'specs/storage/storage.spec.md'; // deriveSpecAcronym → "STO"

const scopeType = (kind: string): string =>
  ['<!--SECTION:SCOPE_TYPE-->', `Scope type: ${kind}`, '<!--/SECTION:SCOPE_TYPE-->'].join('\n');

const newFormatRequirements = (): string =>
  [
    '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    '## Requirements & Constraints',
    '',
    '### STO-REQ-1 [должен]',
    '',
    '**Когда** X, **сервис должен** сделать Y.',
    '',
    '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
  ].join('\n');

describe('checkScopeDataFlowDiagram', () => {
  it('module spec (MODULE_VISION present) → never checked, this rung is scope-only', () => {
    const content = [
      '<!--SECTION:MODULE_VISION-->',
      'x',
      '<!--/SECTION:MODULE_VISION-->',
      scopeType('product'),
      newFormatRequirements(),
    ].join('\n');
    assert.deepStrictEqual(checkScopeDataFlowDiagram(SPEC_FILE, content), []);
  });

  it('no SCOPE_TYPE section → no findings', () => {
    assert.deepStrictEqual(checkScopeDataFlowDiagram(SPEC_FILE, newFormatRequirements()), []);
  });

  it('infra scope (not product/library) → no findings even without a data-flow rung', () => {
    const content = scopeType('infra') + '\n' + newFormatRequirements();
    assert.deepStrictEqual(checkScopeDataFlowDiagram(SPEC_FILE, content), []);
  });

  it('product scope in the OLD Requirements format → dormant (no old-format warn variant for this rung)', () => {
    const oldFormat = [
      '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
      '### Functional Requirements',
      '| ID | Description |',
      '|---|---|',
      '| FR-01 | Something |',
      '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    ].join('\n');
    const content = scopeType('product') + '\n' + oldFormat;
    assert.deepStrictEqual(checkScopeDataFlowDiagram(SPEC_FILE, content), []);
  });

  it('product scope, new format, no data-flow rung anywhere → SDD_SCOPE_NO_DATA_FLOW error', () => {
    const content = scopeType('product') + '\n' + newFormatRequirements();
    const findings = checkScopeDataFlowDiagram(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_SCOPE_NO_DATA_FLOW');
    assert.strictEqual(findings[0]?.severity, 'error');
  });

  it('library scope, new format, with a "## Data Flow" subheading → no findings', () => {
    const content =
      scopeType('library') +
      '\n' +
      newFormatRequirements() +
      '\n## Data Flow\n\n```mermaid\nflowchart LR\n  A --> B\n```\n';
    assert.deepStrictEqual(checkScopeDataFlowDiagram(SPEC_FILE, content), []);
  });

  it('a Russian "### Поток данных" subheading also satisfies the rung', () => {
    const content =
      scopeType('product') + '\n' + newFormatRequirements() + '\n### Поток данных\n\ndetail\n';
    assert.deepStrictEqual(checkScopeDataFlowDiagram(SPEC_FILE, content), []);
  });

  it('no dedicated heading, but a diagram caption starting with "Поток данных" → satisfies the rung (fallback signal)', () => {
    const content =
      scopeType('product') +
      '\n' +
      newFormatRequirements() +
      '\n' +
      [
        '<!--SECTION:ARCHITECTURE-->',
        '```mermaid',
        'flowchart LR',
        '  A --> B',
        '```',
        '_Поток данных для STO-REQ-1._',
        '<!--/SECTION:ARCHITECTURE-->',
      ].join('\n');
    assert.deepStrictEqual(checkScopeDataFlowDiagram(SPEC_FILE, content), []);
  });
});
