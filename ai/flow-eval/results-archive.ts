// @file: Durable per-scenario eval results (GAP-E-6, D-62) — always written under
//   ai/flow-eval/results/<date>-<scenario-id>[-N]/, never gitignored. Complements, does not replace,
//   the transient whole-batch artifacts sandbox-lifecycle.ts writes under .results/.
// @consumers: cli.ts (writes one record per scenario after each run); scripts/results-table.ts (reads
//   every summary.json to regenerate docs/journal/RESULTS.md)

import { existsSync } from 'node:fs';
import { appendFile, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** @purpose Provider/model pair, matching OpenCodeModel's shape without importing it (no coupling). */
export type SddEvalModelRef = { providerID: string; modelID: string };

/** @purpose The subset of SddEvalConfig that actually bounds a run — recorded so a result is
 *  reproducible: same scenario + same budget should behave the same. Not exported: its only use is
 *  inline as SddEvalDurableSummary['budget'] below (YAGNI — private, one usage, ordinary
 *  decomposition); callers assign a plain object literal, never need the type name itself. */
type SddEvalRunBudget = {
  concurrency: number;
  maxObservations: number;
  observeEveryMs: number;
  stuckAfter: number;
  tailLimit: number;
};

/** @purpose D-28: a detached observation budget is its own outcome, never folded into pass/fail. */
export type SddEvalDurableOutcome =
  | 'pass'
  | 'fail'
  | 'worker-error'
  | 'budget-exhausted'
  | 'unknown';

/** @purpose One scenario's durable outcome record — the ai/flow-eval/results/<dir>/summary.json shape. */
export type SddEvalDurableSummary = {
  scenarioId: string;
  /** @purpose UTC calendar date the run finished, `YYYY-MM-DD` — also the directory name's prefix. */
  date: string;
  /** @purpose Full ISO timestamp the run finished. */
  timestamp: string;
  /** @purpose gennadyRoot's `git rev-parse HEAD` at run time; undefined outside a git checkout. */
  sha?: string;
  model: SddEvalModelRef;
  judgeModel: SddEvalModelRef;
  budget: SddEvalRunBudget;
  /** @purpose Raw judge verdict string (e.g. `pass`/`fail`/`inconclusive`/`worker-error`). */
  verdict: string;
  status: string;
  outcome: SddEvalDurableOutcome;
  /** @purpose Tool-call count at the run's final observation (best available proxy — see runner.ts). */
  actions: number;
  /** @purpose Wall-clock span between the first and last observation, in ms; undefined with < 2. */
  durationMs?: number;
  usage?: unknown;
  quality?: { rule: string; pass: boolean; detail: string };
  hasJudge: boolean;
  specFiles: string[];
};

/** @purpose `git rev-parse HEAD` at `root`; never throws — undefined outside a git checkout. */
export async function resolveGitSha(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    });
    const sha = stdout.trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

/** @purpose First unused `<date>-<scenarioId>[-N]` name under resultsRoot; N starts at 2 (no suffix
 *  on the first run of the day for that scenario — matches the brief's `[-N]` notation). */
async function nextResultDirName(
  resultsRoot: string,
  date: string,
  scenarioId: string
): Promise<string> {
  const base = `${date}-${scenarioId}`;
  if (!existsSync(join(resultsRoot, base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!existsSync(join(resultsRoot, candidate))) return candidate;
  }
}

/**
 * @purpose Write ONE scenario's durable result — summary.json always, judge.md when given. Never
 *   overwrites a same-day same-scenario directory; disambiguates with a `-N` suffix instead.
 * @returns The absolute path of the created result directory.
 */
export async function persistDurableResult(
  resultsRoot: string,
  summary: SddEvalDurableSummary,
  options: { judgeFile?: string } = {}
): Promise<string> {
  const dirName = await nextResultDirName(resultsRoot, summary.date, summary.scenarioId);
  const dir = join(resultsRoot, dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  if (options.judgeFile) {
    await cp(options.judgeFile, join(dir, 'judge.md')).catch(() => undefined);
  }
  return dir;
}

/** @purpose Every `<resultsRoot>/*\/summary.json`, parsed; a malformed one is skipped, not fatal. */
export async function readAllDurableSummaries(
  resultsRoot: string
): Promise<Array<{ dir: string; summary: SddEvalDurableSummary }>> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(resultsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Array<{ dir: string; summary: SddEvalDurableSummary }> = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const summaryPath = join(resultsRoot, entry.name, 'summary.json');
    if (!existsSync(summaryPath)) continue;
    try {
      const raw = await readFile(summaryPath, 'utf8');
      out.push({ dir: entry.name, summary: JSON.parse(raw) as SddEvalDurableSummary });
    } catch {
      // one bad record must not sink the whole table
    }
  }
  return out;
}

/** @purpose Minutes-rounded human string matching results-table.ts's own formatting, so a stub entry
 *  and the generated RESULTS.md row read the same way. */
function formatMinutes(durationMs: number | undefined): string {
  if (durationMs === undefined || durationMs <= 0) return '—';
  const minutes = durationMs / 60_000;
  return minutes < 1 ? '<1 мин' : `~${Math.round(minutes)} мин`;
}

/**
 * @purpose GAP-E-6/D-62: append ONE append-only stub entry per run to EXPERIMENTS-LOG.md, following
 *   the template documented at the top of that file. This is a DRAFT, not analysis — the mechanical
 *   fields (model, budget, numbers) are filled in; "Гипотеза/зачем" and "Итог" are left as
 *   `_(заполнить)_` placeholders for a person to complete. Never overwrites a prior entry.
 * @returns The appended markdown block (for tests/logging), or undefined if the log file is missing
 *   (the log is a docs file that could legitimately not exist in some non-standard checkout — this
 *   must never fail a real run over an append the operator can always redo by hand).
 */
export async function appendExperimentLogStub(
  logPath: string,
  summary: SddEvalDurableSummary,
  resultDir: string
): Promise<string | undefined> {
  if (!existsSync(logPath)) return undefined;
  const tokens = (summary.usage as { total?: unknown } | undefined)?.total;
  const block = [
    '',
    `## ${summary.date} — \`${summary.scenarioId}\` (${summary.verdict}/${summary.outcome})`,
    '',
    `- **Модель:** ${summary.model.providerID}/${summary.model.modelID} / судья ` +
      `${summary.judgeModel.providerID}/${summary.judgeModel.modelID} — бюджет: ` +
      `concurrency=${summary.budget.concurrency} max-observations=${summary.budget.maxObservations}`,
    `- **Числа:** действий=${summary.actions}, время=${formatMinutes(summary.durationMs)}, ` +
      `токены=${typeof tokens === 'number' ? tokens : '—'}`,
    '- **Гипотеза/зачем:** _(заполнить)_',
    '- **Итог:** _(заполнить)_',
    `- **Сырые данные:** \`${resultDir}\``,
    '',
  ].join('\n');
  await appendFile(logPath, block, 'utf8');
  return block;
}
