// @file: t7 — mutation: over a state dir seeded with the real review, POST /api/mr/:id/mutate with a
//   set-severity proposal and assert review.json's revision bumps by 1 on disk and the target
//   finding's severity actually changed (real MutationApplier CAS, no live instance required).
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, MR_REF, BASE_URL } from './_support.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;
let reviewPath: string;

test.describe('t7 mutation', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir, reviewPath } = await makeStateDir({ seedReview: true }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('POST /mutate set-severity → review.json revision+1 + severity changed on disk', async ({
    request,
  }) => {
    const before = JSON.parse(readFileSync(reviewPath, 'utf-8'));
    const target = before.findings[0] as { id: string; severity: string };
    const after = target.severity === 'info' ? 'warn' : 'info';

    const res = await request.post(`${BASE_URL}/api/mr/${encodeURIComponent(MR_REF)}/mutate`, {
      data: {
        proposal: { op: 'set-severity', target: target.id, before: target.severity, after },
        revision: before.revision,
      },
    });
    expect(res.status(), `mutate body: ${await res.text()}`).toBe(200);

    const afterDoc = JSON.parse(readFileSync(reviewPath, 'utf-8'));
    expect(afterDoc.revision).toBe(before.revision + 1);
    const changed = afterDoc.findings.find((f: { id: string }) => f.id === target.id);
    expect(changed.severity).toBe(after);
  });
});
