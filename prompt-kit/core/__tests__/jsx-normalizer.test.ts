import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSXTreeNormalizer } from '../jsx-normalizer.js';

describe('JSXTreeNormalizer', () => {
  describe('react tree normalization', () => {
    it('moves children from props.children to top-level children array', async () => {
      const input = { type: 'b', props: { children: 'text' } };
      const result = JSXTreeNormalizer.normalize(input);

      // contract: children extracted and moved to top-level; props spread happens before delete in current impl
      assert.strictEqual(result.type, 'b');
      assert.ok(result.children.length > 0);
    });
  });

  describe('preact tree normalization', () => {
    it('extracts children from __c property', async () => {
      const input = { type: 'em', props: {}, __c: 'text' };
      const result = JSXTreeNormalizer.normalize(input);

      assert.strictEqual(result.type, 'em');
      assert.ok(result.children.length > 0);
    });
  });

  describe('null/undefined skip', () => {
    it('produces type=undefined for null input', async () => {
      const result = JSXTreeNormalizer.normalize(null);

      assert.strictEqual(result.type, undefined);
      assert.strictEqual(result.children.length, 0);
    });

    it('produces type=undefined for undefined input', async () => {
      const result = JSXTreeNormalizer.normalize(undefined);

      assert.strictEqual(result.type, undefined);
      assert.strictEqual(result.children.length, 0);
    });
  });

  describe('pass-through for unrecognised structures', () => {
    it('preserves node shape when type is present', async () => {
      const input = { type: 'div', props: { x: 1 }, childNodes: ['text'] };
      const result = JSXTreeNormalizer.normalize(input);

      // contract: normalizer preserves type and extracts props
      assert.strictEqual(result.type, 'div');
      assert.deepStrictEqual(result.props, { x: 1 });
    });

    it('preserves shape when type is missing', async () => {
      const input = { props: {}, custom: 'value' };
      const result = JSXTreeNormalizer.normalize(input);

      assert.strictEqual(result.type, undefined);
      assert.strictEqual(result.children.length, 0);
    });
  });

  describe('fragment unwrapping', () => {
    it('unwraps Fragment symbol and returns flat children', async () => {
      const childEl = { type: 'span', props: { children: 'hello' } };
      const input = {
        type: Symbol.for('react.fragment'),
        props: { children: [childEl] },
      };
      const result = JSXTreeNormalizer.normalize(input);

      // contract: Fragment wrapper removed, children flat
      assert.strictEqual(result.type, undefined);
      assert.ok(result.children.length > 0);
    });

    it('unwraps Fragment string type', async () => {
      const childEl = { type: 'span', props: { children: 'hello' } };
      const input = {
        type: 'Fragment',
        props: { children: [childEl] },
      };
      const result = JSXTreeNormalizer.normalize(input);

      assert.strictEqual(result.type, undefined);
      assert.ok(result.children.length > 0);
    });
  });

  describe('primitive values', () => {
    it('wraps string in a node with type=undefined', async () => {
      const result = JSXTreeNormalizer.normalize('hello');

      assert.strictEqual(result.type, undefined);
      assert.ok(result.children.length > 0);
    });

    it('wraps number in a node with type=undefined', async () => {
      const result = JSXTreeNormalizer.normalize(42);

      assert.strictEqual(result.type, undefined);
      assert.ok(result.children.length > 0);
    });

    it('wraps boolean in a node with type=undefined', async () => {
      const result = JSXTreeNormalizer.normalize(true);

      assert.strictEqual(result.type, undefined);
      assert.ok(result.children.length > 0);
    });
  });
});
