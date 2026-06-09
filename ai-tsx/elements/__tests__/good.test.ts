import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPrompt } from '../../../prompt-kit/core/render-prompt.js';

const fixturesDir = join(import.meta.dirname ?? __dirname, 'fixtures');

function loadExpected(path: string): string {
  const raw = readFileSync(path, 'utf8');
  return raw.replace(/\n+$/, '');
}

describe('Good', () => {
  it('renders good in xml', async () => {
    const name = 'good-code';
    const dir = join(fixturesDir, name);
    const expectedXml = loadExpected(join(dir, 'expected.html'));
    // contract: Good renders as block in XML with language attribute, inline content
    const mod = await import(join(dir, 'input.tsx'));
    const component = mod.default;
    const xmlResult = renderPrompt(component, {}, 'xml');
    assert.strictEqual(xmlResult, expectedXml);
  });

  it('renders good in md', async () => {
    const name = 'good-code';
    const dir = join(fixturesDir, name);
    const expectedMd = loadExpected(join(dir, 'expected.md'));
    // contract: Good renders as fenced code block in MD
    // invariant: language prop not used for fence — element.config.markdown.lang is undefined
    const mod = await import(join(dir, 'input.tsx'));
    const component = mod.default;
    const mdResult = renderPrompt(component, {}, 'md');
    assert.strictEqual(mdResult, expectedMd);
  });
});
