import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HTMLTagRegistry } from '../html-tag-registry.js';
import type { HtmlTagRenderer } from '../types.js';

function noopRenderer(): HtmlTagRenderer {
  return (_ctx, _children, _props, walk) => walk(_children, _ctx);
}

describe('HTMLTagRegistry', () => {
  describe('auto-fill on import', () => {
    const tags = ['b', 'em', 'i', 'u', 'strong', 'p', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];

    const registry = new HTMLTagRegistry();
    registry.autoFill();

    for (const tag of tags) {
      it(`resolve("${tag}") returns non-null renderer`, async () => {
        const renderer = registry.resolve(tag);
        assert.notStrictEqual(renderer, null);
      });
    }
  });

  describe('register / resolve', () => {
    it('resolve returns null for unknown tag', async () => {
      const registry = new HTMLTagRegistry();

      assert.strictEqual(registry.resolve('nonexistent'), null);
    });

    it('register adds a renderer', async () => {
      const registry = new HTMLTagRegistry();
      const renderer = noopRenderer();
      registry.register('custom-tag', renderer);

      assert.strictEqual(registry.resolve('custom-tag'), renderer);
    });

    it('re-registration overwrites previous renderer', async () => {
      const registry = new HTMLTagRegistry();
      const fn1 = noopRenderer();
      const fn2 = noopRenderer();
      registry.register('b', fn1);
      registry.register('b', fn2);

      assert.strictEqual(registry.resolve('b'), fn2);
    });
  });
});
