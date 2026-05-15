import { beforeEach, describe, it, type TestContext } from 'node:test';

import { DbcJsDocParser } from '../dbc-jsdoc-parser.ts';
import {
  ERR_DBC_ORDER,
  ERR_DBC_PARAM_NAME_MISSING,
  ERR_DBC_PURPOSE_CONFLICT,
  ERR_DBC_SEE_FORMAT_INVALID,
} from '../../../dbc-parser.types.ts';
import '#snapshot-path-setup';

/**
 * DbcJsDocParser Validation Test Graph:
 * └── parse()
 *     ├── should report purpose and see conflict
 *     ├── should report contract order violation
 *     ├── should report missing param name
 *     ├── should report invalid see format
 *     ├── should accept implements before param and consumer at any position
 *     └── should match the invalid contract example from task spec
 */
describe('DbcJsDocParser', () => {
  let parser: DbcJsDocParser;

  beforeEach(() => {
    // START_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
    parser = new DbcJsDocParser();
    // END_BEFORE_EACH_ARRANGE_SYSTEM_UNDER_TEST
  });

  describe('parse()', () => {
    it('should report purpose and see conflict', (t: TestContext) => {
      // START_VALIDATE_PURPOSE_CONFLICT_ARRANGE_INPUT
      const inputContract = ['@purpose Main behavior.', '@see {ExternalContract#run}'].join('\n');
      // END_VALIDATE_PURPOSE_CONFLICT_ARRANGE_INPUT

      // START_VALIDATE_PURPOSE_CONFLICT_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_PURPOSE_CONFLICT_ACT

      // START_VALIDATE_PURPOSE_CONFLICT_ASSERT
      t.assert.deepStrictEqual(schema.entries[1]?.issues, [
        { code: ERR_DBC_PURPOSE_CONFLICT, line: 2 },
      ]);
      t.assert.snapshot(schema);
      // END_VALIDATE_PURPOSE_CONFLICT_ASSERT
    });

    it('should report purpose and see conflict when see precedes purpose', (t: TestContext) => {
      // START_VALIDATE_PURPOSE_CONFLICT_SEE_FIRST_ARRANGE_INPUT
      const inputContract = ['@see {ExternalContract#run}', '@purpose Main behavior.'].join('\n');
      // END_VALIDATE_PURPOSE_CONFLICT_SEE_FIRST_ARRANGE_INPUT

      // START_VALIDATE_PURPOSE_CONFLICT_SEE_FIRST_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_PURPOSE_CONFLICT_SEE_FIRST_ACT

      // START_VALIDATE_PURPOSE_CONFLICT_SEE_FIRST_ASSERT
      t.assert.deepStrictEqual(schema.entries[1]?.issues, [
        { code: ERR_DBC_PURPOSE_CONFLICT, line: 2 },
      ]);
      t.assert.snapshot(schema);
      // END_VALIDATE_PURPOSE_CONFLICT_SEE_FIRST_ASSERT
    });

    it('should report contract order violation', (t: TestContext) => {
      // START_VALIDATE_ORDER_ARRANGE_INPUT
      const inputContract = [
        '@returns {boolean} True on success.',
        '@param {string} userId User identifier.',
      ].join('\n');
      // END_VALIDATE_ORDER_ARRANGE_INPUT

      // START_VALIDATE_ORDER_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_ORDER_ACT

      // START_VALIDATE_ORDER_ASSERT
      t.assert.deepStrictEqual(schema.entries[1]?.issues, [{ code: ERR_DBC_ORDER, line: 2 }]);
      t.assert.snapshot(schema);
      // END_VALIDATE_ORDER_ASSERT
    });

    it('should report missing param name', (t: TestContext) => {
      // START_VALIDATE_PARAM_NAME_MISSING_ARRANGE_INPUT
      const inputContract = '@param {string}';
      // END_VALIDATE_PARAM_NAME_MISSING_ARRANGE_INPUT

      // START_VALIDATE_PARAM_NAME_MISSING_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_PARAM_NAME_MISSING_ACT

      // START_VALIDATE_PARAM_NAME_MISSING_ASSERT
      t.assert.deepStrictEqual(schema.entries[0]?.issues, [
        { code: ERR_DBC_PARAM_NAME_MISSING, line: 1 },
      ]);
      t.assert.snapshot(schema);
      // END_VALIDATE_PARAM_NAME_MISSING_ASSERT
    });

    it('should report invalid see format', (t: TestContext) => {
      // START_VALIDATE_SEE_FORMAT_ARRANGE_INPUT
      const inputContract = '@see invalid-ref';
      // END_VALIDATE_SEE_FORMAT_ARRANGE_INPUT

      // START_VALIDATE_SEE_FORMAT_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_SEE_FORMAT_ACT

      // START_VALIDATE_SEE_FORMAT_ASSERT
      t.assert.deepStrictEqual(schema.entries[0]?.issues, [
        { code: ERR_DBC_SEE_FORMAT_INVALID, line: 1 },
      ]);
      t.assert.snapshot(schema);
      // END_VALIDATE_SEE_FORMAT_ASSERT
    });

    it('should not report order violation for valid implements, consumer, param, returns sequence', (t: TestContext) => {
      // purpose: verify updated CONTRACT_ORDER — implements precedes param; consumer is outside order
      // contract: no ERR_DBC_ORDER when implements is first and consumer appears between order-regulated tags
      // failure mode: adding consumer to CONTRACT_ORDER would break this scenario

      // START_VALIDATE_ORDER_IMPLEMENTS_AND_CONSUMER_ARRANGE_INPUT
      const inputContract = [
        '@implements {VendorGateway} in ./path',
        '@consumer MainApp',
        '@param {string} userId User identifier.',
        '@returns {boolean} True on success.',
      ].join('\n');
      // END_VALIDATE_ORDER_IMPLEMENTS_AND_CONSUMER_ARRANGE_INPUT

      // START_VALIDATE_ORDER_IMPLEMENTS_AND_CONSUMER_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_ORDER_IMPLEMENTS_AND_CONSUMER_ACT

      // START_VALIDATE_ORDER_IMPLEMENTS_AND_CONSUMER_ASSERT
      t.assert.snapshot(schema);
      // END_VALIDATE_ORDER_IMPLEMENTS_AND_CONSUMER_ASSERT
    });

    it('reports ERR_DBC_ORDER for implements order violation', (t: TestContext) => {
      // START_VALIDATE_ORDER_IMPLEMENTS_VIOLATION_ARRANGE_INPUT
      const inputContract = [
        '@param {string} userId User identifier.',
        '@implements {VendorGateway} in ./path',
      ].join('\n');
      // END_VALIDATE_ORDER_IMPLEMENTS_VIOLATION_ARRANGE_INPUT

      // START_VALIDATE_ORDER_IMPLEMENTS_VIOLATION_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_ORDER_IMPLEMENTS_VIOLATION_ACT

      // START_VALIDATE_ORDER_IMPLEMENTS_VIOLATION_ASSERT
      t.assert.deepStrictEqual(schema.entries[1]?.issues, [{ code: ERR_DBC_ORDER, line: 2 }]);
      t.assert.snapshot(schema);
      // END_VALIDATE_ORDER_IMPLEMENTS_VIOLATION_ASSERT
    });

    it('reports ERR_DBC_ORDER when invariant precedes implements', (t: TestContext) => {
      // START_VALIDATE_ORDER_INVARIANT_BEFORE_IMPLEMENTS_ARRANGE_INPUT
      const inputContract = [
        '@invariant Must be called after init.',
        '@implements {VendorGateway}',
      ].join('\n');
      // END_VALIDATE_ORDER_INVARIANT_BEFORE_IMPLEMENTS_ARRANGE_INPUT

      // START_VALIDATE_ORDER_INVARIANT_BEFORE_IMPLEMENTS_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_ORDER_INVARIANT_BEFORE_IMPLEMENTS_ACT

      // START_VALIDATE_ORDER_INVARIANT_BEFORE_IMPLEMENTS_ASSERT
      t.assert.deepStrictEqual(schema.entries[1]?.issues, [{ code: ERR_DBC_ORDER, line: 2 }]);
      t.assert.snapshot(schema);
      // END_VALIDATE_ORDER_INVARIANT_BEFORE_IMPLEMENTS_ASSERT
    });

    it('should match the invalid contract example from task spec', (t: TestContext) => {
      // START_VALIDATE_SPEC_INVALID_EXAMPLE_ARRANGE_INPUT
      const inputContract = [
        '@purpose A short description.',
        '@returns {void}',
        '@see {OtherClass#method}',
        '@param {string}',
      ].join('\n');
      // END_VALIDATE_SPEC_INVALID_EXAMPLE_ARRANGE_INPUT

      // START_VALIDATE_SPEC_INVALID_EXAMPLE_ACT
      const schema = parser.parse(inputContract);
      // END_VALIDATE_SPEC_INVALID_EXAMPLE_ACT

      // START_VALIDATE_SPEC_INVALID_EXAMPLE_ASSERT
      t.assert.snapshot(schema);
      // END_VALIDATE_SPEC_INVALID_EXAMPLE_ASSERT
    });
  });
});
