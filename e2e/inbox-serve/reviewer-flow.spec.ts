// @file: reviewer-flow.spec.ts — end-to-end visual proof of the reviewer flow over the STANDARD
//   dashboard (BoardProviderReal + real StateStore), driven against an already-materialized real
//   review on disk (GENNADY_STATE_DIR + SERVE_REGISTER_MRS point the webServer at it). Screenshots
//   every significant stage into test-results/screenshots/, asserting the REAL content is on screen
//   BEFORE each shot so a blank/placeholder frame fails loudly instead of lying.
// @consumers: npx playwright test reviewer-flow.spec.ts
// @tasks: TSK-123

import { test, expect } from '@playwright/test';
import { shot } from './helpers/shot.ts';
import { waitForRealMermaidRender } from './helpers/wait-render.ts';

const MR_REF = 'vk-workspace/superapp!571';

test.describe('reviewer-flow: full flow over the standard dashboard (real report on disk)', () => {
  test('board → plan → README (overview/diagram/candidates) → track task → gate — screenshot each', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // ── 01 board: the reviewer lane carries the real MR card ──────────────────────────────
    await page.goto('/');
    const card = page.getByText(MR_REF, { exact: false }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await shot(page, 'flow-01-board');

    // open the detail
    await page.getByRole('button', { name: `View MR ${MR_REF}` }).click();
    const nav = page.locator('nav[aria-label="Артефакты"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // ── 02 plan: the review plan / tracks ─────────────────────────────────────────────────
    await nav.getByRole('button', { name: 'PLAN.md', exact: true }).click();
    await expect(page.getByText(/План ревью|Треки|tracks/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, 'flow-02-plan');

    // ── 03 README overview: the real synthesized summary ──────────────────────────────────
    await nav.getByRole('button', { name: 'README.md', exact: true }).click();
    await expect(page.getByText(/LiveMetricsSampler|кольцевой сэмплер/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, 'flow-03-readme-overview');

    // ── 04 diagram: the architecture mermaid, really drawn (svg[id^=mmd-]) ─────────────────
    const svg = await waitForRealMermaidRender(page, 30_000);
    await svg.scrollIntoViewIfNeeded();
    await svg.screenshot({ path: 'e2e/inbox-serve/test-results/screenshots/flow-04-diagram.png' });

    // ── 05 candidates: the real per-finding review with file:line addresses ───────────────
    // Target text UNIQUE to the candidates section ("зашито предположение" — appears nowhere else;
    // matching "app-metrics…" would hit the diagram at the top instead). Scroll it into the viewport
    // (the artifact body is its own scroll container) and take a VIEWPORT shot so the findings show.
    const candText = page.getByText(/зашито предположение/i).first();
    await candText.scrollIntoViewIfNeeded();
    await expect(candText).toBeInViewport({ timeout: 5_000 });
    await page.screenshot({
      path: 'e2e/inbox-serve/test-results/screenshots/flow-05-readme-candidates.png',
    });

    // ── 06 track task: a per-track report file (scaffolded scope + probes + the agent directive) ──
    await nav.getByRole('button', { name: 'logic.task.md', exact: true }).click();
    await expect(page.getByText(/track: logic|Файлы \(4\)/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, 'flow-06-task-logic');

    // ── 07 gate: back on the report, the awaiting-operator action controls (post/approve/skip) ────
    await nav.getByRole('button', { name: 'README.md', exact: true }).click();
    await expect(page.getByText(/LiveMetricsSampler|кольцевой сэмплер/i).first()).toBeVisible();
    const gate = page.getByRole('button', { name: /Approve|Skip|Постить/i }).first();
    await expect(gate).toBeVisible({ timeout: 10_000 });
    await shot(page, 'flow-07-gate-actions');

    // ── 08 candidates panel: the reviewer's actual actionable output — real findings the operator
    //    selects and posts (fed from the persisted review.json, not an empty live instance) ─────────
    await expect(page.getByText(/Кандидаты \(\d+\)/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Кандидаты \(0\)/)).toHaveCount(0); // must NOT be empty
    await expect(page.getByText(/app-metrics-sampler\.utils\.ts:101/).first()).toBeVisible();
    await shot(page, 'flow-08-candidates-panel');
  });
});
