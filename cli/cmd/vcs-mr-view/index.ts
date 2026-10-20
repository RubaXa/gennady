#!/usr/bin/env node
// @file: Entry point for vcs-mr-view command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-99

import { run } from './vcs-mr-view.cmd.ts';

await run(process.argv);
