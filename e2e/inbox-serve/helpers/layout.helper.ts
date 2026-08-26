// @file: Layout helpers for computing element positions relative to viewport.
// @consumers: Playwright e2e tests for inbox-serve
// @tasks: TSK-114

import type { Locator } from '@playwright/test';

/** @purpose Relative position of an element expressed as viewport percentages. */
export type RelativePosition = {
  /** @purpose Distance from the left edge of the viewport in percent | @invariant 0–100 */
  leftPct: number;
  /** @purpose Distance from the top edge of the viewport in percent | @invariant 0–100 */
  topPct: number;
  /** @purpose Element width as percent of viewport width | @invariant 0–100 */
  widthPct: number;
  /** @purpose Element height as percent of viewport height | @invariant 0–100 */
  heightPct: number;
};

/** @purpose Standard viewport dimensions for relative-position calculations. */
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

// #region START_COMPUTE_RELATIVE_POSITION — computes all four percentage fields from a bounding box
/**
 * @purpose Convert a bounding box to viewport-relative percentages.
 * @param bb Bounding box with absolute pixel coordinates.
 * @returns RelativePosition with percentages rounded to one decimal.
 */
function _boxToRelative(bb: {
  x: number;
  y: number;
  width: number;
  height: number;
}): RelativePosition {
  const round = (v: number): number => Math.round(v * 10) / 10;
  return {
    leftPct: round((bb.x / VIEWPORT_WIDTH) * 100),
    topPct: round((bb.y / VIEWPORT_HEIGHT) * 100),
    widthPct: round((bb.width / VIEWPORT_WIDTH) * 100),
    heightPct: round((bb.height / VIEWPORT_HEIGHT) * 100),
  };
}
// #endregion END_COMPUTE_RELATIVE_POSITION

// #region START_RESOLVE_BOUNDING_BOX — extract bounding box or throw on null
/**
 * @purpose Resolve a locator's bounding box, throwing if null.
 * @param locator Playwright Locator.
 * @returns Non-null bounding box.
 * @throws {Error} When the locator has no bounding box (not visible or not attached to DOM).
 */
async function _resolveBox(
  locator: Locator
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(
      '[layoutHelper] Locator has no bounding box — element not visible or not attached to DOM'
    );
  }
  return box;
}
// #endregion END_RESOLVE_BOUNDING_BOX

/**
 * @purpose Retrieve the element's position and size as viewport-relative percentages.
 * @param locator Playwright Locator for the target element.
 * @throws {Error} When the locator has no bounding box.
 * @returns RelativePosition with leftPct, topPct, widthPct, heightPct.
 * @sideEffect Browser: boundingBox() call.
 */
export async function getRelativePosition(locator: Locator): Promise<RelativePosition> {
  const box = await _resolveBox(locator);
  return _boxToRelative(box);
}

/**
 * @purpose Check whether element A is strictly to the left of element B (no overlap).
 * @param a Locator for the left element.
 * @param b Locator for the right element.
 * @throws {Error} When either locator has no bounding box.
 * @returns true when A's right edge < B's left edge.
 * @sideEffect Browser: two boundingBox() calls.
 */
export async function isLeftOf(a: Locator, b: Locator): Promise<boolean> {
  const [boxA, boxB] = await Promise.all([_resolveBox(a), _resolveBox(b)]);
  return boxA.x + boxA.width < boxB.x;
}

/**
 * @purpose Check whether element A is strictly below element B (no overlap).
 * @param a Locator for the upper element.
 * @param b Locator for the lower element.
 * @throws {Error} When either locator has no bounding box.
 * @returns true when A's bottom edge < B's top edge.
 * @sideEffect Browser: two boundingBox() calls.
 */
export async function isBelow(a: Locator, b: Locator): Promise<boolean> {
  const [boxA, boxB] = await Promise.all([_resolveBox(a), _resolveBox(b)]);
  return boxA.y + boxA.height < boxB.y;
}

/**
 * @purpose Check whether element is fully inside the container's bounding box.
 * @param element Locator for the inner element.
 * @param container Locator for the outer container.
 * @throws {Error} When either locator has no bounding box.
 * @returns true when the element's bounding box is entirely contained by the container.
 * @sideEffect Browser: two boundingBox() calls.
 */
export async function isWithin(element: Locator, container: Locator): Promise<boolean> {
  const [boxE, boxC] = await Promise.all([_resolveBox(element), _resolveBox(container)]);
  return (
    boxE.x >= boxC.x &&
    boxE.y >= boxC.y &&
    boxE.x + boxE.width <= boxC.x + boxC.width &&
    boxE.y + boxE.height <= boxC.y + boxC.height
  );
}
