import { beforeEach, describe, it } from 'node:test';

import { DbcJsDocParser } from '../dbc-jsdoc-parser.ts';
import '#snapshot-path-setup';

/**
 * DbcJsDocParser Fields Test Graph:
 * └── parse()
 *     ├── should parse full param structure with datatype and specifier
 *     ├── should parse optional param with optional flag
 *     ├── should parse see tag with specifier and trailing value
 *     ├── should parse implements tag with specifier and trailing value
 *     ├── should parse unknown tag by generic rule
 *     └── should parse returns tag with datatype
 */
describe('DbcJsDocParser', () => {
  let parser: DbcJsDocParser;

  beforeEach(() => {
    // START_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
    parser = new DbcJsDocParser();
    // END_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
  });

  describe('parse()', () => {
    it('should parse full param structure with datatype and specifier', (t) => {
      // START_PARSE_PARAM_FULL_ARRANGE_INPUT
      const inputContract = '@param {string} userId User identifier';
      // END_PARSE_PARAM_FULL_ARRANGE_INPUT

      // START_PARSE_PARAM_FULL_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_PARAM_FULL_ACT

      // START_PARSE_PARAM_FULL_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_PARAM_FULL_ASSERT
    });

    it('should parse optional param with optional flag', (t) => {
      // START_PARSE_PARAM_OPTIONAL_ARRANGE_INPUT
      const inputContract = '@param {number} [age] User age';
      // END_PARSE_PARAM_OPTIONAL_ARRANGE_INPUT

      // START_PARSE_PARAM_OPTIONAL_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_PARAM_OPTIONAL_ACT

      // START_PARSE_PARAM_OPTIONAL_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_PARAM_OPTIONAL_ASSERT
    });

    it('should parse see tag with specifier and trailing value', (t) => {
      // START_PARSE_SEE_ARRANGE_INPUT
      const inputContract = '@see {Interface#method} in ./path';
      // END_PARSE_SEE_ARRANGE_INPUT

      // START_PARSE_SEE_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_SEE_ACT

      // START_PARSE_SEE_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_SEE_ASSERT
    });

    it('should parse implements tag with specifier and trailing value', (t) => {
      // START_PARSE_IMPLEMENTS_ARRANGE_INPUT
      const inputContract = '@implements {VendorGateway} in src/domain/contracts/VendorGateway.ts';
      // END_PARSE_IMPLEMENTS_ARRANGE_INPUT

      // START_PARSE_IMPLEMENTS_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_IMPLEMENTS_ACT

      // START_PARSE_IMPLEMENTS_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_IMPLEMENTS_ASSERT
    });

    it('should parse unknown tag by generic rule', (t) => {
      // START_PARSE_UNKNOWN_TAG_ARRANGE_INPUT
      const inputContract = '@author John Doe';
      // END_PARSE_UNKNOWN_TAG_ARRANGE_INPUT

      // START_PARSE_UNKNOWN_TAG_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_UNKNOWN_TAG_ACT

      // START_PARSE_UNKNOWN_TAG_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_UNKNOWN_TAG_ASSERT
    });

    it('should parse returns tag with datatype', (t) => {
      // START_PARSE_RETURNS_ARRANGE_INPUT
      const inputContract = '@returns {boolean} True on success.';
      // END_PARSE_RETURNS_ARRANGE_INPUT

      // START_PARSE_RETURNS_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_RETURNS_ACT

      // START_PARSE_RETURNS_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_RETURNS_ASSERT
    });

    it('should parse returns tag without datatype', (t) => {
      // START_PARSE_RETURNS_NO_DATATYPE_ARRANGE_INPUT
      const inputContract = '@returns description without type';
      // END_PARSE_RETURNS_NO_DATATYPE_ARRANGE_INPUT

      // START_PARSE_RETURNS_NO_DATATYPE_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_RETURNS_NO_DATATYPE_ACT

      // START_PARSE_RETURNS_NO_DATATYPE_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_RETURNS_NO_DATATYPE_ASSERT
    });

    it('should parse param tag without datatype', (t) => {
      // START_PARSE_PARAM_NO_DATATYPE_ARRANGE_INPUT
      const inputContract = '@param userId User identifier';
      // END_PARSE_PARAM_NO_DATATYPE_ARRANGE_INPUT

      // START_PARSE_PARAM_NO_DATATYPE_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_PARAM_NO_DATATYPE_ACT

      // START_PARSE_PARAM_NO_DATATYPE_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_PARAM_NO_DATATYPE_ASSERT
    });

    it('should parse throws tag with datatype', (t) => {
      // START_PARSE_THROWS_ARRANGE_INPUT
      const inputContract = '@throws {Error} On invalid input';
      // END_PARSE_THROWS_ARRANGE_INPUT

      // START_PARSE_THROWS_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_THROWS_ACT

      // START_PARSE_THROWS_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_THROWS_ASSERT
    });

    it('should parse implements tag without specifier', (t) => {
      // START_PARSE_IMPLEMENTS_NO_SPEC_ARRANGE_INPUT
      const inputContract = '@implements VendorGateway';
      // END_PARSE_IMPLEMENTS_NO_SPEC_ARRANGE_INPUT

      // START_PARSE_IMPLEMENTS_NO_SPEC_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_IMPLEMENTS_NO_SPEC_ACT

      // START_PARSE_IMPLEMENTS_NO_SPEC_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_IMPLEMENTS_NO_SPEC_ASSERT
    });
  });
});
