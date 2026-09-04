// @file: Unit tests for checkSpecMermaid — real mermaid-parser validation of ```mermaid blocks.
// @consumers: mermaid-check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSpecMermaid } from '../mermaid-check.ts';

describe('checkSpecMermaid', () => {
  it('no mermaid block → no findings (parser never loads)', async () => {
    assert.deepStrictEqual(await checkSpecMermaid('s.md', '# Title\nno diagram here'), []);
  });

  it('a valid mermaid diagram → no findings', async () => {
    const md = '```mermaid\nflowchart LR\n  A --> B\n```';
    assert.deepStrictEqual(await checkSpecMermaid('s.md', md), []);
  });

  it('an invalid mermaid diagram → SDD_DIAGRAM_INVALID (error)', async () => {
    const md = '# Diagram\n\n```mermaid\nflowchart LR\n  A -->|bad(label)| B\n```';
    const findings = await checkSpecMermaid('s.md', md);
    const f = findings.find((x) => x.code === 'SDD_DIAGRAM_INVALID');
    assert.ok(f, 'expected SDD_DIAGRAM_INVALID');
    assert.strictEqual(f?.severity, 'error');
    assert.strictEqual(f?.line, 5);
    assert.match(f?.message ?? '', /near "A -->\|bad\(label\)\| B"/);
    // The error must also carry an actionable recheck list (compiler-style hints), so the model
    // self-corrects from the error alone — no how-to-draw instructions in any directive.
    assert.match(f?.message ?? '', /Топ причин перепроверить/);
    assert.match(f?.message ?? '', /двойных кавычках/);
  });
});
