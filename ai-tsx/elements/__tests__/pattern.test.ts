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

describe('Pattern', () => {
  it('renders pattern in xml', async () => {
    const name = 'pattern-basic';
    const dir = join(fixturesDir, name);
    const expectedXml = loadExpected(join(dir, 'expected.html'));
    // contract: Pattern renders as section in XML with id attribute
    const mod = await import(join(dir, 'input.tsx'));
    const component = mod.default;
    const xmlResult = renderPrompt(component, {}, 'xml');
    assert.strictEqual(xmlResult, expectedXml);
  });

  it('renders pattern in md', async () => {
    const name = 'pattern-basic';
    const dir = join(fixturesDir, name);
    const expectedMd = loadExpected(join(dir, 'expected.md'));
    // contract: Pattern renders as section in MD with boundary comments
    // invariant: START_PATTERN / END_PATTERN anchors enclose heading + content
    const mod = await import(join(dir, 'input.tsx'));
    const component = mod.default;
    const mdResult = renderPrompt(component, {}, 'md');
    assert.strictEqual(mdResult, expectedMd);
  });
});
