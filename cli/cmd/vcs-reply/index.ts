// @file: vcs-reply command entry point.
// @spec: CLI
// @consumers: gennady.ts, commit-gen, create-providers, review-gen

import { run } from './vcs-reply.cmd.ts';

process.exit(await run(process.argv));
