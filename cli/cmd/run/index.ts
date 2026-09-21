// @file: Entry point for the gennady run command — dynamic import trigger.
// @spec: CLI-RUN
// @consumers: gennady.ts

import { runCommand } from './run.cmd.ts';

await runCommand(process.argv);
