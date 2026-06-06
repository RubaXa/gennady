import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { definePromptElement } from '../define-prompt-element.js';
import { PROMPT_ELEMENT_SYMBOL } from '../types.js';
import type { PromptElement } from '../types.js';

describe('definePromptElement', () => {
  it('brand symbol present', async () => {
    const el = definePromptElement({ role: 'section' });

    assert.strictEqual(el[PROMPT_ELEMENT_SYMBOL], true);
    assert.strictEqual(typeof el.tagName, 'string');
    assert.ok(el.config.role === 'section');
  });

  it('derives kebab-case tag name from role', async () => {
    const el = definePromptElement({ role: 'section' }) as PromptElement;

    assert.strictEqual(el.tagName, 'section');
    assert.strictEqual(definePromptElement({ role: 'section' }).tagName, 'section');
  });

  it('preserves config including markdown and xml options', async () => {
    const el = definePromptElement({
      role: 'block',
      markdown: { lang: 'ts', wrapper: '`' },
      xml: { tag: 'code-block' },
    });

    assert.strictEqual(el.config.role, 'block');
    assert.strictEqual(el.config.markdown?.lang, 'ts');
    assert.strictEqual(el.config.markdown?.wrapper, '`');
    assert.strictEqual(el.config.xml?.tag, 'code-block');
  });

  it('returns distinct objects for each call', async () => {
    const a = definePromptElement({ role: 'section' });
    const b = definePromptElement({ role: 'section' });

    assert.notStrictEqual(a, b);
  });
});
