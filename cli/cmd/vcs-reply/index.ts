// @file: vcs-reply command entry point.
// @consumers: gennady.ts, commit-gen, create-providers, review-gen
// @tasks: N/A

import { run } from './vcs-reply.cmd.ts';

process.exit(await run(process.argv));
