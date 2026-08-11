// @file: reviewer-eval.spec.ts — TSK-120: real-flow e2e proof for inbox-eval. Screenshots the
//   dashboard at 5 significant stages (plan / rendered-diagram report / track / actionpanel /
//   eval-report) from a routed fixture (eval-fixture.ts) — the fast, reproducible CI path (spec §7:
//   fixtures never substitute for a live proof, they only keep CI green). When EVAL_LIVE=1
//   (TSK-122 P3), a real Playwright test materializes EVAL_MR_URL's real changeset onto disk via
//   `runEval`, then drives the SAME EVAL_LIVE-gated live dashboard (BoardProviderReal over the real
//   StateStore) for 01-plan/02-report-diagram, reporting honestly on whether a real drawn diagram
//   reaches the dashboard today — per spec §7 Инвариант R-01, a placeholder/raw-source frame must
//   never be screenshotted as if it were drawn.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.config.ts reviewer-eval.spec.ts
// @tasks: TSK-120, TSK-122

import { test, expect, type Page } from '@playwright/test';
import {
  EVAL_FIXTURE_MR_URL,
  evalFixtureBoardData,
  evalFixtureArtifactRefs,
  evalFixtureArtifactContents,
  evalFixtureMrDetail,
} from './fixtures/eval-fixture.ts';
import { shot } from './helpers/shot.ts';
import { waitForRealMermaidRender } from './helpers/wait-render.ts';
import { logger } from '#logger';

/** @purpose Live-run opt-in switch | @invariant Unset by default — the fixture path is the fast/reproducible default (spec §7, BDD scenario 4). */
const EVAL_LIVE = process.env.EVAL_LIVE === '1';

/** @purpose Real MR under evaluation when EVAL_LIVE is set | @default spec §5's documented fixture MR (calendar/board!1296) */
const EVAL_MR_URL =
  process.env.EVAL_MR_URL ?? 'https://gitlab.corp.mail.ru/calendar/board/-/merge_requests/1296';

/** @purpose Dashboard hash-route id for the fixture MR, matching App.tsx's `project!iid` decode. */
const FIXTURE_MR_ID = 'vk-workspace/superapp!571';

/**
 * @purpose Route `/api/board` and `/api/mr/**` to the eval fixture so the dashboard renders
 *   recorded content without a live run-mode pass.
 * @param page Playwright page to install routes on.
 * @sideEffect Installs `page.route` intercepts.
 */
async function routeEvalFixture(page: Page): Promise<void> {
  const artifactContents = evalFixtureArtifactContents();

  await page.route('**/api/board', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, ...evalFixtureBoardData() }),
    });
  });

  await page.route('**/api/mr/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/artifacts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, artifacts: evalFixtureArtifactRefs() }),
      });
      return;
    }
    if (url.pathname.endsWith('/artifact')) {
      const artifactPath = url.searchParams.get('path') ?? '';
      const content = artifactContents[artifactPath];
      if (!content) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'NOT_FOUND', detail: artifactPath }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, ...content }),
      });
      return;
    }
    if (url.pathname.endsWith('/report')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, ...evalFixtureMrDetail() }),
      });
      return;
    }
    await route.continue();
  });
}

