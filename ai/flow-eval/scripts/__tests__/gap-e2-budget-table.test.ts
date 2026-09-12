// @file: GAP-E-2 acceptance — "сверка таблицы с фактическими лимитами раннера": the per-phase budget
//   table in docs/RUNBOOK.md must (a) recommend numbers the runner would actually accept, and (b)
//   name every phase that scenarios.json exercises, so the table can never silently drift from either
//   the runner's real constraint or the reference scenario set. Parses the table mechanically out of
//   the committed RUNBOOK.md and cross-checks it against runner.ts's own validation and
//   scenarios.json's real phase set — a change to either without updating the table fails this test.
// @consumers: N/A (test file)
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../../..');
const RUNBOOK = resolve(PROJECT_ROOT, 'ai/flow-eval/docs/RUNBOOK.md');
const RUNNER_SRC = resolve(PROJECT_ROOT, 'ai/flow-eval/runner.ts');
const SCENARIOS = resolve(PROJECT_ROOT, 'ai/flow-eval/scenarios.json');

type BudgetRow = { phases: string[]; numbers: number[] };

/** @purpose Pull the "Бюджеты по фазам (GAP-E-2)" markdown table out of RUNBOOK.md and parse each
 *  data row into the phase names its first cell names and the number(s) its second cell gives
 *  (a plain integer, or an en-dash range like `40–60` — both endpoints are checked). */
function parseBudgetTable(runbookText: string): BudgetRow[] {
  const headingIndex = runbookText.indexOf('### Бюджеты по фазам (GAP-E-2)');
  assert.ok(headingIndex >= 0, 'RUNBOOK.md must have a "Бюджеты по фазам (GAP-E-2)" section');
  const afterHeading = runbookText.slice(headingIndex);
  const nextHeadingIndex = afterHeading.indexOf('\n### ', 1);
  const section = nextHeadingIndex >= 0 ? afterHeading.slice(0, nextHeadingIndex) : afterHeading;

  const rows: BudgetRow[] = [];
  for (const line of section.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    if (/^-+:?$/.test(cells[1].replace(/\s/g, ''))) continue; // the `| --- | ---: | --- |` divider row
    if (cells[0] === 'Фаза') continue; // header row
    const phases = [...cells[0].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (phases.length === 0) continue;
    const numbers = [...cells[1].matchAll(/\d+/g)].map((m) => Number(m[0]));
    if (numbers.length === 0) continue;
    rows.push({ phases, numbers });
  }
  return rows;
}

describe('GAP-E-2: RUNBOOK budget table reconciled with the real runner + scenarios.json', () => {
  it('every recommended number is a runner-legal maxObservations (integer >= 1, per runner.ts)', () => {
    const runnerSrc = readFileSync(RUNNER_SRC, 'utf8');
    assert.match(
      runnerSrc,
      /maxObservations\s*<\s*1\)\s*\{[\s\S]{0,80}throw new Error\('eval maxObservations must be an integer >= 1'\)/,
      'runner.ts must still validate maxObservations as "integer >= 1" — if this assertion breaks, ' +
        'the constraint changed and the budget table needs re-reconciling, not this test loosened'
    );
    const rows = parseBudgetTable(readFileSync(RUNBOOK, 'utf8'));
    assert.ok(rows.length >= 3, 'expected at least 3 budget rows (task / core phases / migration)');
    for (const row of rows) {
      for (const n of row.numbers) {
        assert.ok(
          Number.isInteger(n) && n >= 1,
          `budget ${n} for phase(s) ${row.phases.join(', ')} is not a runner-legal maxObservations`
        );
      }
    }
  });

  it('every phase scenarios.json actually exercises is named in some budget row', () => {
    const scenarios = JSON.parse(readFileSync(SCENARIOS, 'utf8')) as Array<{ phase: string }>;
    const scenarioPhases = new Set(scenarios.map((s) => s.phase));
    assert.ok(scenarioPhases.size > 0, 'scenarios.json must declare at least one phase');

    const rows = parseBudgetTable(readFileSync(RUNBOOK, 'utf8'));
    const tabledPhases = new Set(rows.flatMap((r) => r.phases));

    const uncovered = [...scenarioPhases].filter((p) => !tabledPhases.has(p));
    assert.deepEqual(
      uncovered,
      [],
      `scenarios.json has phase(s) with no budget-table row: ${uncovered.join(', ')}`
    );
  });

  it('the migration phase (external-repo only, no fixture in scenarios.json) still has its own row', () => {
    const rows = parseBudgetTable(readFileSync(RUNBOOK, 'utf8'));
    const migrationRow = rows.find((r) => r.phases.includes('migration'));
    assert.ok(migrationRow, 'expected a budget row naming the `migration` phase');
    for (const n of migrationRow!.numbers)
      assert.ok(n >= 30, `migration budget ${n} looks too low`);
  });
});
