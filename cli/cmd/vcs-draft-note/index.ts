// @file: Entry point for vcs-draft-note command — dispatch to run().
// @spec: CLI
// @consumers: gennady CLI

import { run } from './vcs-draft-note.cmd.ts';

await run(process.argv);
