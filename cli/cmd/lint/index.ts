// @file: Entry point for the gennady lint command — runs lint and exits (kept out of cmd.ts so importing run() never executes lint).
// @consumers: gennady.ts
// @tasks: TSK-16

import { run } from './lint.cmd.ts';

const report = await run(process.argv);
if (report.exitCode === 1 || report.autoFixed > 0) console.log(report.format());
process.exit(report.exitCode);
