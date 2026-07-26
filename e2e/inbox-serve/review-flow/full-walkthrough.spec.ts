// @file: full-walkthrough.spec.ts — сквозной прогон с seedReview + tick для загрузки ревью

import { test, expect, type Page } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_URL, MR_REF } from './_support.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = resolve(__dirname, '..', 'test-results', 'screenshots');
mkdirSync(SHOTS_DIR, { recursive: true });

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS_DIR, `walk-${name}.png`), fullPage: true });
}

test.describe('Полный путь с засеянным ревью', () => {
  test.beforeAll(async () => {
    test.setTimeout(600_000);
    ({ stateDir } = await makeStateDir({ seedReview: true }));
    app = await bootReal(stateDir);
    
    // Активируем reviewer
    try { await app!.scheduler.assignManual(MR_URL, 'reviewer'); } catch {}
    // Даём тик чтобы загрузить ревью с диска
    try { await app!.scheduler.tick(); } catch {}
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('Сквозной прогон: дашборд → MR → артефакты → кандидаты', async ({ page }) => {
    const inst = app!.scheduler.findInstance(MR_URL);
    console.log(`Instance state: ${inst?.state} node: ${inst?.currentNode}`);

    // ── Шаг 1: Дашборд ──
    await page.goto('http://localhost:4174');
    await expect(page.locator('header h1')).toContainText('agent-inbox', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    await shot(page, '01-dashboard');

    // ── Шаг 2: Активация роли reviewer ──
    const reviewer = page.locator('section[aria-label="Role: reviewer"]');
    await expect(reviewer).toBeVisible({ timeout: 10_000 });
    const activateBtn = reviewer.locator('button[aria-label^="Activate"]');
    if (await activateBtn.isVisible().catch(() => false)) {
      await activateBtn.click();
      await page.waitForTimeout(3000);
    }
    await shot(page, '02-reviewer-active');

    // ── Шаг 3: Назначение MR (если ещё не в INBOX) ──
    const unassigned = page.locator('section[aria-label="Unassigned MRs"]');
    const assignBtn = unassigned.locator('button[aria-label^="Assign"]').first();
    if (await assignBtn.isVisible().catch(() => false)) {
      await assignBtn.click();
      await page.waitForTimeout(500);
      const dropdown = page.locator('.bg-popover');
      if (await dropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dropdown.locator('button:has-text("reviewer")').click();
        await page.waitForTimeout(3000);
      }
    }
    await shot(page, '03-board');

    // ── Шаг 4: Открываем MR детально ──
    const inboxLane = reviewer.locator('[aria-label="INBOX lane"]');
    const mrCard = inboxLane.locator('div[role="listitem"]').first();
    const viewBtn = inboxLane.locator('button[aria-label^="View MR"]').first();
    
    if (await viewBtn.isVisible().catch(() => false)) {
      await viewBtn.evaluate((el: HTMLButtonElement) => el.click());
      await page.waitForTimeout(5000);
    } else {
      // Прямой deep-link
      await page.goto(`http://localhost:4174/#/mr/${encodeURIComponent(MR_REF)}`);
      await page.waitForTimeout(5000);
    }
    await shot(page, '04-mr-detail');

    // ── Шаг 5: Артефакты — все табы ──
    const nav = page.locator('nav[aria-label="Артефакты"]');
    if (await nav.isVisible({ timeout: 5000 }).catch(() => false)) {
      const tabs = nav.locator('button');
      const count = await tabs.count();
      console.log(`Найдено табов артефактов: ${count}`);
      for (let i = 0; i < count; i++) {
        const btn = tabs.nth(i);
        const text = (await btn.textContent().catch(() => '')) || `tab-${i}`;
        await btn.click();
        await page.waitForTimeout(800);
      }
      await shot(page, '05-artifacts');
    } else {
      console.log('Артефакты не найдены — проверяю URL и контент');
      const url = page.url();
      const body = await page.locator('main').textContent().catch(() => '');
      console.log(`URL: ${url}`);
      console.log(`Body (первые 300): ${body?.slice(0, 300)}`);
    }

    // ── Шаг 6: ActionPanel — кандидаты, approve, skip ──
    const candidatesText = page.locator('text=Кандидаты');
    const approveBtn = page.locator('button:has-text("Approve")');
    const skipBtn = page.locator('button:has-text("Skip")');
    const postBtn = page.locator('button:has-text("Постить")');
    const backBtn = page.locator('button[aria-label="Назад к доске"]');
    
    const hasCandidates = await candidatesText.isVisible().catch(() => false);
    const hasApprove = await approveBtn.isVisible().catch(() => false);
    const hasSkip = await skipBtn.isVisible().catch(() => false);
    const hasPost = await postBtn.isVisible().catch(() => false);
    
    console.log(`ActionPanel: кандидаты=${hasCandidates} approve=${hasApprove} skip=${hasSkip} post=${hasPost}`);
    await shot(page, '06-action-panel');

    // ── Шаг 7: Финал — борд ──
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(1000);
    }
    await page.goto('http://localhost:4174');
    await page.waitForTimeout(2000);
    await shot(page, '07-board-final');

    // ── Статистика борда ──
    for (const aria of ['MRs awaiting my action', 'Role: reviewer', 'Role: author', 'Unassigned MRs']) {
      const el = page.locator(`section[aria-label="${aria}"]`);
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        const h2 = await el.locator('h2').textContent().catch(() => '');
        // Считаем карточки
        const cards = el.locator('div[role="listitem"]');
        const cardCount = await cards.count().catch(() => 0);
        console.log(`✅ ${aria}: ${h2?.trim()} | карточек: ${cardCount}`);
      }
    }

    console.log('\n=== СКРИНШОТЫ: ' + SHOTS_DIR + ' ===');
    console.log('Ветка: recover-sdd-v2, коммитов: 10');
  });
});
