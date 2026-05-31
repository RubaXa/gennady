// @file: Entry point for the gennady agents-rules command — dynamic import trigger.
// @consumers: gennady.ts
// @tasks: TSK-59

import { run } from './agents-rules.cmd.ts';

await run(process.argv);
