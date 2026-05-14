import { beforeEach, describe, it } from 'node:test';

import { DbcJsDocParser } from '../dbc-jsdoc-parser.ts';
import '#snapshot-path-setup';

/**
 * DbcJsDocParser Descriptions Test Graph:
 * └── parse()
 *     ├── should collect text before first tag into description entry
 *     ├── should parse explicit description tag as description entry
 *     ├── should append multiline value to the previous tag entry
 *     └── should append multiline content to param value
 */
describe('DbcJsDocParser', () => {
  let parser: DbcJsDocParser;

  beforeEach(() => {
    // START_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
    parser = new DbcJsDocParser();
    // END_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
  });

  describe('parse()', () => {
    it('should push description buffer at end-of-file when no tags follow', (t) => {
      // START_PARSE_DESCRIPTION_ONLY_ARRANGE_INPUT
      const inputContract = ['First line of docs.', 'Second line of docs.'].join('\n');
      // END_PARSE_DESCRIPTION_ONLY_ARRANGE_INPUT

      // START_PARSE_DESCRIPTION_ONLY_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_DESCRIPTION_ONLY_ACT

      // START_PARSE_DESCRIPTION_ONLY_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_DESCRIPTION_ONLY_ASSERT
    });

    it('should collect text before first tag into description entry', (t) => {
      // START_PARSE_TEXT_BEFORE_TAG_ARRANGE_INPUT
      const inputContract = [
        'First line of docs.',
        'Second line of docs.',
        '@consumer MainApp',
      ].join('\n');
      // END_PARSE_TEXT_BEFORE_TAG_ARRANGE_INPUT

      // START_PARSE_TEXT_BEFORE_TAG_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_TEXT_BEFORE_TAG_ACT

      // START_PARSE_TEXT_BEFORE_TAG_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_TEXT_BEFORE_TAG_ASSERT
    });

    it('should parse explicit description tag as description entry', (t) => {
      // START_PARSE_EXPLICIT_DESCRIPTION_ARRANGE_INPUT
      const inputContract = '@description My info';
      // END_PARSE_EXPLICIT_DESCRIPTION_ARRANGE_INPUT

      // START_PARSE_EXPLICIT_DESCRIPTION_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_EXPLICIT_DESCRIPTION_ACT

      // START_PARSE_EXPLICIT_DESCRIPTION_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_EXPLICIT_DESCRIPTION_ASSERT
    });

    it('should append multiline value to the previous tag entry', (t) => {
      // START_PARSE_MULTILINE_TAG_VALUE_ARRANGE_INPUT
      const inputContract = [
        '@purpose Main behavior.',
        'Second line of behavior.',
        'Third line of behavior.',
      ].join('\n');
      // END_PARSE_MULTILINE_TAG_VALUE_ARRANGE_INPUT

      // START_PARSE_MULTILINE_TAG_VALUE_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_MULTILINE_TAG_VALUE_ACT

      // START_PARSE_MULTILINE_TAG_VALUE_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_MULTILINE_TAG_VALUE_ASSERT
    });

    it('should append multiline content to param value', (t) => {
      // START_PARSE_MULTILINE_PARAM_ARRANGE_INPUT
      const inputContract = [
        '@param {object} [options] Optional settings.',
        'These settings can span multiple lines.',
      ].join('\n');
      // END_PARSE_MULTILINE_PARAM_ARRANGE_INPUT

      // START_PARSE_MULTILINE_PARAM_ACT
      const schema = parser.parse(inputContract);
      // END_PARSE_MULTILINE_PARAM_ACT

      // START_PARSE_MULTILINE_PARAM_ASSERT
      t.assert.snapshot(schema);
      // END_PARSE_MULTILINE_PARAM_ASSERT
    });
  });
});
