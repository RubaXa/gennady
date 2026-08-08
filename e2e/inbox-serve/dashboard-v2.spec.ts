// @file: Dashboard v2 self-contained e2e — boots a real mock serve with TSK-166 seeded
//   fixtures, runs observable stages for all P1-P4 UI changes, and captures visual proof.
// @consumers: Playwright real inbox-serve verification
// @tasks: TSK-164 TSK-169

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap, type BootstrapResult } from '../../services/agent-inbox/serve/bootstrap.ts';
import { gracefulShutdown } from '../../services/agent-inbox/serve/shutdown.ts';
import { seedMr } from '../../services/agent-inbox/test/seed.ts';
import { StateStore } from '../../services/agent-inbox/modules/inbox-core/state-store.ts';
import type { SyncSnapshot } from '../../services/agent-inbox/modules/inbox-vcs/sync.ts';
import type { VcsActionableMr } from '../../services/vcs-client/entities/vcs-actionable-mr.type.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = resolve(__dirname, 'test-results', 'dashboard-v2');
const BASE_TS = '2026-08-08T00:00:00.000Z';
const PORT = 4191;

/** @purpose Valid VCS MR with deterministic fields for dashboard projection. */
function makeVcsMr(
  project: string,
  iid: string,
  overrides: Partial<VcsActionableMr> = {}
): VcsActionableMr {
  return {
    iid,
    project,
    webUrl: `https://gitlab.example.com/${project}/-/merge_requests/${iid}`,
    title: `feat: ${project}!${iid} — тестовый MR для доски`,
    description: 'Описание для тестового MR',
    author: 'i.petrov',
    reviewers: ['reviewer1', 'reviewer2'],
    approvedBy: ['reviewer1'],
    updatedAt: BASE_TS,
    draft: false,
    state: 'opened',
    role: 'reviewer',
    events: [],
    directlyAddressed: false,
    todoIds: [],
    headSha: 'abc123def',
    pipelineStatus: 'success',
    approvalsRequired: 2,
    ...overrides,
  };
}

/** @purpose Valid SyncSnapshot that the board projection consumes. */
function makeSyncSnapshot(
  project: string,
  iid: string,
  overrides: Partial<SyncSnapshot> = {}
): SyncSnapshot {
  const mr = makeVcsMr(project, iid);
  return {
    mr,
    role: 'reviewer',
    attention: '⏳',
    stage: 'review_needed',
    approvals: { n: 1, m: 2, approvedBy: ['reviewer1'] },
    reviewers: ['reviewer1', 'reviewer2'],
    ci: { status: 'success' },
    threads: { open: 1, total: 2, awaitingMe: 1 },
    headSha: 'abc123def',
    lastReviewedHeadSha: null,
    updatedAt: BASE_TS,
    estimated: false,
    ...overrides,
  };
}

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: resolve(SHOTS_DIR, `dashboard-v2-${name}.png`),
    fullPage: true,
  });
}

async function elementShot(
  page: Page,
  locator: string,
  name: string,
  opts?: { fullPage?: boolean }
) {
  const el = page.locator(locator);
  await expect(el).toBeVisible({ timeout: 20_000 });
  await el.screenshot({
    path: resolve(SHOTS_DIR, `dashboard-v2-${name}.png`),
  });
}

