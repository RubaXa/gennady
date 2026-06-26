#!/usr/bin/env node
// @file: Entry point for vcs-diff command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-81

import { run } from './vcs-diff.cmd.ts';

await run(process.argv);
