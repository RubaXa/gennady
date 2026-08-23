// @file: ai/inspector — e2e: skill list renders, sdd-execute trace descends, screenshot for visual check.

import { test, expect } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shotDir = dirname(fileURLToPath(import.meta.url));

test('lists skills and descends the sdd-execute trace', async ({ page }) => {
  await page.goto('/');

  // entry: every skill under ai/skills is listed (XML-form parsed, markdown marked unsupported)
  const skills = page.locator('.skill-btn');
  expect(await skills.count()).toBeGreaterThanOrEqual(9);
  await expect(page.locator('.skill-btn.unsupported').first()).toBeVisible();

  // ordering: supported skills on top (the first is auto-selected), unsupported sink to the bottom
  await expect(skills.first()).not.toHaveClass(/unsupported/);
  await expect(skills.first()).toHaveClass(/active/);
  const classes = await skills.evaluateAll((els) => els.map((e) => e.className));
  const firstUnsupported = classes.findIndex((c) => c.includes('unsupported'));
  const lastSupported = classes.map((c) => c.includes('unsupported')).lastIndexOf(false);
  expect(firstUnsupported).toBeGreaterThan(lastSupported); // no supported skill appears after an unsupported one

  // pick sdd-execute
  await page.getByRole('button', { name: '/sdd-execute' }).click();
  await expect(page.locator('.structure .row[data-kind="skill"]').first()).toBeVisible();

  // its loader steps are present
  await expect(
    page.locator('.structure .lab .tag', { hasText: '<ExecutionPlan>' }).first()
  ).toBeVisible();
  await expect(page.locator('.structure .lab .tag', { hasText: '<Step GATHER>' })).toBeVisible();

  // descend the flow: GATHER → run(execute.directive) → directive root → its BeliefState
  await page.locator('.structure .lab .tag', { hasText: '<Step GATHER>' }).click();
  await page.locator('.structure .lab .tag', { hasText: 'execute.directive.xml' }).first().click();
  await page.locator('.structure .lab .tag', { hasText: '<SddExecuteOrchestrator>' }).click();
  await expect(
    page.locator('.structure .lab .tag', { hasText: '<BeliefState>' }).first()
  ).toBeVisible();

  // nodes with a source location carry an "open in editor" control (title = file:line)
  await expect(page.locator('.structure .opensrc').first()).toHaveAttribute(
    'href',
    /^\w[\w-]*:\/\/file\/.+:\d+$/
  );

  // sdd-state is a bash command: opening it shows its captured --help
  await page.locator('.structure .row:visible .tag', { hasText: 'sdd-state' }).first().click();
  await expect(
    page.locator('.structure .detail:visible', { hasText: 'npx gennady sdd-state' }).first()
  ).toBeVisible();

  await page.screenshot({ path: join(shotDir, 'screen-execute.png'), fullPage: true });
});

test('the /sdd router LOGIC_SWITCH descends into branch directives', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '/sdd', exact: true }).click();

  // descend: GATHER → run(router.directive) → directive root → its <LogicSwitch>
  await page.locator('.structure .lab .tag', { hasText: '<Step GATHER>' }).click();
  await page.locator('.structure .lab .tag', { hasText: 'router.directive.xml' }).first().click();
  await page.locator('.structure .lab .tag', { hasText: '<SddRouter>' }).click();
  // the top-level routing switch is the last <LogicSwitch> in the tree (STEP_0 also embeds one now)
  const sw = page.locator('.structure .row:visible .tag', { hasText: '<LogicSwitch>' }).last();
  await expect(sw).toBeVisible();

  // open the switch, then its first branch — which carries a run node into another directive
  await sw.click();
  await page.locator('.structure .lab .tag', { hasText: 'project-setup' }).first().click();
  await expect(
    page.locator('.structure .lab .tag', { hasText: 'root.directive.xml' }).first()
  ).toBeVisible();

  await page.screenshot({ path: join(shotDir, 'screen-router-switch.png'), fullPage: true });
});

test('debug mode: step into a directive and advance the flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '/sdd', exact: true }).click();
  const dbg = page.locator('.dbg');

  // GATHER loads router.directive — shown as a collapsed, inspectable block (READ_AND_USE)
  await expect(dbg.locator('.dbg-loaded')).toContainText('router.directive.xml');

  // GATHER just loads (sdd-state + read directive); advancing reaches EMBODY which AUTO-enters router.directive
  await dbg.locator('.dbg-br', { hasText: 'следующий шаг' }).first().click();
  await expect(page.locator('.dbg-stack')).toContainText('SddRouter');
  await expect(dbg.locator('.dbg-div', { hasText: 'загружена' }).first()).toBeVisible();

  // we're now inside the directive at STEP_0_STATE — its preflight switch branches are real choices
  await expect(dbg.locator('.dbg-br', { hasText: 'migration-v1-v2' }).first()).toBeVisible();
  await expect(dbg.locator('.dbg-br', { hasText: 'DEFAULT' }).first()).toBeVisible();

  // enter a switch branch (FLOW_VERSION=v1 → migration): the entered directive is inspectable at the entry divider
  await dbg.locator('.dbg-br', { hasText: 'migration-v1-v2' }).first().click();
  await expect(page.locator('.dbg-stack')).toContainText('SddMigrationV1V2');
  // entered directive sits collapsed right under the entry divider, no extra frame
  await expect(dbg.locator('.dbg-div', { hasText: 'ветка → загружена' }).first()).toBeVisible();
  await expect(
    dbg.locator('.row[data-kind="directive"]:visible .tag', { hasText: 'SddMigrationV1V2' }).first()
  ).toBeVisible();

  await page.screenshot({ path: join(shotDir, 'screen-debug.png'), fullPage: true });
});

test('a non-XML skill is listed but marked unsupported (no tree/debugger)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.skill-btn.unsupported').first().click();
  await expect(page.locator('.unsupported-panel')).toBeVisible();
  await expect(page.locator('.unsupported-title')).toContainText('не поддерживается');
  // no structure tree / debugger for unsupported skills
  await expect(page.locator('.structure')).toHaveCount(0);
  await expect(page.locator('.dbg')).toHaveCount(0);
});

test('a lazy step shows its READ_AND_USE package and the loaded body', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '/sdd-scaffold', exact: true }).click();

  const visibleTag = (text: string) =>
    page.locator('.structure .row:visible .tag', { hasText: text }).first();
  await visibleTag('<Step GATHER>').click();
  await visibleTag('scaffold.directive.xml').click();
  await visibleTag('<SddScaffold>').click();
  await page.locator('.structure .row:visible .tag', { hasText: '<ExecutionPlan>' }).last().click();

  const dag = visibleTag('<Step STEP_2_DAG>');
  await expect(dag).toBeVisible();
  await dag.click();
  await expect(
    page.locator('.structure .row:visible').filter({
      hasText: 'READ_AND_USE — загрузить тело шага',
    })
  ).toContainText('scaffold/steps/STEP_2_DAG.xml');
  await expect(
    page.locator('.structure .row:visible', { hasText: '<Goal>' }).first()
  ).toContainText('Build the acyclic task DAG');

  await page.screenshot({ path: join(shotDir, 'screen-lazy-step-read.png'), fullPage: true });
});
