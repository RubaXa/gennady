// @file: t3 + t4 — the LIVE proof: drive the REAL role graph over MR_REF via scheduler.tick() until
//   the review materializes on disk, then assert (t3) PLAN.md + README.md + tasks/*.task.md exist and
//   (t4) review.json carries F-<n> findings + a numeric revision. One live review (~20 min: the
//   reviewer graph runs sequential real LLM session nodes node_track_review → node_security_lens →
//   node_code_review → node_synthesize) serves both assertions — re-running it per test would double
//   the LLM cost for no signal. Per-tick state/currentNode is logged so a stall is localized to a
//   node, not hidden behind a timeout.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_URL, MR_REF } from './_support.ts';
import { mrReportsDir } from '../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;
let reviewDir: string;
let reviewPath: string;
let materialized = false;

/** @purpose Hard 10-min wall-clock budget for the live drive (env-overridable). Exceeding it FAILS
 *   the test with the last tick's node, so a stall is localized instead of hanging tens of minutes. */
const DRIVE_DEADLINE_MS = Number(process.env.REVIEW_DRIVE_DEADLINE_MS ?? 900_000);
/** @purpose Tick bound — one session node advances per tick; the graph has < ~12 nodes to synthesis. */
const MAX_TICKS = 40;

test.describe('t3+t4 live review over the real MR', () => {
  test.beforeAll(async () => {
    test.setTimeout(DRIVE_DEADLINE_MS + 300_000);
    ({ stateDir, reviewPath } = await makeStateDir({ seedReview: false }));
    reviewDir = mrReportsDir(stateDir, MR_REF);
    app = await bootReal(stateDir);

    await app.scheduler.assignManual(MR_URL, 'reviewer');

    let ticks = 0;
    const deadline = Date.now() + DRIVE_DEADLINE_MS;
    while (!existsSync(reviewPath) && ticks < MAX_TICKS && Date.now() < deadline) {
      const t0 = Date.now();
      await app.scheduler.tick();
      ticks++;
      const inst = app.scheduler.findInstance(MR_URL);
      // eslint-disable-next-line no-console -- localizes a stall to a node instead of a bare timeout
      console.info(
        `[t3t4] tick ${ticks} ${Date.now() - t0}ms — state=${inst?.state ?? 'none'} node=${inst?.currentNode ?? 'n/a'}`
      );
      if (inst && (inst.state === 'done' || inst.state === 'error')) break;
    }
    materialized = existsSync(reviewPath);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('t3: PLAN.md + README.md + tasks/*.task.md materialized on disk', () => {
    const inst = app!.scheduler.findInstance(MR_URL);
    expect(
      materialized,
      `review never materialized — instance state=${inst?.state} node=${inst?.currentNode}`
    ).toBe(true);
    expect(existsSync(join(reviewDir, 'PLAN.md'))).toBe(true);
    expect(existsSync(join(reviewDir, 'README.md'))).toBe(true);
    expect(existsSync(join(reviewDir, 'tasks'))).toBe(true);
  });

  test('t4: review.json has F-<n> findings + numeric revision', () => {
    expect(materialized, 'review.json never materialized').toBe(true);
    const doc = JSON.parse(readFileSync(reviewPath, 'utf-8'));
    expect(Array.isArray(doc.findings)).toBe(true);
    expect(doc.findings.length).toBeGreaterThan(0);
    for (const f of doc.findings as Array<{ id: string }>) {
      expect(f.id).toMatch(/^F-\d+$/);
    }
    expect(typeof doc.revision).toBe('number');
  });
});
