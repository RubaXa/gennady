// @file: Entry point for vcs-todo command — dispatch to run().
// @spec: CLI
// @consumers: gennady CLI

import { run } from './vcs-todo.cmd.ts';

process.exit(await run(process.argv));
