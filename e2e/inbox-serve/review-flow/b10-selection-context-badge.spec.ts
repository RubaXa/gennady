// @file: B10 — selecting text in an artifact → "Спросить про это" pill → attach → the resulting
//   context chip badge (SelectionPill.tsx/ChatComposer.tsx) must point at the SAME artifact/line
//   span the selection came from, both while composing and once the turn is sent (ChatThread.tsx).
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-130, TSK-132

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_REF, BASE_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('B10 selection context badge', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: true }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('selection → pill → chip badge → same badge on the sent turn', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.prose').first()).toBeVisible({ timeout: 10_000 });

    // Select a real word inside the rendered artifact text (first non-empty text node under the
    // artifact pane) via the Range API, then fire mouseup so SelectionPill's listener picks it up.
    const selectedText = await page.evaluate(() => {
      const pane = document.querySelector('.prose') ?? document.body;
      const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim() ?? '';
        if (text.length >= 12) {
          const range = document.createRange();
          range.setStart(node, 0);
          range.setEnd(node, Math.min(12, node.textContent!.length));
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          return range.toString();
        }
      }
      return null;
    });
    expect(selectedText, 'must find selectable text to attach as context').toBeTruthy();

    const pill = page.getByRole('button', { name: 'Спросить про это' });
    await expect(pill, 'pill must appear after the debounced selection').toBeVisible({
      timeout: 2000,
    });
    await pill.click();

    // Before send, the composer's own "Контекст вопроса" list is the only one on the page.
    const composerChip = page.locator('ul[aria-label="Контекст вопроса"] li').first();
    await expect(composerChip, 'chip must attach to the composer').toBeVisible({ timeout: 5_000 });
    const composerChipTitle = await composerChip.locator('span[title]').getAttribute('title');
    expect(
      composerChipTitle,
      `composer chip's title must carry the selected quote, got: ${composerChipTitle}`
    ).toBe(selectedText!.trim());
    const composerChipText = await composerChip.textContent();
    const badgeMatch = composerChipText?.match(/#L(\d+)-L(\d+)/);
    expect(
      badgeMatch,
      `composer chip must carry a #L<n>-L<n> badge, got: ${composerChipText}`
    ).toBeTruthy();

    const composer = page.getByPlaceholder('Спросить о ревью...');
    await composer.fill('B10 selection-context probe');
    await composer.press('Enter');

    const sentChip = page.locator('ul[aria-label="Контекст вопроса"] li').first();
    await expect(sentChip, 'sent turn must carry the same chip badge').toBeVisible({
      timeout: 120_000,
    });
    const sentChipText = await sentChip.textContent();
    expect(
      sentChipText?.match(/:(\d+)-(\d+)/)?.[0],
      'sent turn chip must show the same start-end line span as the composer chip'
    ).toBe(`:${badgeMatch![1]}-${badgeMatch![2]}`);
  });
});
