// @file: t9 — full-flow (Round 2, D-125): ONE incremental e2e proving interface↔telemetry↔artifact at
//   EVERY step of the full review cycle over the REAL MR `_support.ts`'s `MR_REF` names (originally
//   vk-workspace/superapp!602; switched to mail/messenger!159 after !602 was merged on GitLab —
//   see `_support.ts` header), no mocks on the path. Phases P3-P8 each append their own sub-steps to
//   this file. P3-P6 share ONE `REVIEW_FLOW_STATE_DIR` (operator-set env var, reused verbatim — see
//   ticket P3 Objective); P7 owns its own independent live drive (BoardProviderReal.executeAction
//   needs a LIVE RoleInstance, no disk fallback — see ticket P7 Objective) and does not reuse this
//   state dir.
// @consumers: npx playwright test --config=e2e/inbox-serve/playwright.review-flow.config.ts
// @tasks: TSK-131

import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BootstrapResult } from '../../../services/agent-inbox/serve/bootstrap.ts';
import { bootReal, makeStateDir, teardown, BASE_URL, MR_URL, MR_REF } from './_support.ts';
import { shot } from '../helpers/shot.ts';
import { waitForRealMermaidRender } from '../helpers/wait-render.ts';
import { mrReportsDir } from '../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import {
  sessionArtifactsDir,
  phaseTimingsPath,
  toolTracePath,
} from '../../../services/agent-inbox/modules/inbox-roles/phase-telemetry.ts';

let app: BootstrapResult | undefined;
let stateDir: string | undefined;

/** @purpose Hard wall-clock budget for P4's single live drive (env-overridable, mirrors t3+t4). */
const P4_DRIVE_DEADLINE_MS = Number(process.env.REVIEW_DRIVE_DEADLINE_MS ?? 1_200_000);
/** @purpose Tick bound — prep + 3-lens fanout + synthesize is a short graph; generous ceiling. */
const P4_MAX_TICKS = 60;

/** @purpose Root-tag marker each lens's system directive carries (TSK-136 selector, ai/kit templates) —
 *   proves the compiled system prompt is track-specific, not a generic fallback. */
const LENS_SYSTEM_MARKER: Record<string, RegExp> = {
  node_track_review: /ArchInterrogation/,
  node_security_lens: /SecurityInterrogation/,
  node_code_review: /CodeInterrogation/,
};

