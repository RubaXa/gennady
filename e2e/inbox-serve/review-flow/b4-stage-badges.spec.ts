// @file: B4 — the stage badge on the board (progress.stageLabel, review-progress.ts NODE_STAGE
//   map) actually advances through plan → enrich → lenses → synthesis as the real reviewer graph
//   runs, not frozen on one label. Drives the SAME live graph as t3-t4 (one real MR, real LLM
//   sessions) and reads the badge via the real board API on each tick — a UI-facing check, not
//   just backend node state.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-155

import { test, expect } from '@playwright/test';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_URL, BASE_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

const DRIVE_DEADLINE_MS = Number(process.env.REVIEW_DRIVE_DEADLINE_MS ?? 900_000);
const MAX_TICKS = 40;

type BoardMr = { webUrl: string; progress?: { stageLabel?: string } };
type BoardResponse = { roles: Array<{ lanes: Record<string, BoardMr[]> }> };

test.describe('B4 stage badges', () => {
  test.beforeAll(async () => {
    test.setTimeout(DRIVE_DEADLINE_MS + 300_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('badge advances through at least 3 distinct stages as the real graph runs', async ({
    page,
  }) => {
    test.setTimeout(DRIVE_DEADLINE_MS + 300_000);
    await app!.scheduler.assignManual(MR_URL, 'reviewer');
    await page.goto(BASE_URL);

    const seenLabels = new Set<string>();
    const deadline = Date.now() + DRIVE_DEADLINE_MS;
    let ticks = 0;

    while (ticks < MAX_TICKS && Date.now() < deadline) {
      await app!.scheduler.tick();
      ticks++;

      const board = (await page.evaluate(async () => {
        const res = await fetch('/api/board');
        return res.json();
      })) as BoardResponse;

      const mr = board.roles
        .flatMap((r) => Object.values(r.lanes).flat())
        .find((m) => m.webUrl === MR_URL);

      if (mr?.progress?.stageLabel) seenLabels.add(mr.progress.stageLabel);

      const inst = app!.scheduler.findInstance(MR_URL);
      // eslint-disable-next-line no-console -- localizes a stall to a node, not a bare timeout
      console.info(
        `[b4] tick ${ticks} state=${inst?.state ?? 'none'} node=${inst?.currentNode ?? 'n/a'} badge=${mr?.progress?.stageLabel ?? 'n/a'}`
      );

      if (
        inst &&
        (inst.state === 'done' || inst.state === 'error' || inst.state === 'awaiting_operator')
      )
        break;
    }

    expect(
      seenLabels.size,
      `expected the badge to move through ≥3 distinct stages, saw: ${[...seenLabels].join(', ')}`
    ).toBeGreaterThanOrEqual(3);
  });
});
