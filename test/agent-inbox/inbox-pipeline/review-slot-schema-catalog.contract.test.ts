// @file: Contract tests for exact content and typed diagram slot schemas.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ReviewSlotSchemaCatalog } from '../../../services/agent-inbox/modules/inbox-pipeline/model/review-slot-schema-catalog.ts';

type SlotCatalogContext = { catalog: ReviewSlotSchemaCatalog };
function createSlotCatalogContext(): SlotCatalogContext {
  return { catalog: new ReviewSlotSchemaCatalog() };
}

describe('ReviewSlotSchemaCatalog', () => {
  it('all slot schemas enforce fields anchors and cardinality', () => {
    const { catalog } = createSlotCatalogContext();
    const entity = catalog.resolveContentSchema('entity');
    assert.deepStrictEqual(entity.requiredFields, [
      'identity',
      'responsibility',
      'dependencies',
      'risks',
      'testImpact',
    ]);
    assert.deepStrictEqual([entity.minCardinality, entity.maxCardinality], [1, 1]);
  });

  it('three diagram schemas reject generic substitution', () => {
    const { catalog } = createSlotCatalogContext();
    const schemas = ['entity-dependency', 'before-after', 'runtime-event-flow'].map(
      (kind) =>
        catalog.resolveDiagramSchema(
          kind as 'entity-dependency' | 'before-after' | 'runtime-event-flow'
        ).requiredFields
    );
    assert.strictEqual(new Set(schemas.map((fields) => fields.join('|'))).size, 3);
  });
});