let serve: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('dashboard v2 self-contained e2e (TSK-169 design-system proof)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    mkdirSync(SHOTS_DIR, { recursive: true });

    stateDir = mkdtempSync(join(tmpdir(), 'inbox-dashboard-e2e-'));
    const inboxDir = join(stateDir, 'agent-inbox');

    const store = new StateStore(stateDir);
    await store.saveConfig({
      reposBase: join(homedir(), 'Developer'),
      vcsHost: 'gitlab.example.com',
    });

    const taskStartTs = new Date(Date.now() - 120_000).toISOString();

    const snap1 = makeSyncSnapshot('group/project', '41', { attention: '⏳' });
    const snap2 = makeSyncSnapshot('group/project', '42', { attention: '💬' });

    await seedMr({
      stateDir,
      ref: 'group/project!41',
      events: [
        {
          ts: BASE_TS,
          kind: 'gitlab_event',
          payload: { event: 'created', data: { title: 'MR открыт' } },
        },
        {
          ts: '2026-08-08T00:01:00.000Z',
          kind: 'widget_bump',
          payload: {
            items: [
              {
                id: 'f1',
                severity: 'high',
                file: 'src/retry.ts',
                line: 118,
                summary: 'Ретрай без джиттера — возможен шторм',
                factcheck: 'verified',
                diff: [
                  { type: 'context', num: 117, text: '  buffer.extend_from_slice(&chunk);' },
                  { type: 'remove', num: 118, text: '- // Unbounded append' },
                  {
                    type: 'add',
                    num: 118,
                    text: '+ if (buffer.length + chunk.length > MAX_PAYLOAD) {',
                  },
                  { type: 'add', num: 119, text: '+   return Err(Error::PayloadTooLarge);' },
                  { type: 'add', num: 120, text: '+ }' },
                  { type: 'context', num: 121, text: '  buffer.extend_from_slice(&chunk);' },
                ],
              },
              {
                id: 'f2',
                severity: 'medium',
                file: 'src/queue.ts',
                line: 88,
                summary: 'Нет метрики на флуд событий',
                factcheck: 'pending',
              },
              {
                id: 'f3',
                severity: 'medium',
                file: 'src/auth.rs',
                line: 42,
                summary: 'Тред @rev2 отвечен, есть инсайт',
                factcheck: 'verified',
                hidden: true,
              },
            ],
          },
        },
        {
          ts: '2026-08-08T00:02:00.000Z',
          kind: 'artifact_produced',
          payload: { path: 'review.json', title: 'Review Report' },
        },
        {
          ts: taskStartTs,
          kind: 'task_created',
          payload: { taskId: '#1', type: 'plan' },
        },
        {
          ts: taskStartTs,
          kind: 'task_status',
          payload: { taskId: '#1', status: 'running' },
        },
      ],
      sync: snap1,
    });

    await seedMr({
      stateDir,
      ref: 'group/project!42',
      events: [
        {
          ts: BASE_TS,
          kind: 'gitlab_event',
          payload: { event: 'created', data: { title: 'Второй MR' } },
        },
        {
          ts: '2026-08-08T00:04:00.000Z',
          kind: 'proposal',
          payload: {
            stage: 'Review Stage',
            tracksDone: 1,
            tracksTotal: 3,
            queuePosition: 1,
          },
        },
      ],
      sync: snap2,
    });

    writeFileSync(
      join(inboxDir, 'sync-snapshots.json'),
      JSON.stringify([snap1, snap2], null, 2) + '\n'
    );

    serve = await bootstrap({ mocks: true, port: PORT, stateDir });
  });

  test.afterAll(async () => {
    if (serve) {
      try {
        await gracefulShutdown({
          server: serve.server,
          scheduler: serve.scheduler,
          opencode: serve.opencode,
          opencodeProcess: serve.opencodeProcess,
          opencodePidFile: serve.opencodePidFile,
        });
      } catch {
        /* best-effort */
      }
    }
    if (stateDir) {
      try {
        rmSync(stateDir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });

  test('(1) first frame → (2) board lanes + accent bars → (3) rail close-up', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/#/mr/group%2Fproject!42`, {
      waitUntil: 'domcontentloaded',
    });
    await shot(page, '01-first-frame');

    await page.goto(`http://localhost:${PORT}/#/`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('main.v2-board')).toBeVisible({
      timeout: 30_000,
    });

    const card41 = page.getByRole('button', { name: /Открыть group\/project!41/ });
    await expect(card41).toBeVisible({ timeout: 10_000 });
    const card42 = page.getByRole('button', { name: /Открыть group\/project!42/ });
    await expect(card42).toBeVisible();

    await expect(card41.locator('b')).toContainText('group/project!41');

    await shot(page, '02-board-lanes');

    await elementShot(page, 'aside.v2-rail', '03-rail', { fullPage: false });
  });

  test('(4) card with live timer — two frames', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/#/`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('main.v2-board')).toBeVisible({
      timeout: 30_000,
    });

    const card41 = page.getByRole('button', { name: /Открыть group\/project!41/ });
    await expect(card41).toBeVisible({ timeout: 10_000 });
    const timer1 = card41.locator('.v2-timer');

    await expect(timer1).toBeVisible({ timeout: 10_000 });
    const text1 = await timer1.textContent();
    await elementShot(page, 'button[aria-label*="group/project!41"]', '04a-timer-frame1', {
      fullPage: false,
    });

    await page.waitForTimeout(2100);

    const text2 = await timer1.textContent();
    expect(text2).not.toBe(text1);

    await elementShot(page, 'button[aria-label*="group/project!41"]', '04b-timer-frame2', {
      fullPage: false,
    });
  });

  test('(5) MR feed + (6) findings with expanded diff-note', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/#/mr/group%2Fproject!41`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByLabel('Информер MR')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Лента MR')).toBeVisible({ timeout: 15_000 });

    await shot(page, '05-mr-feed');

    const findingsWidget = page.locator('[data-widget-type="findings"]');
    await expect(findingsWidget).toBeVisible({ timeout: 10_000 });

    const badged = findingsWidget.locator('.v2-finding-badge');
    await expect(badged.first()).toBeVisible();

    const location = findingsWidget.locator('.v2-finding-location');
    await expect(location.first()).toBeVisible();

    const toggle = findingsWidget.locator('.v2-finding-toggle').first();
    await toggle.click();
    await page.waitForTimeout(500);

    const diffLines = findingsWidget.locator('.v2-finding-diff-lines');
    await expect(diffLines.first()).toBeVisible({ timeout: 5_000 });

    await shot(page, '06-findings-expanded');
  });

  test('(7) plan step-flow — project!42', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/#/mr/group%2Fproject!42`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByLabel('Информер MR')).toBeVisible({ timeout: 20_000 });

    const planWidget = page.locator('[data-widget-type="plan"]');
    await expect(planWidget).toBeVisible({ timeout: 15_000 });

    const planFlow = planWidget.locator('.v2-plan-flow');
    await expect(planFlow).toBeVisible();

    const progressBar = planWidget.locator('.v2-plan-progress');
    await expect(progressBar).toBeVisible();

    await elementShot(page, '[data-widget-type="plan"]', '07-plan-step-flow', {
      fullPage: false,
    });
  });

  test('(8) chat with quick-chips + (9) decision flow', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/#/mr/group%2Fproject!42`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('complementary', { name: 'Чат' })).toBeVisible({ timeout: 20_000 });

    const chips = page.locator('.v2-chips');
    await expect(chips).toBeVisible({ timeout: 5_000 });

    const chipButtons = chips.locator('button');
    await expect(chipButtons.first()).toBeVisible();

    const questionBtn = chipButtons.getByText('Спросить');
    await questionBtn.click();

    const input = page.getByLabel('Вопрос в чат');
    const value = await input.inputValue();
    expect(value).toContain('Спросить');

    await elementShot(page, '.v2-chat', '08-chat-with-chips', { fullPage: false });

    const decisionPanel = page.getByLabel('Решение по предложению');
    await expect(decisionPanel).toBeVisible({ timeout: 10_000 });
    await expect(decisionPanel.getByRole('button', { name: 'Принять' })).toBeVisible();
    await expect(decisionPanel.getByRole('button', { name: 'Отклонить' })).toBeVisible();

    await elementShot(page, '[aria-label="Решение по предложению"]', '09-decision-flow', {
      fullPage: false,
    });
  });

  test('back to board — both MRs still visible', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/#/`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('main.v2-board')).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByRole('button', { name: /Открыть group\/project!41/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: /Открыть group\/project!42/ })).toBeVisible();
  });
});
