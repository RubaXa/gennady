// @file: Entry point for vcs-approve command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-69

import { run } from './vcs-approve.cmd.ts';

await run(process.argv);
