#!/usr/bin/env node
// @file: CLI command: resolve-conflicts
// @consumers: N/A
// @tasks: N/A


import { parseResolveConflictsCommandArgs } from './_core/logic/resolve-conflicts-command-args-parse.logic.ts';
import { runResolveConflictsCommand } from './_core/logic/resolve-conflicts-command-run.logic.ts';

const resolveConflictsCommandArgs = parseResolveConflictsCommandArgs(process.argv);
const run = await runResolveConflictsCommand(resolveConflictsCommandArgs);

if (run.output) {
  console.info(run.output);
}

process.exit(run.code);
