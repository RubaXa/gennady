// @file: B9 — sending a chat question must echo it immediately (data-testid=chat-pending-question),
//   before any assistant answer arrives — not just once the full round-trip completes
//   (ChatPanel.tsx#pendingQuestion / ChatThread.tsx).
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-130

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_REF, BASE_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('B9 chat optimistic echo', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: true }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('question appears in the thread right after sending, before any answer text exists', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });

    const composer = page.getByPlaceholder('Спросить о ревью...');
    await expect(composer).toBeVisible({ timeout: 10_000 });

    const question = 'B9 optimistic echo probe';
    await composer.click();
    await composer.fill(question);
    await composer.press('Enter');

    const pending = page.getByTestId('chat-pending-question');
    await expect(
      pending,
      'question must echo optimistically, before the answer arrives'
    ).toBeVisible({
      timeout: 1000,
    });
    await expect(pending).toHaveText(question);

    // Let the real chat turn actually finish before the test ends — afterAll's teardown kills the
    // in-process opencode server right after this test returns, which would otherwise race the
    // still-in-flight server-side session creation (SocketError, not a product bug — a test-timing one).
    await expect(pending, 'pending echo must clear once the real turn lands').toBeHidden({
      timeout: 120_000,
    });
  });
});
