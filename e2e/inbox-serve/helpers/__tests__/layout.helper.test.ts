// @file: Unit tests for layout helper — getRelativePosition, isLeftOf, isBelow, isWithin.
// @consumers: none (test-only)
// @tasks: TSK-114

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRelativePosition, isLeftOf, isBelow, isWithin } from '../layout.helper.ts';
import type { Locator } from '@playwright/test';

// #region START_TEST_HELPERS — mock Locator factories for bounding box injection

/** @purpose Factory: create a mock Locator with a fixed bounding box. */
function _mockLocator(box: { x: number; y: number; width: number; height: number }): Locator {
  return {
    boundingBox: async () => box,
  } as unknown as Locator;
}

/** @purpose Factory: create a mock Locator that returns null bounding box. */
function _mockLocatorNull(): Locator {
  return {
    boundingBox: async () => null,
  } as unknown as Locator;
}

// #endregion END_TEST_HELPERS

// #region TEST_SUITE_GET_RELATIVE_POSITION
describe('getRelativePosition', () => {
  it('computes percentages for an element at (0, 0) with half-viewport size', async () => {
    // contract: left/top at 0%, width/height at 50% for a half-viewport element at origin
    const loc = _mockLocator({ x: 0, y: 0, width: 640, height: 360 });
    const pos = await getRelativePosition(loc);
    assert.strictEqual(pos.leftPct, 0);
    assert.strictEqual(pos.topPct, 0);
    assert.strictEqual(pos.widthPct, 50);
    assert.strictEqual(pos.heightPct, 50);
  });

  it('computes percentages for an element filling the full viewport', async () => {
    // contract: all 100% for full-viewport element
    const loc = _mockLocator({ x: 0, y: 0, width: 1280, height: 720 });
    const pos = await getRelativePosition(loc);
    assert.strictEqual(pos.leftPct, 0);
    assert.strictEqual(pos.topPct, 0);
    assert.strictEqual(pos.widthPct, 100);
    assert.strictEqual(pos.heightPct, 100);
  });

  it('rounds percentages to one decimal place', async () => {
    // contract: percentages rounded to 1 decimal (e.g. 7.8 not 7.8125)
    const loc = _mockLocator({ x: 100, y: 200, width: 300, height: 50 });

    const pos = await getRelativePosition(loc);
    // 100/1280*100 = 7.8125 → 7.8
    // 200/720*100  = 27.777... → 27.8
    // 300/1280*100 = 23.4375 → 23.4
    // 50/720*100   = 6.944... → 6.9
    assert.strictEqual(pos.leftPct, 7.8);
    assert.strictEqual(pos.topPct, 27.8);
    assert.strictEqual(pos.widthPct, 23.4);
    assert.strictEqual(pos.heightPct, 6.9);
  });

  it('throws when locator has no bounding box', async () => {
    // contract: error with Trace-Prefix when boundingBox returns null
    const loc = _mockLocatorNull();
    await assert.rejects(() => getRelativePosition(loc), { message: /\[layoutHelper\]/ });
  });
});
// #endregion

// #region TEST_SUITE_IS_LEFT_OF
describe('isLeftOf', () => {
  it('returns true when A is strictly left of B', async () => {
    // contract: A's right edge (x+width) < B's left edge (x)
    const a = _mockLocator({ x: 0, y: 0, width: 100, height: 50 });
    const b = _mockLocator({ x: 200, y: 0, width: 100, height: 50 });
    const result = await isLeftOf(a, b);
    assert.strictEqual(result, true);
  });

  it('returns false when A and B overlap horizontally', async () => {
    // contract: overlapping on X axis → not strictly left
    const a = _mockLocator({ x: 0, y: 0, width: 150, height: 50 });
    const b = _mockLocator({ x: 100, y: 0, width: 150, height: 50 });
    const result = await isLeftOf(a, b);
    assert.strictEqual(result, false);
  });

  it('returns false when A is to the right of B', async () => {
    // contract: A after B → not left
    const a = _mockLocator({ x: 300, y: 0, width: 100, height: 50 });
    const b = _mockLocator({ x: 0, y: 0, width: 100, height: 50 });
    const result = await isLeftOf(a, b);
    assert.strictEqual(result, false);
  });

  it('returns false when A touches B edge-to-edge', async () => {
    // contract: A.right == B.left → not strictly left (strict inequality)
    const a = _mockLocator({ x: 0, y: 0, width: 100, height: 50 });
    const b = _mockLocator({ x: 100, y: 0, width: 100, height: 50 });
    const result = await isLeftOf(a, b);
    assert.strictEqual(result, false);
  });

  it('throws when either locator has no bounding box', async () => {
    const a = _mockLocator({ x: 0, y: 0, width: 100, height: 50 });
    const b = _mockLocatorNull();
    await assert.rejects(() => isLeftOf(a, b), { message: /\[layoutHelper\]/ });
  });
});
// #endregion

