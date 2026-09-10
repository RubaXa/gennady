// @file: GAP-E-6/D-62 — regenerates the auto-generated block of docs/journal/RESULTS.md from the
//   durable per-scenario records under ai/flow-eval/results/**/summary.json. Never touches anything
//   outside the <!-- GAP-E-6:GENERATED:BEGIN/END --> markers: the surrounding hand-written prose and
//   the PR #32 historical tables (restored from the OpenCode journal, no summary.json backs them)
//   survive untouched.
// @consumers: package.json "results:table" (or run directly with tsx); a freshness test
//   (results-table.test.ts) asserts regenerating produces byte-identical output — "the table IS the
//   data", not a hand-maintained copy that can drift.
// @usage: node --import tsx ai/flow-eval/scripts/results-table.ts [--results-dir DIR] [--out FILE] [--check]
//   --check: exit 1 (no write) when the regenerated block would differ from what's on disk — the
//   freshness gate a test or CI step can call directly.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  readAllDurableSummaries,
  type SddEvalDurableOutcome,
  type SddEvalDurableSummary,
} from '../results-archive.ts';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
const DEFAULT_RESULTS_DIR = resolve(PROJECT_ROOT, 'ai/flow-eval/results');
const DEFAULT_OUT_FILE = resolve(PROJECT_ROOT, 'ai/flow-eval/docs/journal/RESULTS.md');
const BEGIN_MARKER = '<!-- GAP-E-6:GENERATED:BEGIN — do not hand-edit; run `results:table` -->';
const END_MARKER = '<!-- GAP-E-6:GENERATED:END -->';

type ScenarioGroup = {
  scenarioId: string;
  runs: SddEvalDurableSummary[];
};

function groupByScenario(entries: SddEvalDurableSummary[]): ScenarioGroup[] {
  const byId = new Map<string, SddEvalDurableSummary[]>();
  for (const entry of entries) {
    const list = byId.get(entry.scenarioId) ?? [];
    list.push(entry);
    byId.set(entry.scenarioId, list);
  }
  return [...byId.entries()]
    .map(([scenarioId, runs]) => ({ scenarioId, runs }))
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
}

/** @purpose Standard median: sorted middle, or the mean of the two middles on an even count. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '—';
  const minutes = ms / 60_000;
  if (minutes < 1) return '<1 мин';
  return `~${Math.round(minutes)} мин`;
}

function formatTokens(total: number): string {
  if (total <= 0) return '—';
  return `~${Math.round(total / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function usageTotal(usage: unknown): number {
  const total = (usage as { total?: unknown } | undefined)?.total;
  return typeof total === 'number' && Number.isFinite(total) ? total : 0;
}

/** @purpose One run's MECHANICAL gate bucket — the SAME fold `cli.ts`'s `computeAggregateExitCode`
 *  uses per scenario (worker-error or `quality.pass === false` → fail), plus `budget-exhausted`
 *  (itself a mechanical fact — an observation-budget counter, not a judge opinion) and `undetermined`
 *  for a run that recorded no `quality` at all (golden-fixture phases: the strongest bar there,
 *  `golden/verify.sh`, is not currently wired into a persisted mechanical signal — see EVAL-SPEC.md). */
type GateBucket = 'pass' | 'fail' | 'budget-exhausted' | 'undetermined';

function gateBucket(run: SddEvalDurableSummary): GateBucket {
  if (run.outcome === 'budget-exhausted') return 'budget-exhausted';
  if (run.verdict === 'worker-error') return 'fail';
  if (run.quality) return run.quality.pass ? 'pass' : 'fail';
  return 'undetermined';
}

/**
 * @purpose "Состояние" column — V-BATCH-22 verdict B-6: the prior version counted `run.outcome`,
 *   which `cli.ts` sets straight from the JUDGE's verdict (`outcome = verdict === 'pass' ? 'pass' :
 *   …`), contradicting D-28/D-45 ("судья — диагностика, не гейт"). This counts the MECHANICAL gate
 *   instead — `quality.pass` / the aggregate-exit-code fold — so this column can never disagree with
 *   `gate: pass|FAIL` in the run's own terminal log. The judge's verdict is reported separately by
 *   `formatJudgeDiagnostic`, never folded in here.
 */
function formatMechanicalState(runs: readonly SddEvalDurableSummary[]): string {
  const total = runs.length;
  const buckets = runs.map(gateBucket);
  const pass = buckets.filter((b) => b === 'pass').length;
  const fail = buckets.filter((b) => b === 'fail').length;
  const budgetExhausted = buckets.filter((b) => b === 'budget-exhausted').length;
  const undetermined = buckets.filter((b) => b === 'undetermined').length;

  if (undetermined === total) return `нет мех. гейта (${total}) — см. golden/verify.sh вручную`;
  if (budgetExhausted === total) return `budget-exhausted (${budgetExhausted}/${total})`;
  if (pass === total) return `Проходит (${pass}/${total})`;
  if (pass === 0 && undetermined === 0) return `Не проходит (${fail}/${total})`;
  const parts = [
    `pass ${pass}`,
    fail > 0 ? `fail ${fail}` : null,
    budgetExhausted > 0 ? `budget-exhausted ${budgetExhausted}` : null,
    undetermined > 0 ? `н/д ${undetermined}` : null,
  ].filter((p): p is string => p !== null);
  return `Смешанно: ${parts.join(', ')}/${total}`;
}

