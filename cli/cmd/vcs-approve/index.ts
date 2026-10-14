// @file: Entry point for vcs-approve command — dispatch to run().
// @spec: CLI
// @consumers: gennady CLI

import { run } from './vcs-approve.cmd.ts';

await run(process.argv);
