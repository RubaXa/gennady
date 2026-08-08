// @file: Dashboard v2 real-operator proof — intentionally targets only an already running,
// configured `gennady inbox serve` backed by the operator's ~/.gennady and GitLab account.
// @consumers: Playwright real inbox-serve verification
// @tasks: TSK-164

import { expect, test } from '@playwright/test';

const origin = process.env.GENNADY_V2_BASE_URL;
const mrRef = process.env.GENNADY_V2_MR_REF;
const enabled = Boolean(origin && mrRef);

test.describe('dashboard v2 against configured operator serve', () => {
  test.skip(
    !enabled,
    'P3 requires GENNADY_V2_BASE_URL and GENNADY_V2_MR_REF for real ~/.gennady/GitLab'
  );

  test('selection → anchored chat request → SSE answer stays observable', async ({ page }) => {
    // This suite never creates a state directory, starts a server, intercepts routes, enables
    // --mocks, or seeds GitLab-like data. Its two variables name an operator-provided real target.
    await page.goto(`${origin}/#/`);
    await expect(page.getByRole('main').filter({ hasText: 'Доска внимания' })).toBeVisible({
      timeout: 45_000,
    });
    await page.screenshot({ path: 'test-results/screenshots/dashboard-v2-real-01-board.png' });

    await page.goto(`${origin}/#/mr/${encodeURIComponent(mrRef!)}`);
    await expect(page.getByLabel('Лента MR')).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/screenshots/dashboard-v2-real-02-feed.png' });

    const anchor = page.locator('[data-anchor-id]').first();
    await expect(anchor).toBeVisible({ timeout: 30_000 });
    await anchor.click();
    await expect(page.getByLabel('Якорь вопроса')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/dashboard-v2-real-03-selection.png' });

    const question = `Dashboard real-anchor proof ${Date.now()}`;
    await page.getByLabel('Вопрос в чат').fill(question);
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByText(question)).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/dashboard-v2-real-04-chat-request.png',
    });

    // A durable assistant turn is emitted only after the real per-MR SSE stream delivers turn_done.
    await expect(page.locator('.v2-chat-turn.assistant').last()).toBeVisible({ timeout: 90_000 });
    await page.screenshot({ path: 'test-results/screenshots/dashboard-v2-real-05-sse-answer.png' });
  });
});
