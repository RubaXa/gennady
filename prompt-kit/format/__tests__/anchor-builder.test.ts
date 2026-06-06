// @file: Unit tests for AnchorBuilder — paired START/END anchor comments with deduplication
// @consumers: format module QA
// @tasks: TSK-63

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnchorBuilder } from '../anchor-builder.js';

describe('AnchorBuilder', () => {
  describe('#buildStart', () => {
    it('should build a basic anchor from tag name and title prop', () => {
      const builder = new AnchorBuilder();
      const result = builder.buildStart('SECTION', { title: 'Foo' });
      assert.strictEqual(result, '<!--START_SECTION_FOO-->');
    });

    it('should build anchor with multiple props sorted by key', () => {
      const builder = new AnchorBuilder();
      const result = builder.buildStart('Axiom', { id: 'AX_1', title: 'Test' });
      // sorted props: id=AX_1, title=Test → SECTION_AX_1_TEST
      assert.strictEqual(result, '<!--START_AXIOM_AX_1_TEST-->');
    });

    it('should convert non-string prop values using String()', () => {
      const builder = new AnchorBuilder();
      const result = builder.buildStart('Rule', { order: 42 });
      assert.strictEqual(result, '<!--START_RULE_42-->');
    });

    it('should return empty string on duplicate call with same parameters', () => {
      const builder = new AnchorBuilder();
      const first = builder.buildStart('Section', { title: 'Dup' });
      assert.strictEqual(first, '<!--START_SECTION_DUP-->');
      const second = builder.buildStart('Section', { title: 'Dup' });
      assert.strictEqual(second, '');
    });

    it('should return empty string when anchor already emitted (first-occurrence wins)', () => {
      // purpose: dedup semantics — second call with same params returns empty
      // failure mode: anchor leak — duplicate anchor id corrupts the document boundary
      const builder = new AnchorBuilder();
      builder.buildStart('Block', { title: 'A' });
      const retry = builder.buildStart('Block', { title: 'A' });
      assert.strictEqual(retry, '');
    });

    it('should allow different props to produce different anchors', () => {
      const builder = new AnchorBuilder();
      assert.strictEqual(
        builder.buildStart('Section', { title: 'Alpha' }),
        '<!--START_SECTION_ALPHA-->'
      );
      assert.strictEqual(
        builder.buildStart('Section', { title: 'Beta' }),
        '<!--START_SECTION_BETA-->'
      );
    });

    it('should produce uppercase anchor names', () => {
      const builder = new AnchorBuilder();
      const result = builder.buildStart('section', { title: 'lowercase' });
      assert.match(result, /^<!--START_/);
      // anchor name is uppercased: SECTION_LOWERCASE
      assert.strictEqual(result, '<!--START_SECTION_LOWERCASE-->');
    });
  });

  describe('#buildEnd', () => {
    it('should build a matching end anchor', () => {
      const builder = new AnchorBuilder();
      assert.strictEqual(builder.buildEnd('SECTION', { title: 'Foo' }), '<!--END_SECTION_FOO-->');
    });

    it('should always return an end anchor regardless of duplication', () => {
      const builder = new AnchorBuilder();
      builder.buildStart('P', { x: '1' });
      builder.buildEnd('P', { x: '1' });
      const endAgain = builder.buildEnd('P', { x: '1' });
      assert.strictEqual(endAgain, '<!--END_P_1-->');
    });
  });
});
