// @file: t8 — gate action dry-run (headless chromium): drive a REAL live review to awaiting_operator,
//   then in the browser select a candidate and click «Постить выбранное» → assert POST /action 200
//   and a `DRY-RUN post→MR…` line in the browser console (the dry-run broadcaster fans the suppressed
//   VCS write over SSE), proving NO real GitLab write happened. The action seam requires a LIVE
//   RoleInstance at awaiting_operator (BoardProviderReal.executeAction → scheduler.findInstance,
//   state must be awaiting_operator) — a disk-only review cannot drive it — so this test owns a full
//   live review to node_ask, hence the long budget.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_URL, MR_REF, BASE_URL } from './_support.ts';
import { shot } from '../helpers/shot.ts';
import { logger } from '#logger';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;
let reachedAwaiting = false;

/** Hard live-drive budget — mirrors t9's P4/P7 1_200_000ms (600_000ms once starved mid-fanout). */
const DRIVE_DEADLINE_MS = Number(process.env.REVIEW_DRIVE_DEADLINE_MS ?? 1_200_000);
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
      logger.info(
        `[t8] tick ${ticks} ${Date.now() - t0}ms — state=${inst?.state ?? 'none'} node=${inst?.currentNode ?? 'n/a'}`
      );
      // node_ask is the only currentNode this test's action can act on (setAnswer+step) — role-instance.ts's
      // error-recovery escalation (_executeParallel/_applyRecovery) also sets state='awaiting_operator' when a
      // session exhausts retries WITHOUT advancing past its failing node; checking currentNode too tells a
      // genuine human-decision-point apart from a broken, never-synthesized run (TSK-131 P7 root cause).
      if (inst?.state === 'awaiting_operator' && inst.currentNode === 'node_ask') {
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
      `instance never reached a genuine node_ask awaiting_operator — state=${inst?.state} node=${inst?.currentNode}`
    ).toBe(true);

    // Capture EVERY console message, not just DRY-RUN-prefixed — self-diagnosing: if the DRY-RUN
    // assertion fails, the full transcript in its message says whether anything at all arrived.
    const allConsoleLines: string[] = [];
    const dryRunLines: string[] = [];
    page.on('console', (m) => {
      allConsoleLines.push(`[${m.type()}] ${m.text()}`);
      if (m.text().startsWith('DRY-RUN ')) dryRunLines.push(m.text());
    });

    // ChatPanel's dry-run SSE subscription (GET .../chat/stream) opens asynchronously on mount — acting
    // before it connects can broadcast-and-drop the DRY-RUN line for no one's fault. Wait for the
    // stream's own response instead of a fixed delay, so the test proves readiness rather than guessing it.
    const sseConnected = page.waitForResponse((r) => /\/chat\/stream$/.test(r.url()));
    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });
    await sseConnected;

    // A live LLM review is non-deterministic — this run may legitimately find zero candidates (t9's
    // independent P7 drive on the same MR did). "Постить выбранное" needs ≥1 selected candidate and
    // stays disabled at 0 — fall back to "Approve (гейт)" so the test proves the same action→dry-run
    // mechanism regardless of what this run's review contained.
    const candidateCheckboxCount = await page.locator('input[type="checkbox"]').count();
    let actionButton;
    if (candidateCheckboxCount > 0) {
      const firstCheckbox = page.locator('input[type="checkbox"]').first();
      await expect(firstCheckbox).toBeVisible({ timeout: 10_000 });
      await firstCheckbox.check();
      actionButton = page.getByRole('button', { name: 'Постить выбранное' });
    } else {
      actionButton = page.getByRole('button', { name: 'Approve (гейт)' });
    }
    await expect(actionButton).toBeEnabled({ timeout: 5_000 });

    const actionResp = page.waitForResponse((r) => /\/api\/mr\/.+\/action$/.test(r.url()));
    await actionButton.click();
    const resp = await actionResp;
    expect(resp.status(), `POST /action body: ${await resp.text()}`).toBe(200);

    // executeAction's `step()` only advances state past node_ask (awaiting_operator → idle,
    // currentNode=node_effect) — it does not itself run node_effect. The real serve command's own
    // tick timer drives idle instances forward; this harness has none, so node_effect needs an
    // explicit tick() here, exactly like the real timer eventually would (TSK-131 P7 root cause —
    // this was the actual reason this test used to fail, not a message-format or SSE-timing issue).
    const auditPath = join(stateDir!, 'agent-inbox', 'audit.jsonl');
    let effectApplied = false;
    for (let i = 0; i < 10 && !effectApplied; i++) {
      await app!.scheduler.tick();
      if (existsSync(auditPath)) {
        const entries = readFileSync(auditPath, 'utf-8')
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as Record<string, unknown>);
        effectApplied = entries.some((e) => e['event'] === 'effect_applied' && e['mr'] === MR_URL);
      }
      if (!effectApplied) await page.waitForTimeout(500);
    }

    // effectApplied can flip true as early as the FIRST tick above (node_effect ran synchronously
    // server-side) — but emitDryRun's SSE broadcast still has to travel HTTP response stream →
    // network → browser EventSource → onmessage → page.on('console'), all asynchronous relative to
    // the tick() call that triggered it. Asserting immediately races that delivery; poll briefly instead.
    for (let i = 0; i < 10 && dryRunLines.length === 0; i++) {
      await page.waitForTimeout(300);
    }

    await shot(page, 't8-action');

    expect(
      effectApplied,
      'expected an audit.jsonl effect_applied entry for this MR after the action'
    ).toBe(true);
    expect(
      dryRunLines.some((l) => l.startsWith('DRY-RUN post→MR')),
      `expected a "DRY-RUN post→MR …" console line; captured dryRunLines: ${JSON.stringify(dryRunLines)}; all console: ${JSON.stringify(allConsoleLines)}`
    ).toBe(true);
  });
});
