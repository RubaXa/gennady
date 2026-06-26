// @file: Entry point for vcs-todo command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-76, TSK-83

import { run } from './vcs-todo.cmd.ts';

process.exit(await run(process.argv));
