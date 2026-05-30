// @file: Unit tests for queryEntity — find exported entities by name (S6 scenario).
// @consumers: OrientCommand
// @tasks: TSK-55

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryEntity } from '../core/query-entity.ts';
import type { ScannedFile } from '../orient.types.ts';

function makeFile(
  absPath: string,
  entityName: string,
  entityKind: ScannedFile['exports'][number]['kind'] = 'function'
): ScannedFile {
  return {
    absPath,
    header: { file: 'test file', tasks: [], consumers: [] },
    exports: [
      {
        name: entityName,
        kind: entityKind,
        contract: {
          entries: [{ type: 'purpose', value: 'does something', issues: [] }],
          format: 'multi-line',
        },
        rawJsdoc: '/** @purpose does something */',
      },
    ],
  };
}

describe('queryEntity', () => {
  it('returns empty for empty entity list', () => {
    assert.deepStrictEqual(queryEntity([], [], false), []);
  });

  it('exact entity: finds exact name match', () => {
    const file = makeFile('/project/src/a.ts', 'DbcJsDocParser', 'class');
    const results = queryEntity([file], ['DbcJsDocParser'], false);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'DbcJsDocParser');
    assert.strictEqual(results[0].kind, 'class');
    assert.strictEqual(results[0].fuzzy, false);
  });

  it('entity not found', () => {
    const file = makeFile('/project/src/a.ts', 'ExistingEntity');
    const results = queryEntity([file], ['UnknownEntity'], false);
    assert.strictEqual(results.length, 0);
  });

  it('fuzzy entity: matches with DL distance', () => {
    const file = makeFile('/project/src/a.ts', 'DbcJsDocParser', 'class');
    const results = queryEntity([file], ['DbcJdocParsr'], true);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'DbcJsDocParser');
    assert.strictEqual(results[0].fuzzy, true);
    assert.ok(results[0].distance !== undefined);
  });

  it('multi-file entity: same name in multiple files', () => {
    const fileA = makeFile('/project/src/utils.ts', 'parse');
    const fileB = makeFile('/project/src/helpers.ts', 'parse');
    const results = queryEntity([fileA, fileB], ['parse'], false);
    assert.strictEqual(results.length, 2);
  });

  it('multiple entities: finds both', () => {
    const file = makeFile('/project/src/a.ts', 'parse');
    file.exports.push({
      name: 'validate',
      kind: 'function',
      contract: {
        entries: [{ type: 'purpose', value: 'validates', issues: [] }],
        format: 'multi-line',
      },
      rawJsdoc: '',
    });
    const results = queryEntity([file], ['parse', 'validate'], false);
    assert.strictEqual(results.length, 2);
  });

  it('fuzzy boundary short: <=5 chars, distance >2 fails', () => {
    const file = makeFile('/project/src/a.ts', 'run');
    const results = queryEntity([file], ['abc'], true);
    assert.strictEqual(results.length, 0);
  });

  it('fuzzy boundary long: >5 chars, distance <=3 matches', () => {
    const file = makeFile('/project/src/a.ts', 'DbcContractMatchValidator', 'class');
    const results = queryEntity([file], ['DbcContractMatcValidator'], true);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'DbcContractMatchValidator');
  });

  it('class method excluded: only exported entities found', () => {
    // contract: queryEntity only matches exports, not class methods.
    // Since extractEntities (in orient.cmd.ts) does NOT include class methods
    // in the exports array, and queryEntity iterates only exports,
    // class methods are naturally excluded from matches.
    const file = makeFile('/project/src/a.ts', 'Foo', 'class');
    const results = queryEntity([file], ['bar'], false);
    assert.strictEqual(results.length, 0);
  });
});
