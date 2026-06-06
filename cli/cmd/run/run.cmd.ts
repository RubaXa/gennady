// @file: RunCommand — CLI entry point for gennady run: thin wrapper over @services/agent-run.
// @consumers: gennady.ts
// @tasks: TSK-65

import { parseArgs } from 'node:util';
import { logger } from '#logger';
import { run, AgentRunError } from '../../../services/agent-run/index.ts';

/**
 * @purpose Parse raw CLI argv into a structured run options bag.
 * @invariant `--dir` is repeatable; all other flags are scalar. Returns `dirs` only when at least one `--dir` was supplied.
 * @param argv Raw process.argv array (includes node + script entries).
 * @returns Parsed positional task string and optional engine flags.
 */
function parseRunArgs(argv: string[]): {
  task: string;
  dirs?: string[];
  model?: string;
  engine?: string;
  timeout?: number;
} {
  const { positionals, values } = parseArgs({
    args: argv.slice(3),
    options: {
      dir:     { type: 'string', multiple: true },
      model:   { type: 'string' },
      engine:  { type: 'string' },
      timeout: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const task = positionals[0] ?? '';

  // purpose: collect dirs only when caller explicitly supplied --dir; absence = engine defaults to cwd
  const dirValues = values['dir'] as string[] | undefined;
  const dirs = dirValues && dirValues.length > 0 ? dirValues : undefined;

  const model   = values['model']   as string | undefined;
  const engine  = values['engine']  as string | undefined;
  const rawTimeout = values['timeout'] as string | undefined;
  const timeout = rawTimeout !== undefined ? Number(rawTimeout) : undefined;

  return { task, dirs, model, engine, timeout };
}

/**
 * @purpose Entry point for `gennady run`: validates task, invokes run(), prints result or error.
 * @invariant Empty/absent task → exit 1 without calling run().
 * @invariant AgentRunError → stderr `✗ <e.hint>   [<e.code>]`, exit 1. e.message is NOT printed.
 * @invariant RunResult.text → stdout, exit 0.
 * @param argv Raw process.argv array.
 * @throws Never — all errors are caught and reported via stderr + process.exit.
 * @sideEffect stdout: RunResult.text on success. stderr: usage/error message on failure.
 */
export async function runCommand(argv: string[]): Promise<void> {
  logger.debug('[RunCommand#runCommand] [idle → parsing]');

  const opts = parseRunArgs(argv);

  // #region START_VALIDATE_TASK — invariant: engine must not be called with empty task
  if (!opts.task) {
    process.stderr.write('Usage: gennady run "<task>" [--dir <dir>]... [--model <model>] [--engine <engine>] [--timeout <ms>]\n');
    process.exit(1);
  }
  // #endregion END_VALIDATE_TASK

  const runOptions = {
    task:    opts.task,
    ...(opts.dirs    !== undefined && { dirs:    opts.dirs    }),
    ...(opts.model   !== undefined && { model:   opts.model   }),
    ...(opts.engine  !== undefined && { engine:  opts.engine  }),
    ...(opts.timeout !== undefined && { timeout: opts.timeout }),
  };

  // #region START_INVOKE_RUN — invariant: AgentRunError is the only typed failure path; all others re-throw
  try {
    logger.debug('[RunCommand#runCommand] [parsing → running]');
    const result = await run(runOptions);
    logger.debug(`[RunCommand#runCommand] [running → done] engine=${result.engine}`);
    process.stdout.write(result.text + '\n');
    process.exit(0);
  } catch (cause) {
    if (cause instanceof AgentRunError) {
      process.stderr.write(`✗ ${cause.hint}   [${cause.code}]\n`);
      process.exit(1);
    }
    // failure mode: unexpected error — rethrow to expose stack; CLI wrapper in gennady.ts can catch
    throw cause;
  }
  // #endregion END_INVOKE_RUN
}
