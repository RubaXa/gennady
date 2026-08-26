// @file: Entry point for the gennady lint command — runs the command and owns process exit.
// @consumers: gennady.ts
// @tasks: TSK-16

import { run } from './lint.cmd.ts';

// The CLI dispatches by importing this module, so the run belongs here rather than in lint.cmd.ts:
// importing the command module must stay free of side effects and must never exit the host process.
const report = await run(process.argv);
if (report.exitCode === 1 || report.autoFixed > 0) console.log(report.format());
process.exit(report.exitCode);
