// @file: t5 — detail render (headless chromium): over a state dir seeded with the operator's REAL
//   materialized review of MR_REF, the dashboard detail page shows the artifact nav, the README with
//   a REAL drawn mermaid svg, and a populated `Кандидаты (N>0)` panel fed from review.json.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_REF, BASE_URL } from './_support.ts';
import { shot } from '../helpers/shot.ts';
import { waitForRealMermaidRender } from '../helpers/wait-render.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('t5 detail render', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: true }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('nav + README + mermaid + populated candidates over a real review on disk', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);

    const nav = page.locator('nav[aria-label="Артефакты"]');
    await expect(nav).toBeVisible({ timeout: 20_000 });

    await nav.getByRole('button', { name: 'README.md', exact: true }).click();
    await waitForRealMermaidRender(page, 45_000);

    await expect(page.getByText(/Кандидаты \(\d+\)/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Кандидаты \(0\)/)).toHaveCount(0);
    await shot(page, 't5-detail');
  });
});
