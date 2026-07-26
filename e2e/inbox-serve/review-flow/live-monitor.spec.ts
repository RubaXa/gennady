// @file: live-monitor.spec.ts — песочница: следит за живым ревью от старта до финиша
// Запуск: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts live-monitor.spec.ts

import { test, expect, type Page } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_URL, MR_REF } from './_support.ts';
import { mrReportsDir } from '../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = resolve(__dirname, '..', 'test-results', 'screenshots');
mkdirSync(SHOTS_DIR, { recursive: true });

const BASE = 'http://localhost:4174';
const POLL_MS = 3000;
const MAX_WAIT_MS = 900_000;

let app: BootstrapResult | undefined;
let stateDir: string | undefined;
let reviewPath: string;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS_DIR, `live-${name}.png`), fullPage: true });
}

test.describe('Живое наблюдение за ревью MR', () => {
  test.beforeAll(async () => {
    test.setTimeout(MAX_WAIT_MS + 120_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    reviewPath = join(mrReportsDir(stateDir, MR_REF), 'review.json');
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('Полный путь: доска → стадии → артефакты → кандидаты → финал', async ({ page }) => {
    const log: string[] = [];
    const seenNodes = new Set<string>();

    function note(msg: string) { console.log(msg); log.push(msg); }

    // ═══ Шаг 0: холодный старт ═══
    await page.goto(BASE);
    await expect(page.locator('header h1')).toContainText('agent-inbox', { timeout: 15_000 });
    await page.waitForTimeout(2000);
    await shot(page, '00-cold-start');
    note('📸 00: холодный старт — дашборд загружен');

    // ═══ Шаг 1: активация роли ═══
    const reviewerBlock = page.locator('section[aria-label="Role: reviewer"]');
    await expect(reviewerBlock).toBeVisible({ timeout: 10_000 });
    const activateBtn = reviewerBlock.locator('button[aria-label^="Activate"]');
    if (await activateBtn.isVisible().catch(() => false)) {
      await activateBtn.click();
      await page.waitForTimeout(3000);
      note('📸 01: роль reviewer активирована');
    } else {
      note('📸 01: роль уже активна');
    }
    await shot(page, '01-role-active');

    // ═══ Шаг 2: назначить MR на reviewer ═══
    const unassignedBlock = page.locator('section[aria-label="Unassigned MRs"]');
    const assignBtn = unassignedBlock.locator('button[aria-label^="Assign"]').first();
    if (await assignBtn.isVisible().catch(() => false)) {
      await assignBtn.click();
      await page.waitForTimeout(500);
      const dropdown = page.locator('.bg-popover');
      if (await dropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dropdown.locator('button:has-text("reviewer")').click();
        await page.waitForTimeout(2000);
        note('📸 02: MR назначен → ждём появления в INBOX');
      }
    }
    await shot(page, '02-assigned');

    // ═══ Запускаем ревью в фоне ═══
    note('🚀 Запуск ревью...');
    app!.scheduler.assignManual(MR_URL, 'reviewer').catch(() => {});

    // Ждём появления MR в INBOX
    let mrInInbox = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(2000);
      const inboxLane = reviewerBlock.locator('[aria-label="INBOX lane"]');
      const cards = inboxLane.locator('div[role="listitem"]');
      if (await cards.count().catch(() => 0) > 0) {
        mrInInbox = true;
        break;
      }
      await page.goto(BASE);
      await page.waitForTimeout(1000);
    }
    if (mrInInbox) note('✅ MR появился в INBOX');

    // ═══ Шаг 3: мониторинг стадий ═══
    note('🔍 Мониторинг стадий ревью...');
    const deadline = Date.now() + MAX_WAIT_MS;
    let stepNum = 3;

    while (Date.now() < deadline) {
      await page.waitForTimeout(POLL_MS);

      // Смотрим на доску — какая стадия у карточки?
      await page.goto(BASE);
      await page.waitForTimeout(1000);

      const inboxLane = page.locator('section[aria-label="Role: reviewer"] [aria-label="INBOX lane"]');
      const mrCards = inboxLane.locator('div[role="listitem"]');
      const count = await mrCards.count().catch(() => 0);
      if (count === 0) {
        // MR мог уйти в DONE или другую линию
        const doneLane = page.locator('section[aria-label="Role: reviewer"] [aria-label="DONE lane"]');
        const doneCards = doneLane.locator('div[role="listitem"]');
        if (await doneCards.count().catch(() => 0) > 0) {
          note('📸 Финал: MR в DONE!');
          await shot(page, `0${stepNum}-done`);
          stepNum++;
          break;
        }
        continue;
      }

      // Читаем aria-label карточки (содержит стадию)
      const cardLabel = await mrCards.first().getAttribute('aria-label').catch(() => '');
      
      // Проверяем серверное состояние
      const inst = app!.scheduler.findInstance(MR_URL);
      const node = inst?.currentNode ?? 'n/a';
      const state = inst?.state ?? 'n/a';

      if (!seenNodes.has(node)) {
        seenNodes.add(node);
        note(`📸 0${stepNum}: стадия изменилась → ${node} (state: ${state})`);
        note(`   aria-label карточки: ${cardLabel}`);
        await shot(page, `0${stepNum}-stage-${node.replace(/\//g, '-')}`);
        stepNum++;
      }

      // Проверяем — не завершилось ли ревью?
      if (state === 'awaiting_operator' || state === 'done' || state === 'error') {
        note(`🏁 Терминальное состояние: ${state}`);
        break;
      }

      // Запускаем тик (если scheduler ещё жив)
      try {
        await app!.scheduler.tick();
      } catch { /* ok */ }
    }

    // ═══ Шаг 4: детальная страница MR ═══
    note('📄 Открываю страницу MR...');
    await page.goto(`${BASE}/#/mr/${encodeURIComponent(MR_REF)}`);
    await page.waitForTimeout(5000);
    await shot(page, `0${stepNum}-mr-detail`);
    stepNum++;

    // Артефакты
    const nav = page.locator('nav[aria-label="Артефакты"]');
    if (await nav.isVisible({ timeout: 5000 }).catch(() => false)) {
      const tabs = nav.locator('button');
      const tabCount = await tabs.count();
      note(`📚 Артефактов: ${tabCount}`);
      for (let i = 0; i < tabCount; i++) {
        const btn = tabs.nth(i);
        const text = (await btn.textContent().catch(() => '')) || `tab-${i}`;
        await btn.click();
        await page.waitForTimeout(800);
      }
      await shot(page, `0${stepNum}-artifacts`);
      stepNum++;
    }

    // ActionPanel
    const approveBtn = page.locator('button:has-text("Approve")');
    const postBtn = page.locator('button:has-text("Постить")');
    const skipBtn = page.locator('button:has-text("Skip")');
    const hasApprove = await approveBtn.isVisible().catch(() => false);
    const hasPost = await postBtn.isVisible().catch(() => false);
    const hasSkip = await skipBtn.isVisible().catch(() => false);
    note(`🎯 ActionPanel: approve=${hasApprove} post=${hasPost} skip=${hasSkip}`);
    await shot(page, `0${stepNum}-action-panel`);
    stepNum++;

    // review.json на диске
    const hasReview = existsSync(reviewPath);
    if (hasReview) {
      const doc = JSON.parse(readFileSync(reviewPath, 'utf-8'));
      note(`📋 review.json: findings=${doc.findings?.length ?? 0} revision=${doc.revision ?? '?'}`);
    } else {
      note('⚠️ review.json не создан');
    }

    // ═══ Итого ═══
    note('\n═══════════════════════════════');
    note('СКРИНШОТЫ: ' + SHOTS_DIR);
    note('Пройдено стадий: ' + seenNodes.size);
    for (const n of seenNodes) note('  • ' + n);
    note('Всего шагов: ' + stepNum);
    note('═══════════════════════════════');
  });
});
