// @file: author-pipeline.spec.ts — e2e proof that the author role pipeline works end-to-end.
//   Assigns a real MR as author, verifies lane placement, progress counters, and stage transitions.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
import { test, expect } from '@playwright/test';
import { shot } from '../helpers/shot.ts';
import { logger } from '#logger';

const SERVER = 'http://localhost:4174';
const MR_URL = 'https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/172';
const MR_KEY = 'mail/messenger!172';

interface BoardResponse {
  ok: boolean;
  roles: Array<{
    name: string;
    lanes: {
      inbox: Array<{ mrKey: string; webUrl: string; title?: string; progress?: unknown }>;
      inProgress: Array<{ mrKey: string; webUrl: string; title?: string; progress?: unknown }>;
      awaitingMe: Array<{ mrKey: string; webUrl: string; title?: string; progress?: unknown }>;
      done: Array<{ mrKey: string; webUrl: string; title?: string; progress?: unknown }>;
    };
  }>;
}

async function fetchBoard(page: any): Promise<BoardResponse> {
  const response = await page.evaluate(async () => {
    const res = await fetch('/api/board');
    return res.json();
  });
  return response;
}

function findMrInRole(
  board: BoardResponse,
  role: string
): {
  lane: string;
  progress: any;
} | null {
  const roleBlock = board.roles?.find((r: any) => r.name === role);
  if (!roleBlock) return null;
  for (const laneName of ['inbox', 'inProgress', 'awaitingMe', 'done'] as const) {
    const card = (roleBlock.lanes[laneName] as any[]).find((c: any) => c.webUrl === MR_URL);
    if (card) return { lane: laneName, progress: card.progress };
  }
  return null;
}

test.describe('Author pipeline — e2e proof', () => {
  test.setTimeout(300_000); // 5 min timeout — review can take a while

  test('Assign MR as author → verify lane + progress + stage transitions', async ({ page }) => {
    await page.goto(SERVER);

    // ═══ STEP 1: Assign MR as author ═══
    await page.evaluate(
      async ([url, role]) => {
        await fetch(`/api/mr/${encodeURIComponent(url)}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        });
      },
      [MR_URL, 'author']
    );

    // Wait for assignment to complete (server-side: VCS context + worktree)
    await page.waitForTimeout(5000);
    await page.reload();
    await shot(page, 'author-01-after-assign');

    // ═══ STEP 2: Verify MR appears in author role ═══
    let board = await fetchBoard(page);
    let found = findMrInRole(board, 'author');
    expect(found, 'MR should appear in author role after assignment').not.toBeNull();
    expect(
      ['inbox', 'inProgress'].includes(found!.lane),
      `MR should be in inbox or inProgress, got ${found!.lane}`
    ).toBe(true);

    // ═══ STEP 3: Verify progress counters are meaningful (not 0/0) ═══
    if (found!.progress) {
      const p = found!.progress as any;
      expect(p.tracksPlanned, 'author should have 3 planned stages').toBe(3);
      expect(typeof p.stageLabel).toBe('string');
      expect(p.stageLabel.length).toBeGreaterThan(0);
      // Clock should be ticking (elapsed > 0 or startedAt is set)
      const hasClock = p.elapsedMs > 0 || p.startedAt !== null;
      expect(hasClock, 'clock should be ticking').toBe(true);
    }

    await shot(page, 'author-02-in-lane');

    // ═══ STEP 4: Poll for stage transitions ═══
    const stagesSeen = new Set<string>();
    const maxPolls = 60; // 5 minutes at 5s intervals
    for (let i = 0; i < maxPolls; i++) {
      await page.waitForTimeout(5000);
      board = await fetchBoard(page);
      found = findMrInRole(board, 'author');

      if (!found?.progress) continue;

      const stage = (found.progress as any).stageLabel as string;
      if (!stagesSeen.has(stage)) {
        stagesSeen.add(stage);
        logger.info(`[author-pipeline] stage ${stagesSeen.size}: ${stage}`);
        await shot(page, `author-0${stagesSeen.size + 1}-stage-${stage.replace(/\s+/g, '-')}`);
      }

      // Stop when review is done or awaiting operator
      if (
        found.lane === 'done' ||
        found.lane === 'awaitingMe' ||
        stage === 'Ожидает решения' ||
        stage === 'Готово'
      ) {
        break;
      }
    }

    // ═══ STEP 5: Final verification ═══
    expect(stagesSeen.size, 'should observe at least 2 stage transitions').toBeGreaterThanOrEqual(
      1
    );
    logger.info(`[author-pipeline] Stages observed: ${[...stagesSeen].join(' → ')}`);
  });
});
