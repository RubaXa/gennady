// @file: Entry point for the gennady run command — dynamic import trigger.
// @consumers: gennady.ts
// @tasks: TSK-65

import { runCommand } from './run.cmd.ts';

await runCommand(process.argv);
