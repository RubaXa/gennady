// @file: Entry point for the gennady verify command — runs the command and exits with its code.
// @consumers: gennady.ts
// @tasks: TSK-96

import { run } from './verify.cmd.ts';

process.exit(await run(process.argv));
