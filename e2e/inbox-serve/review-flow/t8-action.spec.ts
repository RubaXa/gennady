// @file: t8 — gate action dry-run (headless chromium): drive a REAL live review to awaiting_operator,
//   then in the browser select a candidate and click «Постить выбранное» → assert POST /action 200
//   and a `DRY-RUN post→MR…` line in the browser console (the dry-run broadcaster fans the suppressed
//   VCS write over SSE), proving NO real GitLab write happened. The action seam requires a LIVE
//   RoleInstance at awaiting_operator (BoardProviderReal.executeAction → scheduler.findInstance,
//   state must be awaiting_operator) — a disk-only review cannot drive it — so this test owns a full
//   live review to node_ask, hence the long budget.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_URL, MR_REF, BASE_URL } from './_support.ts';
import { shot } from '../helpers/shot.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;
let reachedAwaiting = false;

const DRIVE_DEADLINE_MS = 1_800_000;
const MAX_TICKS = 40;

test.describe('t8 gate action dry-run', () => {
  test.beforeAll(async () => {
    test.setTimeout(DRIVE_DEADLINE_MS + 120_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
    await app.scheduler.assignManual(MR_URL, 'reviewer');

    let ticks = 0;
    const deadline = Date.now() + DRIVE_DEADLINE_MS;
    while (ticks < MAX_TICKS && Date.now() < deadline) {
      const t0 = Date.now();
      await app.scheduler.tick();
      ticks++;
      const inst = app.scheduler.findInstance(MR_URL);
      // eslint-disable-next-line no-console -- localizes progress
      console.info(
        `[t8] tick ${ticks} ${Date.now() - t0}ms — state=${inst?.state ?? 'none'} node=${inst?.currentNode ?? 'n/a'}`
      );
      if (inst?.state === 'awaiting_operator') {
        reachedAwaiting = true;
        break;
      }
      if (inst && (inst.state === 'done' || inst.state === 'error')) break;
    }
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('select candidate → Постить → /action 200 + DRY-RUN post→MR console line', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const inst = app!.scheduler.findInstance(MR_URL);
    expect(
      reachedAwaiting,
      `instance never reached awaiting_operator — state=${inst?.state} node=${inst?.currentNode}`
    ).toBe(true);

    const dryRunLines: string[] = [];
    page.on('console', (m) => {
      if (m.text().startsWith('DRY-RUN ')) dryRunLines.push(m.text());
    });

    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });

    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeVisible({ timeout: 10_000 });
    await firstCheckbox.check();

    const postButton = page.getByRole('button', { name: 'Постить выбранное' });
    await expect(postButton).toBeEnabled({ timeout: 5_000 });

    const actionResp = page.waitForResponse((r) => /\/api\/mr\/.+\/action$/.test(r.url()));
    await postButton.click();
    const resp = await actionResp;
    expect(resp.status(), `POST /action body: ${await resp.text()}`).toBe(200);

    await page.waitForTimeout(1_500); // let the dry-run SSE broadcast land in the console
    await shot(page, 't8-action');

    expect(
      dryRunLines.some((l) => l.startsWith('DRY-RUN post→MR')),
      `expected a "DRY-RUN post→MR …" console line; captured: ${JSON.stringify(dryRunLines)}`
    ).toBe(true);
  });
});
