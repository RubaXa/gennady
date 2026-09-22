#!/usr/bin/env node
// @file: Entry point for vcs-diff command — dispatch to run().
// @spec: CLI
// @consumers: gennady CLI

import { run } from './vcs-diff.cmd.ts';

await run(process.argv);
