import { beforeEach, describe, it } from 'node:test';

import { DbcJsDocParser } from '../dbc-jsdoc-parser.ts';
import '#snapshot-path-setup';

/**
 * DbcJsDocParser Syntax Test Graph:
 * └── parse()
 *     ├── should parse classic JSDoc block with leading stars
 *     ├── should parse plain text contract without JSDoc framing
 *     ├── should parse one-line JSDoc contract
 *     ├── should detect single-line format for inline contract text
 *     ├── should detect multi-line format for block contract text
 *     └── should parse inline tags from pipe-delimited single-line contract
 */
describe('DbcJsDocParser', () => {
  let parser: DbcJsDocParser;

  beforeEach(() => {
    // START_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
    parser = new DbcJsDocParser();
    // END_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
  });

  describe('parse()', () => {
    it('should parse classic JSDoc block with leading stars', (t) => {
      // START_PARSE_CLASSIC_JSDOC_ARRANGE_INPUT
      const inputContract = [
        '/**',
        ' * A very important function.',
        ' * @consumer MainApp',
        ' * @invariant Must be called after initialization.',
        ' * @param {string} userId The ID of the user to process.',
        ' * @param {object} [options] Optional settings.',
        ' *   These settings can span multiple lines.',
        ' * @returns {boolean} True on success.',
        ' * @sideEffect Writes data to the database.',
        ' */',
      ].join('\n');
      // END_PARSE_CLASSIC_JSDOC_ARRANGE_INPUT

      // START_PARSE_CLASSIC_JSDOC_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_CLASSIC_JSDOC_ACT

      // START_PARSE_CLASSIC_JSDOC_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_CLASSIC_JSDOC_ASSERT
    });

    it('should parse plain text contract without JSDoc framing', (t) => {
      // START_PARSE_PLAIN_TEXT_ARRANGE_INPUT
      const inputContract = [
        'A very important function.',
        '@consumer MainApp',
        '@invariant Must be called after initialization.',
        '@param {string} userId The ID of the user to process.',
        '@param {object} [options] Optional settings.',
        'These settings can span multiple lines.',
        '@returns {boolean} True on success.',
        '@sideEffect Writes data to the database.',
      ].join('\n');
      // END_PARSE_PLAIN_TEXT_ARRANGE_INPUT

      // START_PARSE_PLAIN_TEXT_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_PLAIN_TEXT_ACT

      // START_PARSE_PLAIN_TEXT_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_PLAIN_TEXT_ASSERT
    });

    it('should parse one-line JSDoc contract', (t) => {
      // START_PARSE_ONE_LINE_ARRANGE_INPUT
      const inputContract = '/** @purpose Simple description */';
      // END_PARSE_ONE_LINE_ARRANGE_INPUT

      // START_PARSE_ONE_LINE_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_ONE_LINE_ACT

      // START_PARSE_ONE_LINE_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_ONE_LINE_ASSERT
    });

    it('should detect single-line format for inline contract text', (t) => {
      // START_DETECT_SINGLE_LINE_FORMAT_ARRANGE_INPUT
      const inputContract = '@param {string} name The user name';
      // END_DETECT_SINGLE_LINE_FORMAT_ARRANGE_INPUT

      // START_DETECT_SINGLE_LINE_FORMAT_ACT
      const schema = parser.parse(inputContract);
      // END_DETECT_SINGLE_LINE_FORMAT_ACT

      // START_DETECT_SINGLE_LINE_FORMAT_ASSERT
      t.assert.strictEqual(schema.format, 'single-line');
      // END_DETECT_SINGLE_LINE_FORMAT_ASSERT
    });

    it('should detect multi-line format for block contract text', (t) => {
      // START_DETECT_MULTI_LINE_FORMAT_ARRANGE_INPUT
      const inputContract = ['@purpose Main behavior.', '@param {string} name The user name'].join(
        '\n'
      );
      // END_DETECT_MULTI_LINE_FORMAT_ARRANGE_INPUT

      // START_DETECT_MULTI_LINE_FORMAT_ACT
      const schema = parser.parse(inputContract);
      // END_DETECT_MULTI_LINE_FORMAT_ACT

      // START_DETECT_MULTI_LINE_FORMAT_ASSERT
      t.assert.strictEqual(schema.format, 'multi-line');
      // END_DETECT_MULTI_LINE_FORMAT_ASSERT
    });

    it('should parse inline tags from pipe-delimited single-line contract', (t) => {
      // START_PARSE_INLINE_TAGS_ARRANGE_INPUT
      const inputContract = '/** @purpose Main description | @invariant Must be stable */';
      // END_PARSE_INLINE_TAGS_ARRANGE_INPUT

      // START_PARSE_INLINE_TAGS_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_INLINE_TAGS_ACT

      // START_PARSE_INLINE_TAGS_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_INLINE_TAGS_ASSERT
    });
  });
});
