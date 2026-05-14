import { beforeEach, describe, it } from 'node:test';

import { DbcJsDocParser } from '../dbc-jsdoc-parser.ts';
import '#snapshot-path-setup';

/**
 * DbcJsDocParser Edge Cases Test Graph:
 * └── parse()
 *     ├── should return empty schema for empty input
 *     ├── should skip malformed empty tag line without creating orphan multiline value
 *     ├── should parse contract with extreme spaces and tabs
 *     ├── should ignore empty normalized lines inside jsdoc block
 *     └── should keep unknown tags out of contract-specific issues
 */
describe('DbcJsDocParser', () => {
  let parser: DbcJsDocParser;

  beforeEach(() => {
    // START_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
    parser = new DbcJsDocParser();
    // END_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
  });

  describe('parse()', () => {
    it('should return empty schema for empty input', (t) => {
      // START_PARSE_EMPTY_INPUT_ARRANGE_INPUT
      const inputContract = '   \n\t  \n';
      // END_PARSE_EMPTY_INPUT_ARRANGE_INPUT

      // START_PARSE_EMPTY_INPUT_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_EMPTY_INPUT_ACT

      // START_PARSE_EMPTY_INPUT_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_EMPTY_INPUT_ASSERT
    });

    it('should skip malformed empty tag line without creating orphan multiline value', (t) => {
      // START_PARSE_MALFORMED_EMPTY_TAG_ARRANGE_INPUT
      const inputContract = ['@', 'orphan continuation text'].join('\n');
      // END_PARSE_MALFORMED_EMPTY_TAG_ARRANGE_INPUT

      // START_PARSE_MALFORMED_EMPTY_TAG_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_MALFORMED_EMPTY_TAG_ACT

      // START_PARSE_MALFORMED_EMPTY_TAG_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_MALFORMED_EMPTY_TAG_ASSERT
    });

    it('should parse contract with extreme spaces and tabs', (t) => {
      // START_PARSE_SPACES_TABS_ARRANGE_INPUT
      const inputContract = [
        '   @param    {string}    userId\t\tUser identifier',
        '\t@returns   {boolean}\t   True on success.',
      ].join('\n');
      // END_PARSE_SPACES_TABS_ARRANGE_INPUT

      // START_PARSE_SPACES_TABS_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_SPACES_TABS_ACT

      // START_PARSE_SPACES_TABS_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_SPACES_TABS_ASSERT
    });

    it('should ignore empty normalized lines inside jsdoc block', (t) => {
      // START_PARSE_EMPTY_NORMALIZED_LINES_ARRANGE_INPUT
      const inputContract = ['/**', ' *', ' * @consumer MainApp', ' *', ' */'].join('\n');
      // END_PARSE_EMPTY_NORMALIZED_LINES_ARRANGE_INPUT

      // START_PARSE_EMPTY_NORMALIZED_LINES_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_EMPTY_NORMALIZED_LINES_ACT

      // START_PARSE_EMPTY_NORMALIZED_LINES_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_EMPTY_NORMALIZED_LINES_ASSERT
    });

    it('should parse tag line that ends with closing JSDoc marker', (t) => {
      // START_PARSE_TAG_LINE_WITH_END_MARKER_ARRANGE_INPUT
      const inputContract = ['/**', ' * @purpose Simple description */', ' */'].join('\n');
      // END_PARSE_TAG_LINE_WITH_END_MARKER_ARRANGE_INPUT

      // START_PARSE_TAG_LINE_WITH_END_MARKER_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_TAG_LINE_WITH_END_MARKER_ACT

      // START_PARSE_TAG_LINE_WITH_END_MARKER_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_TAG_LINE_WITH_END_MARKER_ASSERT
    });

    it('should parse tag with no trailing value', (t) => {
      // START_PARSE_TAG_NO_VALUE_ARRANGE_INPUT
      const inputContract = '@consumer';
      // END_PARSE_TAG_NO_VALUE_ARRANGE_INPUT

      // START_PARSE_TAG_NO_VALUE_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_TAG_NO_VALUE_ACT

      // START_PARSE_TAG_NO_VALUE_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_TAG_NO_VALUE_ASSERT
    });

    it('should keep unknown tags out of contract-specific issues', (t) => {
      // START_PARSE_UNKNOWN_TAG_ISSUES_ARRANGE_INPUT
      const inputContract = ['@version 1.2.3', '@deprecated Use v2'].join('\n');
      // END_PARSE_UNKNOWN_TAG_ISSUES_ARRANGE_INPUT

      // START_PARSE_UNKNOWN_TAG_ISSUES_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_UNKNOWN_TAG_ISSUES_ACT

      // START_PARSE_UNKNOWN_TAG_ISSUES_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_UNKNOWN_TAG_ISSUES_ASSERT
    });
  });
});
