// @file: wait-render.ts — waits for a REAL rendered mermaid diagram, not the pending or failure
//   placeholder, not raw fenced-code source, inside the dashboard's ArtifactView. A real render is
//   mermaid.js's own output mounted as `svg[id^="mmd-"]`; the placeholder branch (ArtifactView.tsx's
//   MermaidDiagram, `svg === null`) never mounts an `<svg>` element at all, it stays a `<pre>` block —
//   so presence of the selector is already load-bearing, not merely a style check.
// @consumers: e2e/inbox-serve/reviewer-eval.spec.ts
// @tasks: TSK-120

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * @purpose Wait for a real, drawn mermaid diagram — never a pending or failed placeholder.
 * @invariant `svg[id^="mmd-"]` presence already excludes both placeholder branches (they mount no
 *   `svg`); the node/edge check additionally excludes a hypothetical visible-but-empty render.
 * @param page Playwright page under test.
 * @param [timeoutMs] Poll budget in ms — wider than the mocked-fixture 10s budget | @default 30000
 * @throws {Error} Playwright timeout when no real diagram appears in time.
 * @returns Locator for the first real, drawn diagram `<svg>`.
 */
export async function waitForRealMermaidRender(
  page: Page,
  timeoutMs: number = 30_000
): Promise<Locator> {
  const svg = page.locator('svg[id^="mmd-"]').first();
  await expect(svg).toBeVisible({ timeout: timeoutMs });
  await expect(svg.locator('.node, .edgePath').first()).toBeVisible({ timeout: timeoutMs });
  return svg;
}
