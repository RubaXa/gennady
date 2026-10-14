#!/usr/bin/env node
// @file: Entry point for vcs-job-log command — dispatch to run().
// @spec: CLI
// @consumers: gennady CLI

import { run } from './vcs-job-log.cmd.ts';

await run(process.argv);
