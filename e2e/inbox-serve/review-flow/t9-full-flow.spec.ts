// @file: t9 — full-flow (Round 2, D-125): ONE incremental e2e proving interface↔telemetry↔artifact at
//   EVERY step of the full review cycle over the REAL MR `_support.ts`'s `MR_REF` names (originally
//   vk-workspace/superapp!602; switched to mail/messenger!159 after !602 was merged on GitLab —
//   see `_support.ts` header), no mocks on the path. Phases P3-P8 each append their own sub-steps to
//   this file. P3-P6 share ONE `REVIEW_FLOW_STATE_DIR` (operator-set env var, reused verbatim — see
//   ticket P3 Objective); P7 owns its own independent live drive (BoardProviderReal.executeAction
//   needs a LIVE RoleInstance, no disk fallback — see ticket P7 Objective) and does not reuse this
//   state dir.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, BASE_URL, MR_URL, MR_REF } from './_support.ts';
import { shot } from '../helpers/shot.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('t9 full flow', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('P3 sub-step 1: board loads for the real product', async ({ page }) => {
    await page.goto(BASE_URL);

    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 10_000 });
    await expect(header.locator('h1')).toContainText('agent-inbox');

    const unassignedRegion = page.getByRole('region', { name: 'Unassigned MRs' });
    await expect(unassignedRegion).toBeVisible({ timeout: 10_000 });

    // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P3 Exit
    console.info(`[t9] step=board-loaded ts=${new Date().toISOString()}`);
    await shot(page, 't9-01-board-empty');
  });

  test('P3 sub-step 2: assign the real MR to reviewer through the UI', async ({ page }) => {
    // assignManual's _buildInitialCheckpoint prepares a real git worktree for the MR (clone/checkout
    // on first use) before the RoleInstance lands — budget generously for that one-time cost.
    test.setTimeout(180_000);
    // F7: unassigned needs one completed poll; no role is active in this fresh dir, so tick() only
    // surfaces MRs for manual UI assignment, never auto-assigns (SV-07).
    await app!.scheduler.tick();

    await page.goto(BASE_URL);
    const unassignedRegion = page.getByRole('region', { name: 'Unassigned MRs' });
    await expect(unassignedRegion).toBeVisible({ timeout: 10_000 });
    await shot(page, 't9-02-unassigned-poll-result');

    const mrRefButton = unassignedRegion.getByRole('button', {
      name: `Assign ${MR_REF} to role`,
    });
    const mrRefIsActionable = await mrRefButton.isVisible().catch(() => false);

    // Ticket P3: an absent UI element is escalated as a discovery, never routed around via
    // scheduler.assignManual — see ticket Execution Log Round 2 P3 for the full discovery.
    test.fixme(
      !mrRefIsActionable,
      `TSK-131 P3: RoleScheduler#_filterActionable (role-scheduler.ts:467-503) dropped ${MR_REF} ` +
        `from this poll's actionable set (approved-by-me/idle/stale-draft filter) — no "Assign" ` +
        `button renders for it right now (see t9-02-unassigned-poll-result.png for the MRs that do).`
    );

    const assignResponse = page.waitForResponse((r) => /\/api\/mr\/.+\/assign$/.test(r.url()));
    await mrRefButton.click();
    await unassignedRegion.getByRole('button', { name: 'reviewer', exact: true }).click();
    const resp = await assignResponse;
    expect(
      resp.status(),
      `POST /api/mr/.../assign → ${resp.status()} body=${await resp.text()}`
    ).toBe(200);

    // assignMr fires assignManual fire-and-forget (board-provider.real.ts) — it awaits
    // _buildInitialCheckpoint before the instance lands, so poll rather than read synchronously.
    await expect
      .poll(() => app!.scheduler.findInstance(MR_URL)?.role, {
        message: 'expected a live RoleInstance for the MR after UI-driven assign',
        timeout: 150_000,
      })
      .toBe('reviewer');

    // Interface↔telemetry proof (D-125): the board itself now shows the MR "in work" under reviewer.
    await page.reload();
    const reviewerRoleRegion = page.getByRole('region', { name: /reviewer/i });
    await expect(reviewerRoleRegion.getByText(MR_REF)).toBeVisible({ timeout: 10_000 });

    // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P3 Exit
    console.info(`[t9] step=assigned-via-ui ts=${new Date().toISOString()}`);
    await shot(page, 't9-02-assigned');
  });
});
