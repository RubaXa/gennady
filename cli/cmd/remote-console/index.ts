#!/usr/bin/env node
// @file: index
// @consumers: commit-gen, create-providers, review-gen
// @tasks: N/A


import { runRemoteConsoleCommand } from './remote-console.cmd.ts';

await runRemoteConsoleCommand(process.argv);
