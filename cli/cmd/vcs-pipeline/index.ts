#!/usr/bin/env node
// @file: Entry point for vcs-pipeline command — dispatch to run().
// @spec: CLI
// @consumers: gennady CLI

import { run } from './vcs-pipeline.cmd.ts';

await run(process.argv);
