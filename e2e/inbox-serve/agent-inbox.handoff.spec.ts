// @file: Handoff e2e — clipboard failure preserves baseline until acknowledged success.
// @consumers: playwright prod config
// @tasks: TSK-182

import { expect, test } from '@playwright/test';
import type {
  BoardV2,
  MrStateV2,
} from '../../services/agent-inbox/modules/inbox-dashboard/v2-types.ts';

// purpose: verify that clipboard denial shows retry UI; baseline advances only after confirmed write
// invariant: no file download fallback — retry button is the only recovery path
// invariant: success state appears only after navigator.clipboard.writeText resolves

const MR_REF = 'group/project!2';
const MR_REF_ENCODED = encodeURIComponent(MR_REF);

const BOARD_FIXTURE: BoardV2 = {
  groups: { '⏳': [MR_REF], '💬': [], '🔀': [], '✅': [], '😴': [] },
  cards: [
    {
      ref: MR_REF,
      title: 'Handoff test MR',
      author: 'j.doe',
      myRole: 'reviewer',
      attention: '⏳',
      counters: {
        approvals: '0/1',
        reviewers: [],
        ci: null,
        threads: '0/1',
        awaitingMe: 0,
        newCommits: 1,
        unread: 0,
      },
      work: { state: 'idle', label: 'Нет работы', startedAt: null },
    },
  ],
  syncState: 'ok',
};

const MR_STATE_FIXTURE: MrStateV2 = {
  card: BOARD_FIXTURE.cards[0],
  queue: [],
  widgets: [],
  transcript: [],
};

test('clipboard failure preserves baseline until acknowledged success', async ({ page }) => {
  // #region START_CLIPBOARD_SETUP_ROUTES
  // Playwright LIFO: catch-all registered first so specific routes below override it.
  await page.route('**/api/mr/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );

  await page.route('**/api/boot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ phase: 'ready', ready: true, configured: true, missing: [] }),
    })
  );

  await page.route('**/api/board', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(BOARD_FIXTURE),
    })
  );

  await page.route('**/api/state**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MR_STATE_FIXTURE),
    })
  );

  await page.route(`**/api/mr/${MR_REF_ENCODED}/handoff**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: 'Handoff delta baseline: 2026-08-11 findings summary' }),
    })
  );
  // #endregion END_CLIPBOARD_SETUP_ROUTES

  // #region START_CLIPBOARD_INJECT_FAILURE
  // Inject clipboard mock: first call rejects (permission denied), second call resolves (success)
  await page.addInitScript(() => {
    let callCount = 0;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (_text: string): Promise<void> => {
          callCount += 1;
          if (callCount === 1) {
            return Promise.reject(new DOMException('Write access denied', 'NotAllowedError'));
          }
          return Promise.resolve();
        },
      },
      writable: false,
      configurable: true,
    });
  });
  // #endregion END_CLIPBOARD_INJECT_FAILURE

  await page.goto(`/#/mr/${MR_REF_ENCODED}`);

  // #region START_CLIPBOARD_ASSERT_HANDOFF_CONTROL
  const handoffControl = page.getByLabel('Передача задачи');
  await expect(handoffControl).toBeVisible({ timeout: 15_000 });

  const deltaBtn = page.getByRole('button', { name: 'Дельта' });
  await expect(deltaBtn).toBeEnabled({ timeout: 5_000 });
  // #endregion END_CLIPBOARD_ASSERT_HANDOFF_CONTROL

  // #region START_CLIPBOARD_TRIGGER_FAILURE
  await deltaBtn.click();

  // failure is local — no file download link must appear
  const downloadLink = page.locator('a[download]');
  await expect(downloadLink).toHaveCount(0);

  // denied state shows retry button
  const deniedMsg = page.getByRole('alert');
  await expect(deniedMsg).toBeVisible({ timeout: 10_000 });
  await expect(deniedMsg).toContainText('Нет доступа к буферу обмена');

  const retryBtn = page.getByRole('button', { name: 'Повторить' });
  await expect(retryBtn).toBeVisible();
  // #endregion END_CLIPBOARD_TRIGGER_FAILURE

  // #region START_CLIPBOARD_TRIGGER_RETRY
  // retry — second clipboard call succeeds
  await retryBtn.click();

  // success state appears after confirmed clipboard write
  const successMsg = page.locator('.v2-handoff-ok');
  await expect(successMsg).toBeVisible({ timeout: 10_000 });
  await expect(successMsg).toContainText('Скопировано');

  // denied alert gone — replaced by success
  await expect(page.getByRole('alert')).toHaveCount(0);
  // #endregion END_CLIPBOARD_TRIGGER_RETRY
});
