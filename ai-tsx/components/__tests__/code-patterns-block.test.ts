// @file: CodePatternsBlock unit tests — fixture-driven XML rendering.
// @consumers: ai-tsx directives
// @tasks: TSK-75

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPrompt } from '../../../prompt-kit/core/render-prompt.js';
import { CodePatternsBlock } from '../code-patterns-block.js';

const fixturesDir = join(import.meta.dirname ?? __dirname, 'fixtures');

function loadExpected(path: string): string {
  return readFileSync(path, 'utf8').replace(/\n+$/, '');
}

describe('CodePatternsBlock', () => {
  it('renders code-patterns-block with children', async () => {
    const dir = join(fixturesDir, 'code-patterns-block');
    const expectedHtml = loadExpected(join(dir, 'expected.html'));
    const mod = await import(join(dir, 'input.tsx'));
    const html = renderPrompt(mod.default, {}, 'xml');
    assert.strictEqual(html, expectedHtml);
  });

  it('empty block renders opening + closing tag', () => {
    const expectedHtml = '<CodePatterns></CodePatterns>';
    const tree = CodePatternsBlock({ children: undefined });
    const html = renderPrompt(tree, {}, 'xml');
    assert.strictEqual(html, expectedHtml);
  });
});