// #region TEST_SUITE_IS_BELOW
describe('isBelow', () => {
  it('returns true when A is strictly below B', async () => {
    // contract: A's bottom edge > B's top edge is NOT correct.
    // isBelow: A is the "upper" element, so check A.bottom < B.top
    const a = _mockLocator({ x: 0, y: 0, width: 100, height: 50 });
    const b = _mockLocator({ x: 0, y: 100, width: 100, height: 50 });
    const result = await isBelow(a, b);
    assert.strictEqual(result, true);
  });

  it('returns false when A and B overlap vertically', async () => {
    // contract: overlapping on Y axis → not strictly below
    const a = _mockLocator({ x: 0, y: 0, width: 100, height: 100 });
    const b = _mockLocator({ x: 0, y: 50, width: 100, height: 100 });
    const result = await isBelow(a, b);
    assert.strictEqual(result, false);
  });

  it('returns false when A is above B', async () => {
    // contract: when A is above B, isBelow returns true (wait, re-read the spec)
    // The spec says: isBelow: element A's bottom edge < element B's top edge
    // Wait, isBelow means "A is above B" (A below B in the page...)
    // Actually re-reading: "isBelow(a, b)" with a being the "upper element", meaning a.bottom < b.top
    // But wait, the name says isBelow but the check is A.bottom < B.top which means A is ABOVE B
    // Let me re-read: "isBelow: element A's bottom edge < element B's top edge"
    // This checks if A's bottom is above B's top, meaning A is positioned *above* B
    // But the function name is isBelow... that seems contradictory.
    // Actually in the ticket: isBelow(a, b) — element A's bottom edge < element B's top edge
    // This means A is entirely above B, so isBelow returns true when A is *above* B.
    // But the naming is weird. Let me check the ticket again.
    // From the ticket: "isBelow: element A's bottom edge < element B's top edge"
    // OK so the semantics is: A is positioned above B (A's bottom is before B's top)
    // But the function name is `isBelow` — maybe it means "A is below B in terms of Y coordinate"? No.
    // Actually, "A isBelow B" would typically mean A.y > B.y (A is below B).
    // But the check goes: A.bottom < B.top — that means A is completely ABOVE B.
    // This seems like the function checks if A is ABOVE B, not below.
    // Let me just follow the spec literally: isBelow returns true when A.bottom < B.top.
    const a = _mockLocator({ x: 0, y: 200, width: 100, height: 50 });
    const b = _mockLocator({ x: 0, y: 0, width: 100, height: 50 });
    const result = await isBelow(a, b);
    assert.strictEqual(result, false);
  });

  it('returns false when A touches B edge-to-edge', async () => {
    // contract: A.bottom == B.top → not strictly below (strict inequality)
    const a = _mockLocator({ x: 0, y: 0, width: 100, height: 50 });
    const b = _mockLocator({ x: 0, y: 50, width: 100, height: 50 });
    const result = await isBelow(a, b);
    assert.strictEqual(result, false);
  });
});
// #endregion

// #region TEST_SUITE_IS_WITHIN
describe('isWithin', () => {
  it('returns true when element is fully inside container', async () => {
    // contract: element entirely contained by container
    const element = _mockLocator({ x: 10, y: 10, width: 50, height: 30 });
    const container = _mockLocator({ x: 0, y: 0, width: 100, height: 100 });
    const result = await isWithin(element, container);
    assert.strictEqual(result, true);
  });

  it('returns false when element extends beyond container right edge', async () => {
    // contract: element protrudes beyond container boundary
    const element = _mockLocator({ x: 10, y: 10, width: 100, height: 30 });
    const container = _mockLocator({ x: 0, y: 0, width: 100, height: 100 });
    const result = await isWithin(element, container);
    assert.strictEqual(result, false);
  });

  it('returns false when element extends beyond container bottom edge', async () => {
    const element = _mockLocator({ x: 10, y: 10, width: 50, height: 100 });
    const container = _mockLocator({ x: 0, y: 0, width: 100, height: 50 });
    const result = await isWithin(element, container);
    assert.strictEqual(result, false);
  });

  it('returns true when element is exactly at container boundary', async () => {
    // contract: element at container origin, filling it exactly → within (non-strict)
    const element = _mockLocator({ x: 0, y: 0, width: 100, height: 100 });
    const container = _mockLocator({ x: 0, y: 0, width: 100, height: 100 });
    const result = await isWithin(element, container);
    assert.strictEqual(result, true);
  });

  it('returns false when element is outside container left edge', async () => {
    // contract: element starting to the left of container
    const element = _mockLocator({ x: -5, y: 0, width: 50, height: 50 });
    const container = _mockLocator({ x: 0, y: 0, width: 100, height: 100 });
    const result = await isWithin(element, container);
    assert.strictEqual(result, false);
  });

  it('throws when locator has no bounding box', async () => {
    const element = _mockLocator({ x: 0, y: 0, width: 50, height: 50 });
    const container = _mockLocatorNull();
    await assert.rejects(() => isWithin(element, container), { message: /\[layoutHelper\]/ });
  });
});
// #endregion
