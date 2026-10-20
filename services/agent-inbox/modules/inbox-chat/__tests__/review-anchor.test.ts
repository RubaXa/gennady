// @file: BDD coverage for artifact anchor feed-reorder resilience — TSK-178.
// @consumers: node:test runner
// @tasks: TSK-178

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnchorResolver, type Anchor } from '../anchor.ts';

describe('AnchorResolver — artifact anchor resilience', () => {
  it('artifact anchor survives feed reorder', () => {
    // purpose: quote-first resolution must re-locate the fragment even when surrounding feed content
    //          changes position (other findings inserted, items reordered)
    // invariant: original offset from the anchored fragment is irrelevant when the quote is present

    const resolver = new AnchorResolver();

    // #region START_ANCHOR_REORDER_SETUP
    const anchor: Anchor = {
      widgetId: 'findings',
      artifactPath: 'review.json',
      fragment: { start: 0, end: 21 }, // original position — will be stale after reorder
      quote: 'Missing timeout guard',
    };
    // feed reorder: another finding is prepended; the anchored quote moves to a different offset
    const reorderedContent =
      'Token not validated at src/auth.ts:7\nMissing timeout guard at src/retry.ts:12\nEnd of report.';
    // #endregion END_ANCHOR_REORDER_SETUP

    const resolution = resolver.resolve(anchor, reorderedContent);

    // #region START_ANCHOR_REORDER_ASSERT
    assert.strictEqual(resolution.state, 'resolved');
    if (resolution.state === 'resolved') {
      assert.ok(resolution.fragment !== undefined);
      const expectedStart = reorderedContent.indexOf('Missing timeout guard');
      assert.strictEqual(resolution.fragment!.start, expectedStart);
      assert.strictEqual(resolution.fragment!.end, expectedStart + anchor.quote.length);
    }
    // #endregion END_ANCHOR_REORDER_ASSERT

    // element anchor survives widget element set reorder (other elements inserted around target)
    const elemAnchor: Anchor = { widgetId: 'diff', elementId: 'hunk-3' };
    const reorderedElements = ['hunk-1', 'hunk-3', 'hunk-7'];
    assert.strictEqual(
      resolver.resolve(elemAnchor, undefined, reorderedElements).state,
      'resolved'
    );

    // stale case: quote removed from content after reorder
    const staleResolution = resolver.resolve(anchor, 'All findings resolved.');
    assert.strictEqual(staleResolution.state, 'stale');
  });
});
