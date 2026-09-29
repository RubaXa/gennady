// @file: Process adapter for the read-only gennady rules command.
// @spec: CLI-RULES-CLI
// @consumers: gennady.ts

import { runRulesCommand } from './rules.cmd.ts';

const outcome = runRulesCommand(process.cwd(), process.argv);
if (outcome.stdout !== '') process.stdout.write(outcome.stdout);
if (outcome.stderr !== '') process.stderr.write(outcome.stderr);
process.exit(outcome.exitCode);
