import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ElementResolver } from '../element-resolver.js';
import { definePromptElement } from '../define-prompt-element.js';

describe('ElementResolver', () => {
  const resolver = new ElementResolver();

  describe('prompt-element', () => {
    it('detects via brand symbol', async () => {
      const el = definePromptElement({ role: 'section' });

      const category = resolver.resolve(el);
      assert.strictEqual(category, 'prompt-element');
    });
  });

  describe('html-tag', () => {
    it('classifies string type as html-tag', async () => {
      assert.strictEqual(resolver.resolve('b'), 'html-tag');
    });

    it('classifies table string as html-tag', async () => {
      assert.strictEqual(resolver.resolve('table'), 'html-tag');
    });
  });

  describe('transparent', () => {
    it('classifies function without brand as transparent', async () => {
      const fn = () => {};

      assert.strictEqual(resolver.resolve(fn), 'transparent');
    });
  });

  describe('skip', () => {
    it('classifies null as skip', async () => {
      assert.strictEqual(resolver.resolve(null), 'skip');
    });

    it('classifies undefined as skip', async () => {
      assert.strictEqual(resolver.resolve(undefined), 'skip');
    });
  });

  describe('error on unknown', () => {
    it('throws on number type', async () => {
      assert.throws(
        () => resolver.resolve(42),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match((err as Error).message, /\[ElementResolver#resolve\] unknown element type/);
          return true;
        }
      );
    });

    it('throws on boolean type', async () => {
      assert.throws(
        () => resolver.resolve(true),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match((err as Error).message, /\[ElementResolver#resolve\] unknown element type/);
          return true;
        }
      );
    });
  });
});
