// @file: Entry point for vcs-draft-note command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-87

import { run } from './vcs-draft-note.cmd.ts';

await run(process.argv);
