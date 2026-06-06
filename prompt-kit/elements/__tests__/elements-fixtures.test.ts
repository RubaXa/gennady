import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPrompt } from '../../core/render-prompt.js';

const fixturesDir = join(import.meta.dirname ?? __dirname, 'fixtures');

const fixtureNames = [
  'prompt-basic',
  'prompt-no-keywords',
  'primary-goal',
  'belief-state',
  'axiom',
  'hard-forbidden',
  'section-basic',
  'section-with-id',
  'list-ordered',
  'list-unordered',
  'list-title',
  'code-basic',
  'code-with-title',
  'bold',
  'ai-knowledge',
];

function loadExpected(path: string): string {
  const raw = readFileSync(path, 'utf8');
  return raw.replace(/\n+$/, '');
}

function loadFixture(name: string) {
  const dir = join(fixturesDir, name);
  const expectedXml = loadExpected(join(dir, 'expected.xml'));
  const expectedMd = loadExpected(join(dir, 'expected.md'));
  return { expectedXml, expectedMd };
}

describe('elements fixtures', () => {
  for (const name of fixtureNames) {
    it(name, async () => {
      const { expectedXml, expectedMd } = loadFixture(name);
      // contract: fixture input.tsx is imported and rendered in both formats

      const mod = await import(join(fixturesDir, name, 'input.tsx'));
      const component = mod.default;
      const props = mod.data || {};

      // #region START_FIXTURE_RENDER_XML
      const xmlResult = renderPrompt(component, props, 'xml');
      assert.strictEqual(xmlResult, expectedXml);
      // #endregion END_FIXTURE_RENDER_XML

      // #region START_FIXTURE_RENDER_MD
      const mdResult = renderPrompt(component, props, 'md');
      assert.strictEqual(mdResult, expectedMd);
      // #endregion END_FIXTURE_RENDER_MD
    });
  }
});
