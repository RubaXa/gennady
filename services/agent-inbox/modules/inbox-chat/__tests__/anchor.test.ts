// @file: BDD coverage for TSK-163 artifact anchors.
// @consumers: node:test runner
// @tasks: TSK-163

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnchorResolver, type Anchor } from '../anchor.ts';

describe('AnchorResolver', () => {
  it('contract: anchor and chat mutation ports', () => {
    const anchor: Anchor = {
      widgetId: 'findings',
      artifactPath: 'report.json',
      fragment: { start: 1, end: 5 },
      quote: 'fixed',
    };
    assert.strictEqual(anchor.widgetId, 'findings');
  });

  it('anchor resolves by quote after mutation else stale', () => {
    const resolver = new AnchorResolver();
    const anchor: Anchor = {
      widgetId: 'findings',
      artifactPath: 'report.json',
      fragment: { start: 0, end: 5 },
      quote: 'fixed 50ms',
    };
    const resolved = resolver.resolve(anchor, 'prefix inserted; fixed 50ms remains');
    assert.deepStrictEqual(resolved, {
      state: 'resolved',
      anchor,
      fragment: { start: 17, end: 27 },
    });
    assert.deepStrictEqual(resolver.resolve(anchor, 'quote removed'), { state: 'stale', anchor });
  });

  it('non text anchor resolves by elementId else stale', () => {
    const resolver = new AnchorResolver();
    const anchor: Anchor = { widgetId: 'diagram', elementId: 'node-7' };
    assert.strictEqual(resolver.resolve(anchor, undefined, ['node-7']).state, 'resolved');
    assert.strictEqual(resolver.resolve(anchor, undefined, []).state, 'stale');
  });
});
