// @file: CLI entry point — boots the agent-mon command via dynamic import from gennady.ts.
// @spec: AGENT-MON-CLI-CMD
// @consumers: gennady.ts

import { run } from './run.ts';

run(process.argv.slice(3));
