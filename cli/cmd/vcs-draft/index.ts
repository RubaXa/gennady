// @file: Entry point for vcs-draft command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-87

import { run } from './vcs-draft.cmd.ts';

await run(process.argv);
