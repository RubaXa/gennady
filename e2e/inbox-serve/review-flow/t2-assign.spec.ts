// @file: t2 — assign: manual-assign the real MR to the reviewer role against the REAL scheduler
//   (real GitLab getMrContext for the initial checkpoint) and confirm a live RoleInstance now exists
//   for the MR. No LLM review is driven here — just that assignment lands an instance.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('t2 assign', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('assignManual lands a live reviewer instance for the MR', async () => {
    await app!.scheduler.assignManual(MR_URL, 'reviewer');

    const instance = app!.scheduler.findInstance(MR_URL);
    expect(instance, 'expected a live RoleInstance for the MR after assignManual').toBeTruthy();
    expect(instance!.role).toBe('reviewer');
    expect(instance!.mr).toBe(MR_URL);

    // getBoardView is the same snapshot BoardProviderReal serves the dashboard from.
    const view = instance!.getBoardView() as Record<string, unknown>;
    expect(view).toBeTruthy();
  });
});
