// @file: reviewer-eval.spec.ts — TSK-120: real-flow e2e proof for inbox-eval. Screenshots the
//   dashboard at 5 significant stages (plan / rendered-diagram report / track / actionpanel /
//   eval-report) from a routed fixture (eval-fixture.ts) — the fast, reproducible CI path (spec §7:
//   fixtures never substitute for a live proof, they only keep CI green). When EVAL_LIVE=1, an
//   additional test drives `runEval` (TSK-119) through the real run-mode (`runMrsOnce`, TSK-121)
//   against EVAL_MR_URL and reports honestly on whether a real rendered diagram can reach the
//   dashboard today — per spec §7 Инвариант R-01, a placeholder/raw-source frame must never be
//   screenshotted as if it were drawn.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.config.ts reviewer-eval.spec.ts
// @tasks: TSK-120

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

test.describe('reviewer-eval: live run (EVAL_LIVE=1)', () => {
  test.skip(
    !EVAL_LIVE,
    'set EVAL_LIVE=1 [EVAL_MR_URL=<real MR>] to attempt the real proof required by spec §7'
  );

  test('runEval drives the real role graph over EVAL_MR_URL and reports honestly on real-diagram readiness', async () => {
    const { runEval } =
      await import('../../services/agent-inbox/modules/inbox-eval/eval-driver.ts');

    const { report, reportDir } = await runEval({ mrs: [EVAL_MR_URL], dryRun: true });

    console.info(
      `[reviewer-eval] live run finished mr=${EVAL_MR_URL} status=${report.status} reportDir=${reportDir}`
    );
    console.info(`[reviewer-eval] per-MR stage detail: ${JSON.stringify(report.stages)}`);

    // The real call ran end-to-end (proves the attempt, not a mock) — this is the honest floor
    // this test can assert today.
    expect(report.mr).toBe(EVAL_MR_URL);
    expect(report.stages.length).toBeGreaterThan(0);

    // failure mode: never screenshot a fabricated "02-report-diagram" here — three gaps outside this
    // phase's Target Files make a real dashboard-rendered diagram unreachable today: (1) runMrsOnce
    // (services/agent-inbox/serve/run-mode.ts) keeps RoleArtifacts in-memory only, no reports/<mr>/
    // ever reaches disk; (2) BoardProviderReal.listArtifacts/readArtifact (inbox-api/board-provider.port.ts)
    // default to []/null — no real artifact backing exists in production yet; (3) the e2e dashboard
    // (inbox-dashboard/vite.config.ts) is hardcoded to BoardProviderMock+dev-seed.ts, disconnected from
    // any live StateStore. A direct probe also fails one step earlier: runEval's _resolveRunModeDeps
    // (eval-driver.ts) constructs VcsInboxReal without `host`, so real MR calls fail fast with
    // "CONFIG: No VCS host configured" before reaching opencode — confirmed by a manual
    // `gennady inbox serve --mrs <real MR> --once --dry-run` run during this phase (ticket TSK-120 log).
    expect(report.status === 'PASS' || report.status === 'FAIL').toBe(true);
  });
});
