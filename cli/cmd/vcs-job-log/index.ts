#!/usr/bin/env node
// @file: Entry point for vcs-job-log command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-85

import { run } from './vcs-job-log.cmd.ts';

await run(process.argv);
