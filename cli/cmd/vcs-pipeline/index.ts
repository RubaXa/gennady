#!/usr/bin/env node
// @file: Entry point for vcs-pipeline command — dispatch to run().
// @consumers: gennady CLI
// @tasks: TSK-83

import { run } from './vcs-pipeline.cmd.ts';

await run(process.argv);
