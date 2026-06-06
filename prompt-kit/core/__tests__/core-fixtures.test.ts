import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPrompt } from '../render-prompt.js';

const fixturesDir = join(import.meta.dirname ?? __dirname, 'fixtures');

const fixtureNames = [
  'transparent-component',
  'custom-element',
  'custom-element-props',
  'react-tree',
  'preact-tree',
  'mixed-builtin-custom',
  'fragment-tree',
  'unknown-format',
  'html-tag-b',
  'html-tag-em',
  'html-tag-table',
  'html-tag-p',
];

function loadExpected(path: string): string {
  const raw = readFileSync(path, 'utf8');
  return raw.replace(/\n+$/, '');
}

function loadFixture(name: string) {
  const dir = join(fixturesDir, name);
  const input = readFileSync(join(dir, 'input.tsx'), 'utf8');
  const expectedXml = loadExpected(join(dir, 'expected.xml'));
  const expectedMd = loadExpected(join(dir, 'expected.md'));
  return { input, expectedXml, expectedMd };
}

describe('core fixtures — renderPrompt end-to-end', () => {
  for (const name of fixtureNames) {
    it(name, async () => {
      const { expectedXml, expectedMd } = loadFixture(name);
      // contract: fixture input.tsx is imported dynamically and rendered in both formats
      // Dynamic import to load the TSX module
      const mod = await import(join(fixturesDir, name, 'input.tsx'));
      const component = mod.default;

      // #region START_FIXTURE_RENDER_XML
      const xmlResult = renderPrompt(component, {}, 'xml');
      assert.strictEqual(xmlResult, expectedXml);
      // #endregion END_FIXTURE_RENDER_XML

      // #region START_FIXTURE_RENDER_MD
      const mdResult = renderPrompt(component, {}, 'md');
      assert.strictEqual(mdResult, expectedMd);
      // #endregion END_FIXTURE_RENDER_MD
    });
  }
});
