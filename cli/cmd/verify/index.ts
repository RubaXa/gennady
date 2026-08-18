// @file: Entry point for the gennady verify command — dynamic import trigger.
// @consumers: gennady.ts
// @tasks: SPIKE-yaml-verify

import { run } from './verify.cmd.ts';

process.exit(await run(process.argv));
