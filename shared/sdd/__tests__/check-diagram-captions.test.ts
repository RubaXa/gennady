// @file: Unit tests for checkDiagramCaptions — every diagram in a mandated section needs a
// `_<фраза> — <ACR>-REQ-<N>._` caption right after the closing fence; a cited ID must resolve.
// @consumers: check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDiagramCaptions } from '../check.ts';

const SPEC_FILE = 'specs/inbox-core/inbox-core.spec.md'; // deriveSpecAcronym → "IC"

const overview = (body: string): string =>
  ['<!--SECTION:OVERVIEW-->', '## Overview', '', body, '<!--/SECTION:OVERVIEW-->'].join('\n');

const newFormatRequirements = (): string =>
  [
    '<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
    '## Requirements & Constraints',
    '',
    '### IC-REQ-1 [должен]',
    '',
    '**Когда** X, **сервис должен** сделать Y.',
    '',
    '<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->',
  ].join('\n');

describe('checkDiagramCaptions', () => {
  it('no diagram at all → no findings', () => {
    assert.deepStrictEqual(checkDiagramCaptions(SPEC_FILE, overview('nothing here')), []);
  });

  it('diagram without a caption line → SDD_DIAGRAM_CAPTION_MISSING (warn, old format)', () => {
    const content = overview(
      ['```mermaid', 'flowchart LR', '  A --> B', '```', '', 'text after'].join('\n')
    );
    const findings = checkDiagramCaptions(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_DIAGRAM_CAPTION_MISSING');
    assert.strictEqual(findings[0]?.severity, 'warn');
  });

  it('diagram without a caption line → error when the spec is already in the new Requirements format', () => {
    const content =
      newFormatRequirements() +
      '\n' +
      overview(['```mermaid', 'flowchart LR', '  A --> B', '```'].join('\n'));
    const findings = checkDiagramCaptions(SPEC_FILE, content);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.code, 'SDD_DIAGRAM_CAPTION_MISSING');
    assert.strictEqual(findings[0]?.severity, 'error');
    assert.match(findings[0]?.message ?? '', /IC-REQ-1/); // example fix uses a real ID from this spec
  });

  it('diagram immediately followed by a well-formed caption → no findings', () => {
    const content = overview(
      ['```mermaid', 'flowchart LR', '  A --> B', '```', '_Общая композиция сервиса._'].join('\n')
    );
    assert.deepStrictEqual(checkDiagramCaptions(SPEC_FILE, content), []);
  });

  it('caption with a blank line before it (not "right after") → still counts as missing', () => {
    const content = overview(
      ['```mermaid', 'flowchart LR', '  A --> B', '```', '', '_Общая композиция сервиса._'].join(
        '\n'
      )
    );
    const findings = checkDiagramCaptions(SPEC_FILE, content);
    assert.strictEqual(findings[0]?.code, 'SDD_DIAGRAM_CAPTION_MISSING');
  });

  it('general-purpose Overview caption without any requirement ID → allowed, no findings', () => {
    const content = overview(
      ['```mermaid', 'flowchart LR', '  A --> B', '```', '_Общая композиция сервиса._'].join('\n')
    );
    assert.deepStrictEqual(checkDiagramCaptions(SPEC_FILE, content), []);
  });

  it('caption citing a requirement ID this spec does not declare → SDD_DIAGRAM_CAPTION_REQ_UNKNOWN', () => {
    const content =
      newFormatRequirements() +
      '\n' +
      overview(
        ['```mermaid', 'flowchart LR', '  A --> B', '```', '_Поток данных для IC-REQ-9._'].join(
          '\n'
        )
      );
    const findings = checkDiagramCaptions(SPEC_FILE, content);
    const unknown = findings.find((f) => f.code === 'SDD_DIAGRAM_CAPTION_REQ_UNKNOWN');
    assert.ok(unknown, 'expected SDD_DIAGRAM_CAPTION_REQ_UNKNOWN');
    assert.strictEqual(unknown?.severity, 'error'); // new format
    assert.match(unknown?.message ?? '', /IC-REQ-9/);
  });

  it('caption citing a requirement ID this spec does declare → no findings', () => {
    const content =
      newFormatRequirements() +
      '\n' +
      overview(
        ['```mermaid', 'flowchart LR', '  A --> B', '```', '_Поток данных для IC-REQ-1._'].join(
          '\n'
        )
      );
    assert.deepStrictEqual(checkDiagramCaptions(SPEC_FILE, content), []);
  });

  it('bare ASCII fence (no mermaid tag) inside OVERVIEW is treated as a diagram too', () => {
    const content = overview(['```', 'A -> B -> C', '```'].join('\n'));
    const findings = checkDiagramCaptions(SPEC_FILE, content);
    assert.strictEqual(findings[0]?.code, 'SDD_DIAGRAM_CAPTION_MISSING');
  });

  it('a fenced block outside a diagram-bearing section is not gated (avoids painting code samples)', () => {
    const content = [
      '<!--SECTION:MODULE_USAGE_EXAMPLE-->',
      '## Module Usage Example',
      '',
      '```bash',
      '$ npx gennady sdd-check --all .',
      '```',
      '<!--/SECTION:MODULE_USAGE_EXAMPLE-->',
    ].join('\n');
    assert.deepStrictEqual(checkDiagramCaptions(SPEC_FILE, content), []);
  });
});
