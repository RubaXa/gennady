#!/usr/bin/env node
// @file: Entry point for vcs-mr-view command — dispatch to run().
// @spec: VCS-MR-VIEW
// @consumers: gennady CLI

import { run } from './vcs-mr-view.cmd.ts';

await run(process.argv);
