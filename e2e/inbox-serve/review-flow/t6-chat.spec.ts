// @file: t6 — Review Chat (headless chromium): over a state dir seeded with the real review, ask a
//   real question in the chat composer and assert a real streamed answer arrives over SSE (real
//   opencode on :4096), with no browser console errors.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect, type ConsoleMessage } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_REF, BASE_URL } from './_support.ts';
import { shot } from '../helpers/shot.ts';
import { ChatTranscript } from '../../../services/agent-inbox/modules/inbox-chat/chat-transcript.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

test.describe('t6 review chat', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: true }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('real question → real streamed SSE answer, no console errors', async ({ page }) => {
    test.setTimeout(180_000);

    const consoleErrors: ConsoleMessage[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m);
    });

    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });

    const composer = page.getByPlaceholder('Спросить о ревью...');
    await expect(composer).toBeVisible({ timeout: 10_000 });

    await composer.click();
    await composer.fill('Кратко перечисли находки этого ревью.');
    await composer.press('Enter');

    // A REAL assistant answer surfaces either as live streaming tokens (data-testid=chat-streaming)
    // or as a completed turn's answer paragraph (data-testid=chat-answer) — NOT the echoed question.
    // On the chat pipeline's NO_JSON failure the turn errors and neither ever gets non-empty text, so
    // this correctly times out instead of passing on the typed question growing the page.
    await expect
      .poll(
        async () => {
          const stream = (await page.locator('[data-testid="chat-streaming"]').allInnerTexts())
            .join('')
            .trim();
          const answers = (await page.locator('[data-testid="chat-answer"]').allInnerTexts())
            .join('')
            .trim();
          return (stream + answers).length;
        },
        {
          timeout: 120_000,
          message: 'expected a real streamed/completed assistant answer (not the echoed question)',
        }
      )
      .toBeGreaterThan(0);

    await shot(page, 't6-chat');

    expect(
      consoleErrors.map((m) => m.text()),
      `browser console errors during chat: ${consoleErrors.map((m) => m.text()).join(' | ')}`
    ).toEqual([]);

    // D-125 triple-grounding: the UI action (typed question → Enter) must be provable on disk, not
    // just on screen — read the SAME transcript file ChatSession#ask() persists (chats/<ref>.jsonl)
    // and confirm the exact question this test typed produced a real, non-empty answer there.
    const uiAnswerText = (
      await page
        .locator('[data-testid="chat-streaming"], [data-testid="chat-answer"]')
        .allInnerTexts()
    )
      .join('')
      .trim();

    const transcriptPath = new ChatTranscript(stateDir!).path(MR_REF);
    const lines = readFileSync(transcriptPath, 'utf-8').trim().split('\n');
    const lastTurn = JSON.parse(lines[lines.length - 1]!) as { question: string; answer: string };

    expect(
      lastTurn.question,
      'persisted transcript question must match what was typed in the UI'
    ).toBe('Кратко перечисли находки этого ревью.');
    expect(lastTurn.answer.length, 'persisted transcript answer must be non-empty').toBeGreaterThan(
      0
    );
    expect(
      uiAnswerText.slice(0, 20),
      'the on-disk answer must be the same text the UI actually rendered, not a different turn'
    ).toBe(lastTurn.answer.slice(0, 20));
  });
});
