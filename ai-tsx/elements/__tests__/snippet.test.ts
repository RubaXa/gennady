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

describe('Snippet', () => {
  it('renders snippet in xml', async () => {
    const name = 'snippet-code';
    const dir = join(fixturesDir, name);
    const expectedXml = loadExpected(join(dir, 'expected.html'));
    // contract: Snippet renders as block in XML with language attribute, inline content
    const mod = await import(join(dir, 'input.tsx'));
    const component = mod.default;
    const xmlResult = renderPrompt(component, {}, 'xml');
    assert.strictEqual(xmlResult, expectedXml);
  });

  it('renders snippet in md', async () => {
    const name = 'snippet-code';
    const dir = join(fixturesDir, name);
    const expectedMd = loadExpected(join(dir, 'expected.md'));
    // contract: Snippet renders as fenced code block in MD
    // invariant: language prop not used for fence — element.config.markdown.lang is undefined
    const mod = await import(join(dir, 'input.tsx'));
    const component = mod.default;
    const mdResult = renderPrompt(component, {}, 'md');
    assert.strictEqual(mdResult, expectedMd);
  });

  it('renders snippet without language', async () => {
    const name = 'snippet-no-lang';
    const dir = join(fixturesDir, name);
    const expectedXml = loadExpected(join(dir, 'expected.html'));
    const expectedMd = loadExpected(join(dir, 'expected.md'));
    // contract: Snippet without language prop omits attribute in XML and uses bare fence in MD
    const mod = await import(join(dir, 'input.tsx'));
    const component = mod.default;
    const xmlResult = renderPrompt(component, {}, 'xml');
    assert.strictEqual(xmlResult, expectedXml);
    const mdResult = renderPrompt(component, {}, 'md');
    assert.strictEqual(mdResult, expectedMd);
  });
});
