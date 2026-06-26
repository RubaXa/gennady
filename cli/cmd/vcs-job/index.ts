#!/usr/bin/env node
// @file: Entry point for vcs-job command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-85

import { run } from './vcs-job.cmd.ts';

await run(process.argv);
