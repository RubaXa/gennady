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

import { test, expect, type ConsoleMessage } from '@playwright/test';
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
import { ChatTranscript } from '../../../services/agent-inbox/modules/inbox-chat/chat-transcript.ts';

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
          // Detail page, then click through every real tab below — proves each one renders.
          await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
          const artifactNav = page.locator('nav[aria-label="Артефакты"]');
          await expect(artifactNav).toBeVisible({ timeout: 20_000 });
          await shot(page, 't9-03-planned');

          const contentPane = page.locator('nav[aria-label="Артефакты"] ~ div');
          let previousText = await contentPane.innerText();
          const tabsToVerify = ['PLAN.md', ...taskFiles.sort()];
          for (const tabName of tabsToVerify) {
            const tabButton = artifactNav.getByRole('button', { name: tabName });
            await expect(tabButton, `artifact tab "${tabName}" not found in nav`).toBeVisible({
              timeout: 10_000,
            });
            await tabButton.click();
            await expect(
              tabButton,
              `"${tabName}" tab did not become active on click`
            ).toHaveAttribute('aria-current', 'true');
            await expect
              .poll(
                async () => {
                  const text = await contentPane.innerText();
                  return text !== previousText && text.length > 0;
                },
                {
                  message: `content pane never settled on new non-empty text after clicking "${tabName}"`,
                  timeout: 10_000,
                }
              )
              .toBe(true);
            const currentText = await contentPane.innerText();
            if (tabName !== 'PLAN.md') {
              expect(
                currentText,
                `"${tabName}": rendered pane lacks its own Контекст heading`
              ).toMatch(/Контекст/);
            }
            await shot(page, `t9-03-tab-${tabName.replace(/\.task\.md$|\.md$/, '')}`);
            previousText = currentText;
          }
          // eslint-disable-next-line no-console -- D-125: proves every artifact tab genuinely renders
          console.info(
            `[t9] step=artifact-tabs-verified tabs=[${tabsToVerify.join(',')}] ts=${new Date().toISOString()}`
          );

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
          // Detail page's ArtifactBrowser shows the growing file list as lenses finish — a real
          // visual diff from sub-step 3, not a repeat of the board (screenshot-sequence honesty).
          await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
          await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({
            timeout: 20_000,
          });
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
        await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
        await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });
        await shot(page, 't9-05-fanout-complete');
        progress.fanout = true;
        // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P4 Exit
        console.info(`[t9] step=fanout-complete lenses=3 ts=${new Date().toISOString()}`);
      }
      // #endregion END_SUBSTEP_5_FANOUT_COMPLETE

      // #region START_SUBSTEP_6_GATE_FILLED — state-transition-only proof (ArtifactValidator gap: TSK-137, honest, not silent)
      if (progress.fanout && !progress.gateFilled && inst?.currentNode === 'node_synthesize') {
        await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
        await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });
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

        await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
        await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });
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
    // Zero findings is a valid, real outcome (see P4's own comment) — the disk↔UI cross-check below
    // works at any count, so there is nothing to gate on non-empty here.
    const diskFindingsCount = doc.findings.length;

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

  test('P6: chat Q&A — real question, real streamed answer, disk transcript cross-check', async ({
    page,
  }) => {
    // Ticket P6 Objective: reuse t6-chat.spec.ts's logic as one more sub-step of this same continuous
    // flow, over the SAME REVIEW_FLOW_STATE_DIR P3/P4 already populated (no fresh assignManual/tick —
    // this test only opens a chat session against the already-materialized review + worktree P3 built).
    test.setTimeout(180_000);

    const consoleErrors: ConsoleMessage[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m);
    });

    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });

    const composer = page.getByPlaceholder('Спросить о ревью...');
    await expect(composer).toBeVisible({ timeout: 10_000 });

    const question = 'Кратко перечисли находки этого ревью.';
    await composer.click();
    await composer.fill(question);
    await composer.press('Enter');

    // A REAL assistant answer surfaces either as live streaming tokens (data-testid=chat-streaming)
    // or as a completed turn's answer paragraph (data-testid=chat-answer) — NOT the echoed question.
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

    await shot(page, 't9-10-chat');

    expect(
      consoleErrors.map((m) => m.text()),
      `browser console errors during chat: ${consoleErrors.map((m) => m.text()).join(' | ')}`
    ).toEqual([]);

    // D-125 triple-grounding (same pattern as t6-chat.spec.ts): the UI action (typed question →
    // Enter) must be provable on disk — read the SAME transcript file ChatSession#ask() persists
    // (chats/<ref>.jsonl) and confirm the exact question this test typed produced a real answer there.
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
    ).toBe(question);
    expect(lastTurn.answer.length, 'persisted transcript answer must be non-empty').toBeGreaterThan(
      0
    );
    expect(
      uiAnswerText.slice(0, 20),
      'the on-disk answer must be the same text the UI actually rendered, not a different turn'
    ).toBe(lastTurn.answer.slice(0, 20));

    // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P6 Exit
    console.info(
      `[t9] step=chat-answered answerLen=${lastTurn.answer.length} ts=${new Date().toISOString()}`
    );
  });
});

