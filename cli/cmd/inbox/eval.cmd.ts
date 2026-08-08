#!/usr/bin/env node
// @file: CLI command: inbox eval — eval harness driving 10 scenario runs, metrics, eval-report.json + trend.jsonl
// @consumers: gennady.ts (inbox eval subcommand)
// @tasks: TSK-165

import { join } from 'node:path';
import { logger } from '#logger';
import { StateStore } from '../../../services/agent-inbox/modules/inbox-core/state-store.ts';
import { EventJournal } from '../../../services/agent-inbox/modules/inbox-core/event-journal.ts';
import { DecisionJournal } from '../../../services/agent-inbox/modules/inbox-core/decision-journal.ts';
import {
  runEvalHarness,
  type EvalHarnessInput,
} from '../../../services/agent-inbox/modules/inbox-eval/harness.ts';

function parseValue(argv: string[], flag: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

/**
 * @purpose CLI entry point for `gennady inbox eval --mr <url> [--runs <list>] [--report <path>]`
 * @param [rawArgs] Raw CLI arguments
 * @returns Process exit code — 0 when all runs pass; 1 otherwise
 * @sideEffect FS: reads journal, writes eval-report.json + trend.jsonl
 */
export async function run(rawArgs: string[] = process.argv): Promise<number> {
  const argv = rawArgs.slice(3);

  const mrUrl = parseValue(argv, '--mr');
  if (!mrUrl) {
    console.error('Error: --mr <url> is required');
    return 1;
  }

  const runsFilter = parseValue(argv, '--runs')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const reportPath = parseValue(argv, '--report');

  try {
    logger.info('[inboxEvalCmd#run] [idle → running]', { mr: mrUrl, runsFilter });

    const store = new StateStore();
    const stateDir = store.getStateDir();

    const journalPath = join(stateDir, 'agent-inbox', 'events.jsonl');
    const journal = new EventJournal(journalPath);
    const decisionJournal = new DecisionJournal(journal);
    const reportsDir =
      reportPath ??
      join(stateDir, 'agent-inbox', 'eval-reports', new Date().toISOString().replace(/[:.]/g, '-'));

    const input: EvalHarnessInput = {
      mr: mrUrl,
      journal,
      decisionJournal,
      reportsDir,
      runFilter: runsFilter,
    };

    const report = await runEvalHarness(input);

    console.log(`Eval report: ${reportsDir}/eval-report.json`);
    console.log(`Verdict: ${report.verdict}`);
    console.log(
      `Runs: ${report.runs.filter((r) => r.status === 'pass').length}/${report.runs.length} passed`
    );

    logger.info('[inboxEvalCmd#run] [running → done]', { verdict: report.verdict });
    return report.verdict === 'pass' ? 0 : 1;
  } catch (cause) {
    const error = new Error('[inboxEvalCmd#run] Eval run failed', { cause });
    logger.error('[inboxEvalCmd#run] [running → failed]', { error });
    console.error(`Error: ${(cause as Error).message ?? String(cause)}`);
    return 1;
  }
}

process.exit(await run());
