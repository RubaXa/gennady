#!/usr/bin/env node
// @file: CLI command: inbox stats — reads phase-timings.jsonl telemetry and prints a 7-day analytics
//   rollup (per-node p50/p95/avg + error-rate, per-run total, slowest phase).
// @consumers: gennady.ts
// @tasks: TSK-perf

import { style } from '../../../shared/common/style.ts';
import { resolveStateDir } from './_core/logic/state-paths.logic.ts';
import {
  phaseTimingsPath,
  readPhaseAnalytics,
  type PhaseAnalytics,
} from '../../../services/agent-inbox/modules/inbox-roles/phase-telemetry.ts';

function parseDays(argv: string[]): number {
  const inline = argv.find((a) => a.startsWith('--days='));
  const value = inline
    ? Number(inline.slice('--days='.length))
    : (() => {
        const idx = argv.indexOf('--days');
        return idx !== -1 && argv[idx + 1] ? Number(argv[idx + 1]) : NaN;
      })();
  return Number.isFinite(value) && value > 0 ? value : 7;
}

function ms(n: number): string {
  return `${Math.round(n)}ms`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function renderTable(analytics: PhaseAnalytics): string {
  const lines: string[] = [];

  lines.push(
    style.bold(
      `Phase timings — последние ${analytics.windowDays}д (${analytics.entryCount} записей)`
    )
  );
  lines.push('');

  if (analytics.entryCount === 0) {
    lines.push(style.gray('Данных нет — телеметрия появится после первого исполненного ревью.'));
    return lines.join('\n');
  }

  // #region START_PER_NODE_TABLE
  lines.push(style.bold('По фазам (node):'));
  const nodeWidth = Math.max(4, ...analytics.perNode.map((r) => r.node.length));
  lines.push(
    `  ${'node'.padEnd(nodeWidth)}  ${'count'.padStart(5)}  ${'p50'.padStart(8)}  ${'p95'.padStart(8)}  ${'avg'.padStart(8)}  ${'errors'.padStart(7)}`
  );
  for (const row of analytics.perNode) {
    lines.push(
      `  ${row.node.padEnd(nodeWidth)}  ${String(row.count).padStart(5)}  ${ms(row.p50).padStart(8)}  ${ms(row.p95).padStart(8)}  ${ms(row.avg).padStart(8)}  ${pct(row.errorRate).padStart(7)}`
    );
  }
  // #endregion END_PER_NODE_TABLE

  lines.push('');

  // #region START_PER_RUN_TABLE
  lines.push(style.bold('По прогонам (mr, недавние первыми):'));
  if (analytics.perRun.length === 0) {
    lines.push(style.gray('  нет прогонов в окне'));
  } else {
    for (const run of analytics.perRun.slice(0, 10)) {
      lines.push(
        `  ${run.ts}  ${run.mr}  total=${ms(run.totalDurationMs)}  nodes=${run.nodeCount}`
      );
    }
    if (analytics.perRun.length > 10) {
      lines.push(style.gray(`  … и ещё ${analytics.perRun.length - 10} прогон(ов)`));
    }
  }
  // #endregion END_PER_RUN_TABLE

  lines.push('');

  // #region START_SLOWEST_PHASE
  if (analytics.slowestPhase) {
    const s = analytics.slowestPhase;
    lines.push(
      style.bold('Самая медленная фаза: ') +
        `${s.node} — ${ms(s.durationMs)} (mr=${s.mr}, ts=${s.ts})`
    );
  }
  // #endregion END_SLOWEST_PHASE

  return lines.join('\n');
}

async function run(): Promise<number> {
  const argv = process.argv.slice(2);
  const stateDir = resolveStateDir(argv);
  const days = parseDays(argv);

  if (argv.includes('--path')) {
    console.info(phaseTimingsPath(stateDir));
    return 0;
  }

  const analytics = readPhaseAnalytics(stateDir, days);

  if (argv.includes('--json')) {
    console.info(JSON.stringify(analytics, null, 2));
    return 0;
  }

  console.info(renderTable(analytics));
  return 0;
}

process.exit(await run());
