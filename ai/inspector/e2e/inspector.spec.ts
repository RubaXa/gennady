// @file: ai/inspector — e2e: skill list renders, sdd-execute trace descends, screenshot for visual check.

import { test, expect } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shotDir = dirname(fileURLToPath(import.meta.url));

test('lists skills and descends the sdd-execute trace', async ({ page }) => {
  await page.goto('/');

  // entry: only SDD skills
  const skills = page.locator('.skill-btn');
  await expect(skills).toHaveCount(7);

  // pick sdd-execute
  await page.getByRole('button', { name: '/sdd-execute' }).click();
  await expect(page.locator('.structure .row[data-kind="skill"]').first()).toBeVisible();

  // its loader steps are present
  await expect(page.locator('.structure .lab .tag', { hasText: '<ExecutionPlan>' }).first()).toBeVisible();
  await expect(page.locator('.structure .lab .tag', { hasText: '<Step GATHER>' })).toBeVisible();

  // descend the flow: GATHER → run(execute.directive) → directive root → its BeliefState
  await page.locator('.structure .lab .tag', { hasText: '<Step GATHER>' }).click();
  await page.locator('.structure .lab .tag', { hasText: 'execute.directive.xml' }).first().click();
  await page.locator('.structure .lab .tag', { hasText: '<SddExecuteOrchestrator>' }).click();
  await expect(page.locator('.structure .lab .tag', { hasText: '<BeliefState>' }).first()).toBeVisible();

  // nodes with a source location carry an "open in editor" control (title = file:line)
  await expect(page.locator('.structure .opensrc').first()).toHaveAttribute('href', /^\w[\w-]*:\/\/file\/.+:\d+$/);

  // sdd-state is a bash command: opening it shows its captured --help
  await page.locator('.structure .lab .tag', { hasText: 'sdd-state' }).first().click();
  await expect(page.locator('.structure .detail', { hasText: 'npx gennady sdd-state' }).first()).toBeVisible();

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
  const sw = page.locator('.structure .lab .tag', { hasText: '<LogicSwitch>' }).last();
  await expect(sw).toBeVisible();

  // open the switch, then its first branch — which carries a run node into another directive
  await sw.click();
  await page.locator('.structure .lab .tag', { hasText: 'project-setup' }).first().click();
  await expect(page.locator('.structure .lab .tag', { hasText: 'root.directive.xml' }).first()).toBeVisible();

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
  await expect(dbg.locator('.row[data-kind="directive"]:visible .tag', { hasText: 'SddMigrationV1V2' }).first()).toBeVisible();

  await page.screenshot({ path: join(shotDir, 'screen-debug.png'), fullPage: true });
});