test.describe('reviewer-eval: fixture path (fast, reproducible CI check)', () => {
  test.skip(
    EVAL_LIVE,
    'fixture path is the non-EVAL_LIVE default; see the live describe block below'
  );

  test('walks plan → rendered-diagram report → track → actionpanel → eval-report, screenshotting each', async ({
    page,
  }) => {
    await routeEvalFixture(page);
    await page.goto(`/#/mr/${encodeURIComponent(FIXTURE_MR_ID)}`);

    const nav = page.locator('nav[aria-label="Артефакты"]');
    await expect(nav).toBeVisible({ timeout: 10_000 });

    // 01-plan — real (fixture-recorded) PLAN.md content for this MR's fan-out tracks.
    await nav.getByRole('button', { name: 'PLAN.md', exact: true }).click();
    await expect(page.locator('text=Дорожки')).toBeVisible({ timeout: 5_000 });
    await shot(page, 'eval-real-01-plan');

    // 02-report-diagram — REPORT.md, default-selected; mermaid must be ACTUALLY DRAWN (real <svg>
    // with node/edge markup), never the "отрисовка…" pending placeholder or raw-source fallback.
    await nav.getByRole('button', { name: 'REPORT.md', exact: true }).click();
    await expect(
      page.locator('text=Summary of findings for vk-workspace/superapp!571')
    ).toBeVisible({
      timeout: 5_000,
    });
    await waitForRealMermaidRender(page);
    await shot(page, 'eval-real-02-report-diagram');

    // 03-track — one fan-out track's findings/verdict artifact.
    await nav.getByRole('button', { name: 'auth.md', exact: true }).click();
    await expect(page.locator('text=Track: auth')).toBeVisible({ timeout: 5_000 });
    await shot(page, 'eval-real-03-track');

    // 04-actionpanel — proposed actions/candidates panel (renamed from "findings" per D-86).
    await expect(page.locator('text=Кандидаты (2)')).toBeVisible({ timeout: 5_000 });
    await shot(page, 'eval-real-04-actionpanel');

    // 05-eval-report — the eval harness's own report, exposed as one more artifact: status + gates.
    await nav.getByRole('button', { name: 'eval-report.md', exact: true }).click();
    await expect(page.locator('text=Status: PASS')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Gate | Result | Evidence').first()).toBeVisible();
    await expect(page.locator('text=G10').first()).toBeVisible();
    await shot(page, 'eval-real-05-eval-report');
  });
});

test.describe('reviewer-eval: live run (EVAL_LIVE=1) — drives the real dashboard, real screenshots', () => {
  test.skip(
    !EVAL_LIVE,
    'set EVAL_LIVE=1 EVAL_MR_URL=<real MR> GENNADY_STATE_DIR=<temp dir> to attempt the real proof required by spec §7'
  );

  // spec §7 real-proof: materialize EVAL_MR_URL's real changeset onto disk (gap-2, P1) into a TEMP
  // GENNADY_STATE_DIR (never ~/.gennady), then drive the SAME live dashboard Playwright's webServer
  // already started with EVAL_LIVE=1 (vite.config.ts's startLiveServer → bootstrap({ mocks: false,
  // stateDir: GENNADY_STATE_DIR }), BoardProviderReal over the real StateStore, gap-3/gap-4) —
  // BoardProviderReal.listArtifacts/readArtifact re-read the filesystem on every call, so
  // materializing AFTER the server already started still surfaces the fresh files.
  //
  // Requires GENNADY_STATE_DIR explicitly — this test throws rather than silently falling back to
  // ~/.gennady (spec §7's "never touch the operator's real state" floor).
  //
  // Only walks 01-plan / 02-report-diagram here — 03-track/04-actionpanel/05-eval-report need a
  // completed LLM synthesis (real per-track findings + proposedActions), which this phase's live
  // probe found still blocked upstream of node_synthesize (see ticket TSK-122 P3 Execution Log:
  // real GitLab token 200, real git worktree/changeset fetch succeeds, opencode serve is reachable
  // and answers raw prompts correctly, yet the role graph's own session nodes (node_track_review et
  // al.) fail near-instantly with SESSION_ERROR/UnknownError — a pre-existing issue in
  // role-instance.ts/opencode.real.ts session wiring, outside this test-only phase's Target Files).
  // waitForRealMermaidRender still asserts a genuinely DRAWN diagram (never a placeholder) — the
  // deterministic _buildMinimalChangeGraph fallback in reviewer.role.ts draws from the real
  // changeset even when synthesis text itself is thin.
  test('materializes the real MR onto disk, then drives the EVAL_LIVE dashboard for a REAL rendered mermaid diagram', async ({
    page,
  }) => {
    const stateDir = process.env.GENNADY_STATE_DIR;
    if (!stateDir) {
      throw new Error(
        'EVAL_LIVE=1 requires GENNADY_STATE_DIR=<temp dir> — this test never defaults to ' +
          '~/.gennady (spec §7 real-proof invariant: never touch the operator real state).'
      );
    }

    const { runEval } =
      await import('../../services/agent-inbox/modules/inbox-eval/eval-driver.ts');

    const { report, reportDir } = await runEval({ mrs: [EVAL_MR_URL], dryRun: true }, { stateDir });

    logger.info(
      `[reviewer-eval:live] materialization finished mr=${EVAL_MR_URL} status=${report.status} reportDir=${reportDir}`
    );
    logger.info(`[reviewer-eval:live] per-MR stage detail: ${JSON.stringify(report.stages)}`);
    expect(report.mr).toBe(EVAL_MR_URL);

    // Resolve the same `project!iid` ref BoardProviderReal/the dashboard route on (MrCard#mrKey) —
    // mirrors `mrReportsDir`'s own ref shape, not the raw MR URL.
    const match = EVAL_MR_URL.match(/^https?:\/\/[^/]+\/(.+)\/-\/merge_requests\/(\d+)/);
    if (!match) {
      throw new Error(`EVAL_MR_URL does not look like a GitLab MR URL: ${EVAL_MR_URL}`);
    }
    const [, project, iid] = match;
    const mrRef = `${project}!${iid}`;

    await page.goto(`/#/mr/${encodeURIComponent(mrRef)}`);

    const nav = page.locator('nav[aria-label="Артефакты"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // 01-plan — real PLAN.md materialized from THIS run's real changeset.
    const planButton = nav.getByRole('button', { name: 'PLAN.md', exact: true });
    await expect(planButton).toBeVisible({ timeout: 10_000 });
    await planButton.click();
    await shot(page, 'eval-real-01-plan');

    // 02-report-diagram — README.md must carry a REAL, drawn mermaid svg[id^=mmd-] (never the
    // pending placeholder, never raw fenced source) — the honest floor spec §7 demands.
    const readmeButton = nav.getByRole('button', { name: 'README.md', exact: true });
    await expect(readmeButton).toBeVisible({ timeout: 10_000 });
    await readmeButton.click();
    await waitForRealMermaidRender(page, 45_000);
    await shot(page, 'eval-real-02-report-diagram');

    logger.info('[reviewer-eval:live] REAL rendered mermaid diagram confirmed for', EVAL_MR_URL);
  });
});
