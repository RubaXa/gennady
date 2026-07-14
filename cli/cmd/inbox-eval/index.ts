// @file: inbox-eval command entry point — imports run() and self-executes.
// @consumers: gennady.ts
// @tasks: TSK-119

import { run } from './inbox-eval.cmd.ts';

process.exit(await run());
