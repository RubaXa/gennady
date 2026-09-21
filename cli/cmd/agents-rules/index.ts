// @file: Entry point for the gennady agents-rules command — dynamic import trigger.
// @spec: CLI-AGENTS-RULES
// @consumers: gennady.ts

import { run } from './agents-rules.cmd.ts';

await run(process.argv);
