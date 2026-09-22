// @file: Runtime-backed structural checks for DBC parser value-object fields.
// @spec: DBC-DBC-PARSER
// @consumers: migration-authored BDD evidence

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DbcEntrySchema, DbcSchema } from '../../../dbc-parser.types.ts';

describe('DBC parser value-object contract', () => {
  it('DbcSchema carries its format field', () => {
    const schema: DbcSchema = { entries: [], format: 'single-line' };
    assert.equal(schema.format, 'single-line');
  });

  it('DbcEntrySchema carries optional inline entries', () => {
    const nested: DbcEntrySchema = { type: 'consumer', value: 'CLI', issues: [] };
    const entry: DbcEntrySchema = {
      type: 'purpose',
      value: 'check',
      issues: [],
      inline: [nested],
    };
    assert.deepEqual(entry.inline, [nested]);
  });

  it('invalid schema format is rejected by the type-backed runtime guard', () => {
    const isFormat = (value: string): value is DbcSchema['format'] =>
      value === 'single-line' || value === 'multi-line';
    assert.equal(isFormat('unknown'), false);
  });
});
