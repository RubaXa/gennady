#!/usr/bin/env node

import { runRemoteConsoleCommand } from './remote-console.cmd.ts';

await runRemoteConsoleCommand(process.argv);
