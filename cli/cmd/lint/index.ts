// @file: Entry point for the gennady lint command — dynamic import trigger.
// @spec: CLI-LINT
// @consumers: gennady.ts

import { run } from './lint.cmd.ts';

const report = await run(process.argv);
if (report.exitCode !== 0 || report.autoFixed > 0) console.log(report.format());
process.exit(report.exitCode);