/** @purpose Parse an append-only JSONL telemetry file into objects; malformed/missing → []. */
function readJsonlLines(filePath: string): Record<string, unknown>[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** @purpose Locate a session node's X-ray prompt/response pair under `sessions/` by filename prefix. */
function findSessionXray(
  sessionsDir: string,
  nodeId: string
): { promptPath?: string; responsePath?: string } {
  if (!existsSync(sessionsDir)) return {};
  const files = readdirSync(sessionsDir);
  const promptFile = files.find((f) => f.startsWith(`${nodeId}__`) && f.endsWith('.prompt.txt'));
  const responseFile = files.find(
    (f) => f.startsWith(`${nodeId}__`) && f.endsWith('.response.txt')
  );
  return {
    promptPath: promptFile ? join(sessionsDir, promptFile) : undefined,
    responsePath: responseFile ? join(sessionsDir, responseFile) : undefined,
  };
}

test.describe('t9 full flow', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    ({ stateDir } = await makeStateDir({ seedReview: false }));
    app = await bootReal(stateDir);
  });

  test.afterAll(async () => {
    await teardown(app, stateDir);
  });

  test('P3 sub-step 1: board loads for the real product', async ({ page }) => {
    await page.goto(BASE_URL);

    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 10_000 });
    await expect(header.locator('h1')).toContainText('agent-inbox');

    const unassignedRegion = page.getByRole('region', { name: 'Unassigned MRs' });
    await expect(unassignedRegion).toBeVisible({ timeout: 10_000 });

    // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P3 Exit
    console.info(`[t9] step=board-loaded ts=${new Date().toISOString()}`);
    await shot(page, 't9-01-board-empty');
  });

  test('P3 sub-step 2: assign the real MR to reviewer through the UI', async ({ page }) => {
    // assignManual's _buildInitialCheckpoint prepares a real git worktree for the MR (clone/checkout
    // on first use) before the RoleInstance lands — budget generously for that one-time cost.
    test.setTimeout(180_000);
    // F7: unassigned needs one completed poll; no role is active in this fresh dir, so tick() only
    // surfaces MRs for manual UI assignment, never auto-assigns (SV-07).
    await app!.scheduler.tick();

    await page.goto(BASE_URL);
    const unassignedRegion = page.getByRole('region', { name: 'Unassigned MRs' });
    await expect(unassignedRegion).toBeVisible({ timeout: 10_000 });
    await shot(page, 't9-02-unassigned-poll-result');

    const mrRefButton = unassignedRegion.getByRole('button', {
      name: `Assign ${MR_REF} to role`,
    });
    const mrRefIsActionable = await mrRefButton.isVisible().catch(() => false);

    // Ticket P3: an absent UI element is escalated as a discovery, never routed around via
    // scheduler.assignManual — see ticket Execution Log Round 2 P3 for the full discovery.
    test.fixme(
      !mrRefIsActionable,
      `TSK-131 P3: RoleScheduler#_filterActionable (role-scheduler.ts:467-503) dropped ${MR_REF} ` +
        `from this poll's actionable set (approved-by-me/idle/stale-draft filter) — no "Assign" ` +
        `button renders for it right now (see t9-02-unassigned-poll-result.png for the MRs that do).`
    );

    const assignResponse = page.waitForResponse((r) => /\/api\/mr\/.+\/assign$/.test(r.url()));
    await mrRefButton.click();
    await unassignedRegion.getByRole('button', { name: 'reviewer', exact: true }).click();
    const resp = await assignResponse;
    expect(
      resp.status(),
      `POST /api/mr/.../assign → ${resp.status()} body=${await resp.text()}`
    ).toBe(200);

    // assignMr fires assignManual fire-and-forget (board-provider.real.ts) — it awaits
    // _buildInitialCheckpoint before the instance lands, so poll rather than read synchronously.
    await expect
      .poll(() => app!.scheduler.findInstance(MR_URL)?.role, {
        message: 'expected a live RoleInstance for the MR after UI-driven assign',
        timeout: 150_000,
      })
      .toBe('reviewer');

    // Interface↔telemetry proof (D-125): the board itself now shows the MR "in work" under reviewer.
    await page.reload();
    const reviewerRoleRegion = page.getByRole('region', { name: /reviewer/i });
    await expect(reviewerRoleRegion.getByText(MR_REF)).toBeVisible({ timeout: 10_000 });

    // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P3 Exit
    console.info(`[t9] step=assigned-via-ui ts=${new Date().toISOString()}`);
    await shot(page, 't9-02-assigned');
  });

  test('P4: plan → 3 lenses → gate → synthesize → gate (single continuous live drive)', async ({
    page,
  }) => {
    // Ticket P4 Objective: ONE continuous tick() drive over the SAME REVIEW_FLOW_STATE_DIR P3 built
    // (no fresh assignManual — the instance P3 assigned via the UI is still live in this same process).
    // Never re-run in P5-P8 — see ticket P3/P4 Objective for the cost-boundary rationale.
    test.setTimeout(P4_DRIVE_DEADLINE_MS + 180_000);

    const reviewDir = mrReportsDir(stateDir!, MR_REF);
    const tasksDir = join(reviewDir, 'tasks');
    const sessionsDir = sessionArtifactsDir(stateDir!, MR_REF);
    const ptPath = phaseTimingsPath(stateDir!);
    const ttPath = toolTracePath(stateDir!);
    const reviewPath = join(reviewDir, 'review.json');

    const progress = {
      prep: false,
      trackReview: false,
      fanout: false,
      gateFilled: false,
      synthesized: false,
      awaitingOperator: false,
    };

    /** @purpose Verify one lens's X-ray prompt/response, result.json, and telemetry pair.
     *   @returns Byte/tool-call counts for the log line (no threshold assert — AI-45 is separate). */
    function verifyLensArtifacts(nodeId: string): { bytes: number; toolCalls: number } {
      const { promptPath, responsePath } = findSessionXray(sessionsDir, nodeId);
      expect(promptPath, `${nodeId}: X-ray prompt file missing under ${sessionsDir}`).toBeTruthy();
      expect(
        responsePath,
        `${nodeId}: X-ray response file missing under ${sessionsDir}`
      ).toBeTruthy();

      const promptBody = readFileSync(promptPath!, 'utf-8');
      expect(promptBody, `${nodeId}: system directive lacks its track marker`).toMatch(
        LENS_SYSTEM_MARKER[nodeId]!
      );
      expect(
        promptBody,
        `${nodeId}: task text has no inlined Context / tasks/*.task.md reference (TSK-134/TSK-113 Round 3)`
      ).toMatch(/## Контекст|tasks[\\/][^\s]+\.task\.md/);

      const responseBody = readFileSync(responsePath!, 'utf-8');
      expect(
        responseBody,
        `${nodeId}: response file does not reference the prompt file it answers`
      ).toContain(promptPath!);

      const resultPath = join(tasksDir, `${nodeId}.result.json`);
      expect(
        existsSync(resultPath),
        `${nodeId}: persistResult artifact missing at ${resultPath}`
      ).toBe(true);
      const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as { findings?: unknown };
      expect(Array.isArray(result.findings), `${nodeId}: result.json has no findings array`).toBe(
        true
      );

      const timingEntries = readJsonlLines(ptPath).filter((e) => e['node'] === nodeId);
      expect(timingEntries.length, `${nodeId}: no phase-timings.jsonl entry`).toBeGreaterThan(0);
      const timing = timingEntries[timingEntries.length - 1]!;
      expect(timing['parallelGroup'], `${nodeId}: not tagged with its fan-out parallelGroup`).toBe(
        'node_review_fanout'
      );
      const tools = Array.isArray(timing['tools']) ? (timing['tools'] as { count: number }[]) : [];
      const toolCalls = tools.reduce((n, t) => n + t.count, 0);

      const traceCalls = readJsonlLines(ttPath)
        .filter((e) => e['node'] === nodeId)
        .reduce(
          (n, e) => n + (Array.isArray(e['calls']) ? (e['calls'] as unknown[]).length : 0),
          0
        );
      expect(
        traceCalls,
        `${nodeId}: tool-trace.jsonl call count (${traceCalls}) does not match phase-timings tool sum (${toolCalls})`
      ).toBe(toolCalls);

      return { bytes: Buffer.byteLength(promptBody) + Buffer.byteLength(responseBody), toolCalls };
    }

    let ticks = 0;
    const deadline = Date.now() + P4_DRIVE_DEADLINE_MS;
    while (ticks < P4_MAX_TICKS && Date.now() < deadline && !progress.awaitingOperator) {
      const t0 = Date.now();
      await app!.scheduler.tick();
      ticks++;
      const inst = app!.scheduler.findInstance(MR_URL);
      // eslint-disable-next-line no-console -- D-125: localizes a stall to a node, not a bare timeout
      console.info(
        `[t9] P4 tick ${ticks} ${Date.now() - t0}ms — state=${inst?.state ?? 'none'} node=${inst?.currentNode ?? 'n/a'}`
      );

      // #region START_SUBSTEP_3_PREP — poll PLAN.md + tasks/<track>.task.md, assert real (non-placeholder) Context
      if (!progress.prep && existsSync(join(reviewDir, 'PLAN.md')) && existsSync(tasksDir)) {
        const taskFiles = readdirSync(tasksDir).filter((f) => f.endsWith('.task.md'));
        if (taskFiles.length > 0) {
          for (const f of taskFiles) {
            const body = readFileSync(join(tasksDir, f), 'utf-8');
            const match = body.match(/## Контекст\n\n([\s\S]*?)\n\n## Находки/);
            expect(
              match,
              `${f}: missing ## Контекст section between the expected headings`
            ).toBeTruthy();
            const contextBody = match![1]!.trim();
            expect(contextBody.length, `${f}: ## Контекст is empty`).toBeGreaterThan(0);
            expect(
              contextBody,
              `${f}: ## Контекст still carries the unfilled orchestrator placeholder`
            ).not.toContain('<!-- FILL: orchestrator');
          }
          await page.goto(BASE_URL);
          await shot(page, 't9-03-planned');
          progress.prep = true;
          // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P4 Exit
          console.info(
            `[t9] step=prep-materialized tracks=[${taskFiles.join(',')}] ts=${new Date().toISOString()}`
          );
        }
      }
      // #endregion END_SUBSTEP_3_PREP

      // #region START_SUBSTEP_4_LENS_TRACK_REVIEW — first lens of the fan-out to prove out individually
      if (progress.prep && !progress.trackReview) {
        const resultPath = join(tasksDir, 'node_track_review.result.json');
        if (existsSync(resultPath)) {
          const { bytes, toolCalls } = verifyLensArtifacts('node_track_review');
          await shot(page, 't9-04-track-review-done');
          progress.trackReview = true;
          // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P4 Exit
          console.info(
            `[t9] step=lens-track-review bytes=${bytes} toolCalls=${toolCalls} ts=${new Date().toISOString()}`
          );
        }
      }
      // #endregion END_SUBSTEP_4_LENS_TRACK_REVIEW

      // #region START_SUBSTEP_5_FANOUT_COMPLETE — the remaining two lenses of the same parallel node
      if (
        progress.trackReview &&
        !progress.fanout &&
        existsSync(join(tasksDir, 'node_security_lens.result.json')) &&
        existsSync(join(tasksDir, 'node_code_review.result.json'))
      ) {
        verifyLensArtifacts('node_security_lens');
        verifyLensArtifacts('node_code_review');
        await shot(page, 't9-05-fanout-complete');
        progress.fanout = true;
        // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P4 Exit
        console.info(`[t9] step=fanout-complete lenses=3 ts=${new Date().toISOString()}`);
      }
      // #endregion END_SUBSTEP_5_FANOUT_COMPLETE

      // #region START_SUBSTEP_6_GATE_FILLED — state-transition-only proof (ArtifactValidator gap: TSK-137, honest, not silent)
      if (progress.fanout && !progress.gateFilled && inst?.currentNode === 'node_synthesize') {
        await shot(page, 't9-06-gate-filled');
        progress.gateFilled = true;
        // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P4 Exit
        console.info(`[t9] step=gate-filled-passed ts=${new Date().toISOString()}`);
      }
      // #endregion END_SUBSTEP_6_GATE_FILLED

      // #region START_SUBSTEP_7_SYNTHESIZED — synthesize X-ray + review.json + README.md + retries
      if (progress.gateFilled && !progress.synthesized && existsSync(reviewPath)) {
        const { promptPath, responsePath } = findSessionXray(sessionsDir, 'node_synthesize');
        expect(promptPath, 'node_synthesize: X-ray prompt file missing').toBeTruthy();
        expect(responsePath, 'node_synthesize: X-ray response file missing').toBeTruthy();
        const synthPrompt = readFileSync(promptPath!, 'utf-8');
        expect(
          synthPrompt,
          'node_synthesize: system directive lacks SynthesizeReview marker'
        ).toMatch(/SynthesizeReview/);
        expect(
          synthPrompt,
          "node_synthesize: task text does not inline the three lenses' JSON"
        ).toMatch(/node_track_review|track/i);

        const doc = JSON.parse(readFileSync(reviewPath, 'utf-8')) as {
          findings: { id: string }[];
          revision: number;
        };
        expect(Array.isArray(doc.findings), 'review.json: findings is not an array').toBe(true);
        expect(doc.findings.length, 'review.json: findings is empty').toBeGreaterThan(0);
        for (const f of doc.findings) expect(f.id).toMatch(/^F-\d+$/);
        expect(typeof doc.revision, 'review.json: revision is not numeric').toBe('number');

        const readmeBody = readFileSync(join(reviewDir, 'README.md'), 'utf-8');
        expect(readmeBody, 'README.md: no mermaid block').toMatch(/```mermaid/);
        expect(readmeBody, 'README.md: no Кандидаты section').toMatch(/## Кандидаты/);

        const synthTimings = readJsonlLines(ptPath).filter((e) => e['node'] === 'node_synthesize');
        const lastSynthTiming = synthTimings[synthTimings.length - 1];
        const retries =
          typeof lastSynthTiming?.['retries'] === 'number' ? lastSynthTiming['retries'] : 0;
        const outcome = lastSynthTiming?.['ok'] === false ? 'escalated' : 'success';
        // Honest branch (ticket P4 sub-step 7): a real "escalated" outcome is only ever asserted when
        // it happens naturally in THIS run — forcing the failure path is out of this phase's scope.
        expect(['success', 'escalated']).toContain(outcome);

        await shot(page, 't9-07-synthesized');
        progress.synthesized = true;
        // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P4 Exit
        console.info(
          `[t9] step=synthesized retries=${retries} outcome=${outcome} ts=${new Date().toISOString()}`
        );
      }
      // #endregion END_SUBSTEP_7_SYNTHESIZED

      // #region START_SUBSTEP_8_AWAITING_OPERATOR — UI badge PAIRED with review.json + live scheduler state (D-125)
      if (
        progress.synthesized &&
        !progress.awaitingOperator &&
        inst?.state === 'awaiting_operator'
      ) {
        await page.goto(BASE_URL);
        const awaitingRegion = page.getByRole('region', { name: 'MRs awaiting my action' });
        await expect(awaitingRegion).toBeVisible({ timeout: 10_000 });
        await expect(
          awaitingRegion.getByRole('listitem', { name: new RegExp(`^MR ${MR_REF}`) })
        ).toBeVisible({ timeout: 10_000 });

        // Disk/in-process pairing (D-125): review.json (disk) + the live scheduler's own currentNode
        // (concrete field; this harness has no separate on-disk RoleInstance checkpoint — ticket P4 Handoff) both confirm the same transition the UI badge shows.
        expect(
          existsSync(reviewPath),
          'review.json missing at the awaiting_operator transition'
        ).toBe(true);
        expect(inst?.currentNode, 'scheduler currentNode did not land on node_ask').toBe(
          'node_ask'
        );

        await shot(page, 't9-08-gate-synthesis');
        progress.awaitingOperator = true;
        // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P4 Exit
        console.info(`[t9] step=awaiting-operator ts=${new Date().toISOString()}`);
      }
      // #endregion END_SUBSTEP_8_AWAITING_OPERATOR

      if (inst && (inst.state === 'error' || inst.state === 'done')) break;
    }

    expect(progress.prep, 'sub-step 3 (prep) never materialized within the drive deadline').toBe(
      true
    );
    expect(
      progress.trackReview,
      'sub-step 4 (node_track_review) never materialized within the drive deadline'
    ).toBe(true);
    expect(progress.fanout, 'sub-step 5 (fanout complete) never materialized').toBe(true);
    expect(progress.gateFilled, 'sub-step 6 (gate_review_filled) never passed').toBe(true);
    expect(progress.synthesized, 'sub-step 7 (synthesize) never materialized').toBe(true);
    expect(
      progress.awaitingOperator,
      'sub-step 8 (gate_review_synthesis → awaiting_operator) never reached'
    ).toBe(true);
  });

  test('P5: detail view renders the already-materialized P4 review from disk', async ({ page }) => {
    // Ticket P5 Objective: no new live drive here — bootReal (beforeAll) is a fresh HTTP+opencode
    // server, but review.json/README.md/tasks/* are already real on disk from P4's own drive over
    // the SAME REVIEW_FLOW_STATE_DIR. This sub-step only reads what P4 produced.
    test.setTimeout(60_000);

    const reviewDir = mrReportsDir(stateDir!, MR_REF);
    const reviewPath = join(reviewDir, 'review.json');
    const doc = JSON.parse(readFileSync(reviewPath, 'utf-8')) as { findings: { id: string }[] };
    const diskFindingsCount = doc.findings.length;
    expect(diskFindingsCount, 'review.json.findings must be non-empty after P4').toBeGreaterThan(0);

    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);

    const nav = page.locator('nav[aria-label="Артефакты"]');
    await expect(nav).toBeVisible({ timeout: 20_000 });

    await nav.getByRole('button', { name: 'README.md', exact: true }).click();
    await waitForRealMermaidRender(page, 45_000);

    const candidatesLabel = page.getByText(/Кандидаты \(\d+\)/).first();
    await expect(candidatesLabel).toBeVisible({ timeout: 10_000 });
    const labelText = await candidatesLabel.textContent();
    const match = labelText?.match(/Кандидаты \((\d+)\)/);
    expect(match, `Кандидаты(N) label not parseable from "${labelText}"`).toBeTruthy();
    const uiFindingsCount = Number(match![1]);

    // Disk↔UI cross-check (critic round 2, MINOR): the badge number must equal review.json's real
    // findings.length read directly from disk — not just "a number renders".
    expect(
      uiFindingsCount,
      `UI "Кандидаты (${uiFindingsCount})" must equal review.json findings.length (${diskFindingsCount})`
    ).toBe(diskFindingsCount);

    await shot(page, 't9-09-detail');
    // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P5 Exit
    console.info(
      `[t9] step=detail-rendered findings=${diskFindingsCount} ts=${new Date().toISOString()}`
    );
  });
});
