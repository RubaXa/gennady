#!/usr/bin/env node

import { parseResolveConflictsCommandArgs } from './_core/logic/resolve-conflicts-command-args-parse.logic.ts';
import { runResolveConflictsCommand } from './_core/logic/resolve-conflicts-command-run.logic.ts';

const resolveConflictsCommandArgs = parseResolveConflictsCommandArgs(process.argv);
const run = await runResolveConflictsCommand(resolveConflictsCommandArgs);

if (run.output) {
  console.info(run.output);
}

process.exit(run.code);
