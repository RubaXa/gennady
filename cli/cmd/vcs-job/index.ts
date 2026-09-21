#!/usr/bin/env node
// @file: Entry point for vcs-job command — dispatch to run().
// @spec: CLI
// @consumers: gennady CLI

import { run } from './vcs-job.cmd.ts';

await run(process.argv);
