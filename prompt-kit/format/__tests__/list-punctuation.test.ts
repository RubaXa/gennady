// @file: Unit tests for ListPunctuation — appends ; or . to list items, skipping terminal marks
// @consumers: format module QA
// @tasks: TSK-63

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ListPunctuation } from '../list-punctuation.js';

describe('ListPunctuation', () => {
  describe('#punctuate', () => {
    it('should append a dot to the last item', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('foo', true), 'foo.');
    });

    it('should append a semicolon to a non-last item', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('foo', false), 'foo;');
    });

    it('should skip punctuation when text ends with a dot', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('bar.', false), 'bar.');
      assert.strictEqual(lp.punctuate('bar.', true), 'bar.');
    });

    it('should skip punctuation when text ends with an exclamation mark', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('wow!', false), 'wow!');
    });

    it('should skip punctuation when text ends with a question mark', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('what?', false), 'what?');
    });

    it('should skip punctuation when text ends with a semicolon', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('done;', false), 'done;');
    });

    it('should return empty string unchanged', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('', true), '');
      assert.strictEqual(lp.punctuate('', false), '');
    });

    it('should add punctuation for text ending with a non-terminal character', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('alpha', true), 'alpha.');
      assert.strictEqual(lp.punctuate('beta', false), 'beta;');
    });

    it('should treat whitespace before terminal mark as still needing punctuation', () => {
      const lp = new ListPunctuation();
      assert.strictEqual(lp.punctuate('text ', true), 'text .');
    });
  });
});
