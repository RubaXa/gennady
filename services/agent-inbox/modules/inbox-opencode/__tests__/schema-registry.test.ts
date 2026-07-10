// @file: Unit tests for SchemaRegistry — node→schema mapping, overwrite, lookup.
// @consumers: node:test runner
// @tasks: TSK-111

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SchemaRegistry } from '../schema-registry.ts';

describe('SchemaRegistry — node→schema mapping', () => {
  it('GIVEN register("node_scaffold", schema) WHEN get("node_scaffold") THEN returns the schema', () => {
    const registry = new SchemaRegistry();
    const schema = { type: 'object', properties: { id: { type: 'string' } } };

    registry.register('node_scaffold', schema);
    const result = registry.get('node_scaffold');

    assert.deepStrictEqual(result, schema);
  });

  it('GIVEN no registration WHEN get("unknown_node") THEN returns undefined', () => {
    const registry = new SchemaRegistry();

    const result = registry.get('unknown_node');

    assert.strictEqual(result, undefined);
  });

  it('GIVEN register twice with different schemas WHEN get THEN returns last registered schema (overwrite)', () => {
    const registry = new SchemaRegistry();
    const schema1 = { type: 'object', properties: { a: { type: 'string' } } };
    const schema2 = { type: 'object', properties: { b: { type: 'number' } } };

    registry.register('node_x', schema1);
    registry.register('node_x', schema2);

    const result = registry.get('node_x');
    assert.deepStrictEqual(result, schema2);
    assert.notDeepStrictEqual(result, schema1);
  });

  it('GIVEN multiple registrations for different nodes WHEN get each THEN independent lookups succeed', () => {
    const registry = new SchemaRegistry();
    const scaffoldSchema = { type: 'object', properties: { kind: { type: 'string' } } };
    const reviewSchema = { type: 'object', properties: { verdict: { type: 'string' } } };

    registry.register('node_scaffold', scaffoldSchema);
    registry.register('node_review', reviewSchema);

    assert.deepStrictEqual(registry.get('node_scaffold'), scaffoldSchema);
    assert.deepStrictEqual(registry.get('node_review'), reviewSchema);
  });

  it('GIVEN registered schema WHEN get other node THEN returns undefined (no cross-contamination)', () => {
    const registry = new SchemaRegistry();

    registry.register('node_a', { type: 'object' });

    assert.strictEqual(registry.get('node_b'), undefined);
  });
});