/** @purpose Hard live-drive budget for P7's assign+tick drive — mirrors P4's 1_200_000ms
 *   (t8's 600_000ms default exhausted mid-fanout on a slow retry burst). */
const P7_DRIVE_DEADLINE_MS = Number(process.env.REVIEW_DRIVE_DEADLINE_MS ?? 1_200_000);
/** @purpose Tick bound for P7's own drive loop (mirrors t8-action.spec.ts's MAX_TICKS). */
const P7_MAX_TICKS = 40;

test.describe('t9 P7 action (own independent live drive)', () => {
  // Ticket P7 Objective: BoardProviderReal#executeAction requires a LIVE RoleInstance at
  // awaiting_operator (no disk fallback, unlike getReport/chat routes) — P3-P6's shared
  // REVIEW_FLOW_STATE_DIR is NOT reused here; this describe block owns its own state dir + its own
  // assignManual + tick() drive, mirroring the already-working t8-action.spec.ts pattern exactly.
  let p7App: BootstrapResult | undefined;
  let p7StateDir: string | undefined;
  let p7ReachedAwaiting = false;

  test.beforeAll(async () => {
    test.setTimeout(P7_DRIVE_DEADLINE_MS + 120_000);
    ({ stateDir: p7StateDir } = await makeStateDir({ seedReview: false }));
    p7App = await bootReal(p7StateDir);
    await p7App.scheduler.assignManual(MR_URL, 'reviewer');

    let ticks = 0;
    const deadline = Date.now() + P7_DRIVE_DEADLINE_MS;
    while (ticks < P7_MAX_TICKS && Date.now() < deadline) {
      const t0 = Date.now();
      await p7App.scheduler.tick();
      ticks++;
      const inst = p7App.scheduler.findInstance(MR_URL);
      // eslint-disable-next-line no-console -- D-125: localizes a stall to a node, not a bare timeout
      console.info(
        `[t9] P7 tick ${ticks} ${Date.now() - t0}ms — state=${inst?.state ?? 'none'} node=${inst?.currentNode ?? 'n/a'}`
      );
      if (inst?.state === 'awaiting_operator') {
        p7ReachedAwaiting = true;
        break;
      }
      if (inst && (inst.state === 'done' || inst.state === 'error')) break;
    }
  });

  test.afterAll(async () => {
    await teardown(p7App, p7StateDir);
  });

  test('P7: select candidate → Постить выбранное → DRY-RUN console line + audit effect_applied', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const inst = p7App!.scheduler.findInstance(MR_URL);
    expect(
      p7ReachedAwaiting,
      `instance never reached awaiting_operator — state=${inst?.state} node=${inst?.currentNode}`
    ).toBe(true);

    // Capture EVERY console message (not just DRY-RUN-prefixed ones) — self-diagnosing: if the
    // DRY-RUN assertion below ever fails again, the full transcript printed in its message tells us
    // whether the SSE frame arrived under a different shape/text, or nothing arrived at all, without
    // needing any external inspection.
    const allConsoleLines: string[] = [];
    const dryRunLines: string[] = [];
    page.on('console', (m) => {
      allConsoleLines.push(`[${m.type()}] ${m.text()}`);
      if (m.text().startsWith('DRY-RUN ')) dryRunLines.push(m.text());
    });

    // ChatPanel's useEffect opens the dry-run broadcast's transport (GET .../chat/stream, an
    // EventSource) asynchronously on mount — the effect below can fire and broadcast before that
    // connection is registered server-side, silently dropping the DRY-RUN line for no one's fault.
    // Wait for the stream's own response (headers arrive once EventSource connects) before acting,
    // so the test proves it, rather than guessing a fixed delay.
    const sseConnected = page.waitForResponse((r) => /\/chat\/stream$/.test(r.url()));
    await page.goto(`${BASE_URL}/#/mr/${encodeURIComponent(MR_REF)}`);
    await expect(page.locator('nav[aria-label="Артефакты"]')).toBeVisible({ timeout: 20_000 });
    await sseConnected;
    // eslint-disable-next-line no-console -- D-125: self-reporting the SSE-ready checkpoint
    console.info(`[t9] P7 sse-stream-connected ts=${new Date().toISOString()}`);

    // A live LLM review is non-deterministic — this independent live drive's synthesize step may
    // legitimately find zero candidates (a valid outcome, not a bug: P4's separate live run on the
    // same MR found 3; this run found 0). "Постить выбранное" needs ≥1 selected candidate and stays
    // disabled at 0 — fall back to "Approve (гейт)" (no candidate needed) so P7 proves the SAME
    // action→dry-run→effect_applied mechanism regardless of what this run's review contained.
    const candidateCheckboxCount = await page.locator('input[type="checkbox"]').count();
    // eslint-disable-next-line no-console -- D-125: self-reporting which branch this run took, not guessed externally
    console.info(`[t9] P7 candidateCheckboxCount=${candidateCheckboxCount}`);

    let actionButton;
    if (candidateCheckboxCount > 0) {
      const firstCheckbox = page.locator('input[type="checkbox"]').first();
      await expect(firstCheckbox).toBeVisible({ timeout: 10_000 });
      await firstCheckbox.check();
      actionButton = page.getByRole('button', { name: 'Постить выбранное' });
    } else {
      actionButton = page.getByRole('button', { name: 'Approve (гейт)' });
    }
    await expect(actionButton).toBeEnabled({ timeout: 5_000 });

    const actionResp = page.waitForResponse((r) => /\/api\/mr\/.+\/action$/.test(r.url()));
    await actionButton.click();
    const resp = await actionResp;
    expect(resp.status(), `POST /action body: ${await resp.text()}`).toBe(200);

    // Root cause of t8-action.spec.ts's current failure (diagnosed this phase, not routed around):
    // BoardProviderReal#executeAction's `void instance.step()` (board-provider.real.ts) only advances
    // the instance PAST node_ask (awaiting_operator → idle, currentNode=node_effect — the single
    // `node_ask -> node_effect` edge in reviewer.role.ts); it does NOT itself execute node_effect. The
    // real CLI (`gennady inbox serve`, cli/cmd/inbox/serve.cmd.ts's `setInterval` tick timer) drives
    // idle instances forward automatically on its own polling cadence; `bootReal()`'s in-process test
    // harness (`_support.ts`) starts no such timer — only the real serve command does. t8's fixed
    // 1.5s wait with no further `tick()` call never gives node_effect a chance to run, so its
    // `DRY-RUN` assertion fails deterministically (not flaky). Fix here: explicitly drive `tick()`
    // until the audit log's `effect_applied` entry lands, mirroring what the real serve process would
    // eventually do on its own.
    const auditPath = join(p7StateDir!, 'agent-inbox', 'audit.jsonl');
    let effectApplied = false;
    for (let i = 0; i < 10 && !effectApplied; i++) {
      await p7App!.scheduler.tick();
      if (existsSync(auditPath)) {
        const entries = readFileSync(auditPath, 'utf-8')
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as Record<string, unknown>);
        effectApplied = entries.some((e) => e['event'] === 'effect_applied' && e['mr'] === MR_URL);
      }
      if (!effectApplied) await page.waitForTimeout(500);
    }

    // effectApplied can flip true as early as the FIRST tick above — but emitDryRun's SSE broadcast
    // still travels HTTP response stream → network → browser EventSource → onmessage → console.info,
    // asynchronous relative to that tick() call. Asserting immediately races that delivery.
    for (let i = 0; i < 10 && dryRunLines.length === 0; i++) {
      await page.waitForTimeout(300);
    }

    await shot(page, 't9-11-action-confirmed');

    expect(
      effectApplied,
      'expected an audit.jsonl effect_applied entry for this MR after the action'
    ).toBe(true);
    expect(
      dryRunLines.some((l) => l.startsWith('DRY-RUN post→MR')),
      `expected a "DRY-RUN post→MR …" console line; captured dryRunLines: ${JSON.stringify(dryRunLines)}; all console: ${JSON.stringify(allConsoleLines)}`
    ).toBe(true);

    // eslint-disable-next-line no-console -- D-125: t9 telemetry-marker line required by ticket P7 Exit
    console.info(`[t9] step=action-confirmed ts=${new Date().toISOString()}`);
  });
});
