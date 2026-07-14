#!/usr/bin/env node
// @file: CLI command: inbox-eval — thin wrapper over `runEval` (TSK-119): drives the real role
//   graph (run-mode, TSK-121) over a fixed MR list and evaluates gates G1..G10 (TSK-118) against
//   what it actually produced. Dry-run posting by default (NFC-05): nothing is written to GitLab.
// @consumers: gennady.ts
// @tasks: TSK-119

import { fileURLToPath } from 'node:url';
import { logger } from '#logger';
import {
  runEval,
  type RunEvalDeps,
  type RunEvalInput,
} from '../../../services/agent-inbox/modules/inbox-eval/eval-driver.ts';
import { loadSeedState } from '../../../services/agent-inbox/serve/state-seed.ts';

/** @purpose Injectable dependencies for the inbox-eval CLI command — enables testing without spawning the CLI or writing to disk. */
export type InboxEvalCmdDeps = RunEvalDeps & {
  /** @purpose Override for stdout writes */
  stdout?: NodeJS.WriteStream;
  /** @purpose Override for stderr writes */
  stderr?: NodeJS.WriteStream;
  /** @purpose Override for the driver entry point itself */
  runEval?: typeof runEval;
};

function parseValue(argv: string[], flag: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

/**
 * @purpose Parse `--mrs` into a concrete MR URL list.
 * @param value Raw flag value: comma-separated URLs.
 * @returns Parsed MR URL list.
 */
function resolveMrsList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @purpose CLI entry point for `gennady inbox-eval`. Parses `--mrs`/`--seed`/`--waf`/`--mocks`/
 *   `--dry-run`, drives `runEval`, prints the report path, and exits with the eval status.
 * @param [rawArgs] Raw CLI arguments (typically `process.argv`).
 * @param [deps] Optional injectable dependencies for testing.
 * @returns Process exit code — 0 when the eval report status is PASS, 1 otherwise (including argument/run errors).
 * @sideEffect FS/network: delegates to `runEval` (drives the real role graph, writes the report).
 */
export async function run(
  rawArgs: string[] = process.argv,
  deps: InboxEvalCmdDeps = {}
): Promise<number> {
  const argv = rawArgs.slice(2);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  // #region START_PARSE_ARGS — invariant: --dry-run default true; --no-dry-run is the only opt-out
  const mrsValue = parseValue(argv, '--mrs');
  if (!mrsValue) {
    stderr.write('Error: --mrs <urls> is required\n');
    return 1;
  }

  const seedValue = parseValue(argv, '--seed');
  const wafArg = parseValue(argv, '--waf');
  const wafThreshold = wafArg !== undefined ? Number(wafArg) : undefined;
  const dryRun = !argv.includes('--no-dry-run');
  const mocks = argv.includes('--mocks');
  // #endregion END_PARSE_ARGS

  try {
    logger.info('[inboxEvalCmd#run] [idle → running]', { mrs: mrsValue, dryRun });

    const seedState = seedValue ? await loadSeedState(seedValue) : undefined;
    const input: RunEvalInput = {
      mrs: resolveMrsList(mrsValue),
      seedState,
      wafThreshold,
      dryRun,
    };
    const runFn = deps.runEval ?? runEval;
    const { report, reportDir } = await runFn(input, { ...deps, mocks: deps.mocks ?? mocks });

    stdout.write(`Eval report: ${reportDir}/eval-report.json\n`);
    stdout.write(`Status: ${report.status}\n`);

    logger.info('[inboxEvalCmd#run] [running → done]', { status: report.status });
    return report.status === 'PASS' ? 0 : 1;
  } catch (cause) {
    const error = new Error('[inboxEvalCmd#run] Eval run failed', { cause });
    logger.error('[inboxEvalCmd#run] [running → failed]', { error });
    stderr.write(`Error: ${(cause as Error).message ?? String(cause)}\n`);
    return 1;
  }
}

// #region START_SELF_EXECUTING — invariant: self-executes only when file matches process.argv[1] (direct invocation)
if (process.argv[1]) {
  const selfPath = fileURLToPath(import.meta.url);
  if (selfPath === process.argv[1] || selfPath.endsWith(process.argv[1])) {
    try {
      const exitCode = await run(process.argv);
      process.exit(exitCode);
    } catch (cause) {
      const error = new Error('[inboxEvalCmd] Self-execution failed', { cause });
      logger.error('[inboxEvalCmd#run] [self-executing → failed]', { error });
      process.exit(1);
    }
  }
}
// #endregion END_SELF_EXECUTING
