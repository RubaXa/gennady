// @file: AntiPatternsBlock unit tests — fixture-driven XML rendering.
// @consumers: ai-tsx directives
// @tasks: TSK-75

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPrompt } from '../../../prompt-kit/core/render-prompt.js';
import { AntiPatternsBlock } from '../anti-patterns-block.js';

const fixturesDir = join(import.meta.dirname ?? __dirname, 'fixtures');

function load(path: string): string {
  return readFileSync(path, 'utf8').replace(/\n+$/, '');
}

describe('AntiPatternsBlock', () => {
  it('renders anti-patterns-block with children', async () => {
    const dir = join(fixturesDir, 'anti-patterns-block');
    const expected = load(join(dir, 'expected.html'));
    const mod = await import(join(dir, 'input.tsx'));
    const html = renderPrompt(mod.default, {}, 'xml');
    assert.strictEqual(html, expected);
  });
});
