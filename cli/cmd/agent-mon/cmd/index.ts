// @file: CLI entry point — boots the agent-mon command via dynamic import from gennady.ts.
// @consumers: gennady.ts
// @tasks: TSK-47

import { run } from './run.ts';

run(process.argv.slice(3));
