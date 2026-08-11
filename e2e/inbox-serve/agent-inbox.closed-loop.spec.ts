// @file: Closed-loop e2e — operator applies selected package directly to allowlisted GitLab MR.
// @consumers: playwright prod config
// @tasks: TSK-182

import { expect, test } from '@playwright/test';
import type {
  BoardV2,
  MrStateV2,
  ReviewPackage,
} from '../../services/agent-inbox/modules/inbox-dashboard/v2-types.ts';

// purpose: verify full apply loop — package loads, operator clicks Apply once, independent outcomes surface
// invariant: Apply button triggers immediate API call with no secondary confirm dialog
// invariant: per-action outcomes are independent — one error does not block a success result

const MR_REF = 'group/project!1';
const MR_REF_ENCODED = encodeURIComponent(MR_REF);

/** @purpose Minimal board payload with one reviewer MR in the decision-required lane. */
const BOARD_FIXTURE: BoardV2 = {
  groups: { '⏳': [MR_REF], '💬': [], '🔀': [], '✅': [], '😴': [] },
  cards: [
    {
      ref: MR_REF,
      title: 'Allowlisted reviewer MR',
      author: 'i.petrov',
      myRole: 'reviewer',
      attention: '⏳',
      counters: {
        approvals: '1/2',
        reviewers: [{ user: 'i.petrov', voted: true }],
        ci: 'success',
        threads: '1/3',
        awaitingMe: 1,
        newCommits: 0,
        unread: 2,
      },
      work: { state: 'idle', label: 'Нет работы', startedAt: null },
    },
  ],
  syncState: 'ok',
};

/** @purpose Minimal MR state — board is already seeded; workspace shows feed + package. */
const MR_STATE_FIXTURE: MrStateV2 = {
  card: BOARD_FIXTURE.cards[0],
  queue: [],
  widgets: [],
  transcript: [],
};

/** @purpose Two-action package — one recommended (pre-selected), one optional; neither stale. */
const PACKAGE_FIXTURE: ReviewPackage = {
  packageId: 'pkg-e2e-1',
  revision: 1,
  stale: false,
  actions: [
    {
      id: 'a-post',
      label: 'Постить находки',
      description: 'Отправить комментарии с находками в GitLab',
      selected: true,
      outcome: null,
    },
    {
      id: 'a-approve',
      label: 'Одобрить MR',
      description: 'Поставить аппрув в GitLab',
      selected: true,
      outcome: null,
    },
  ],
};

test('operator applies selected package directly to allowlisted GitLab MR', async ({ page }) => {
  // #region START_APPLY_SETUP_ROUTES
  // Playwright LIFO: catch-all registered first so specific routes below override it.
  await page.route(`**/api/mr/**`, (route) =>
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

  await page.route(`**/api/state**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MR_STATE_FIXTURE),
    })
  );

  await page.route(`**/api/mr/${MR_REF_ENCODED}/package`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PACKAGE_FIXTURE),
    })
  );

  // Mock apply — independent outcomes: a-post succeeds, a-approve fails
  await page.route(`**/api/mr/${MR_REF_ENCODED}/package/apply`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ outcomes: { 'a-post': 'success', 'a-approve': 'error' } }),
    })
  );

  // #endregion END_APPLY_SETUP_ROUTES

  await page.goto(`/#/mr/${MR_REF_ENCODED}`);

  // #region START_APPLY_ASSERT_PACKAGE_LOADED
  const packageSection = page.getByRole('region', { name: 'Пакет действий' });
  await expect(packageSection).toBeVisible({ timeout: 15_000 });

  // package actions rendered — wait for fetch to complete (useEffect runs in browser)
  const applyBtn = page.getByRole('button', { name: 'Применить выбранные действия' });
  await expect(applyBtn).toBeEnabled({ timeout: 10_000 });

  // both actions visible as checkboxes
  await expect(page.getByRole('checkbox', { name: 'Постить находки' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Одобрить MR' })).toBeVisible();
  // #endregion END_APPLY_ASSERT_PACKAGE_LOADED

  // #region START_APPLY_TRIGGER
  // click Apply — no secondary confirm dialog should appear
  await applyBtn.click();

  // verify no confirm dialog (no modal, no alert overlay)
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.locator('[role="alertdialog"]')).toHaveCount(0);
  // #endregion END_APPLY_TRIGGER

  // #region START_APPLY_ASSERT_OUTCOMES
  // outcomes update individually: a-post success (✔), a-approve error (✘)
  await expect(packageSection.getByText('✔')).toBeVisible({ timeout: 10_000 });
  await expect(packageSection.getByText('✘')).toBeVisible();

  // apply button returns to enabled state (not stuck in applying)
  await expect(applyBtn).toBeEnabled();
  // #endregion END_APPLY_ASSERT_OUTCOMES
});
