#!/usr/bin/env node
// @file: index
// @spec: CLI
// @consumers: commit-gen, create-providers, review-gen

import { runRemoteConsoleCommand } from './remote-console.cmd.ts';

await runRemoteConsoleCommand(process.argv);