/** @purpose "Судья (диагностика)" column — the judge's own verdict tally (D-45: diagnosis, never the
 *  gate). Kept as its own column so a disagreement between judge and mechanical gate (a known,
 *  expected pattern — see EXPERIMENTS-LOG.md's `slugify-toolchain` runs) is visible, not hidden. */
function formatJudgeDiagnostic(runs: readonly SddEvalDurableSummary[]): string {
  const counts = new Map<SddEvalDurableOutcome, number>();
  for (const run of runs) counts.set(run.outcome, (counts.get(run.outcome) ?? 0) + 1);
  const pass = counts.get('pass') ?? 0;
  const total = runs.length;
  if (pass === total) return `pass (${pass}/${total})`;
  if (pass === 0) {
    const budgetExhausted = counts.get('budget-exhausted') ?? 0;
    if (budgetExhausted === total) return `budget-exhausted (${budgetExhausted}/${total})`;
    return `fail (0/${total})`;
  }
  return `Смешанно: pass ${pass}/${total}`;
}

function renderTable(groups: ScenarioGroup[]): string {
  if (groups.length === 0) {
    return (
      'Пока нет ни одного постоянного результата под `ai/flow-eval/results/` — таблица появится ' +
      'после первого прогона (`npm run sdd-flow-eval`), который теперь всегда пишет туда запись.\n'
    );
  }
  const header =
    '| Сценарий | Прогонов | Действий (медиана) | Время (медиана) | Токенов (медиана) | Состояние (мех.) | Судья (диагностика) |\n' +
    '| -------- | -------: | ------------------: | ---------------- | -----------------: | --------------- | -------------------- |';
  const rows = groups.map((group) => {
    const actions = median(group.runs.map((run) => run.actions));
    const duration = median(
      group.runs.map((run) => run.durationMs).filter((v): v is number => typeof v === 'number')
    );
    const tokens = median(group.runs.map((run) => usageTotal(run.usage)));
    return (
      `| \`${group.scenarioId}\` | ${group.runs.length} | ${Math.round(actions)} | ` +
      `${formatDurationMs(duration)} | ${formatTokens(tokens)} | ${formatMechanicalState(group.runs)} | ` +
      `${formatJudgeDiagnostic(group.runs)} |`
    );
  });
  return [header, ...rows].join('\n') + '\n';
}

/** @purpose Build the full generated block (markers included) from the current results/ tree. Not
 *  exported (YAGNI — one production use, in main() below): the both-way test drives this file as a
 *  real subprocess (--results-dir/--out) rather than importing internals, which exercises the actual
 *  CLI entrypoint end to end instead of a lower-level helper. */
async function renderGeneratedBlock(resultsDir: string): Promise<string> {
  const entries = (await readAllDurableSummaries(resultsDir)).map((e) => e.summary);
  const groups = groupByScenario(entries);
  const body = renderTable(groups);
  return [
    BEGIN_MARKER,
    '',
    '**Постоянные результаты** — числа ниже посчитаны СКРИПТОМ из ' +
      '`ai/flow-eval/results/<дата>-<сценарий>/summary.json` (медиана по всем прогонам этого ' +
      'сценария; действий = число вызовов инструментов на последнем наблюдении). «Состояние (мех.)» ' +
      '— механический гейт (`quality.pass`/aggregate exit code, D-28/D-45); «Судья (диагностика)» — ' +
      'вердикт LLM-судьи, диагностика, НЕ гейт (может расходиться со «Состояние (мех.)» — это ожидаемо ' +
      'и не блокирует приёмку, см. EXPERIMENTS-LOG.md). Регенерация: ' +
      '`node --import tsx ai/flow-eval/scripts/results-table.ts`.',
    '',
    body.trimEnd(),
    '',
    END_MARKER,
  ].join('\n');
}

/** @purpose Splice the generated block into `content` between its markers; throws if either is
 *  missing. Not exported — see renderGeneratedBlock's note above. */
function spliceGeneratedBlock(content: string, generatedBlock: string): string {
  const beginIndex = content.indexOf(BEGIN_MARKER);
  const endIndex = content.indexOf(END_MARKER);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(
      `results-table: markers not found in target file (expected "${BEGIN_MARKER}" ... "${END_MARKER}")`
    );
  }
  const before = content.slice(0, beginIndex);
  const after = content.slice(endIndex + END_MARKER.length);
  return `${before}${generatedBlock}${after}`;
}

type CliArgs = { resultsDir: string; outFile: string; check: boolean };

function parseArgs(argv: readonly string[]): CliArgs {
  let resultsDir = DEFAULT_RESULTS_DIR;
  let outFile = DEFAULT_OUT_FILE;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--results-dir') resultsDir = resolve(argv[++i] ?? '');
    else if (arg === '--out') outFile = resolve(argv[++i] ?? '');
    else if (arg === '--check') check = true;
    else {
      console.error(`[results-table] unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { resultsDir, outFile, check };
}

async function main(argv: readonly string[]): Promise<void> {
  const { resultsDir, outFile, check } = parseArgs(argv);
  const current = await readFile(outFile, 'utf8');
  const generatedBlock = await renderGeneratedBlock(resultsDir);
  const next = spliceGeneratedBlock(current, generatedBlock);
  if (check) {
    if (next === current) {
      console.log('[results-table] up to date (no diff)');
      return;
    }
    console.error(`[results-table] ${outFile} is STALE — run without --check to regenerate`);
    process.exitCode = 1;
    return;
  }
  if (next === current) {
    console.log('[results-table] already up to date (no write)');
    return;
  }
  await writeFile(outFile, next, 'utf8');
  console.log(`[results-table] wrote ${outFile}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
