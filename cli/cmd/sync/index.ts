// @file: Sync command entry point — imports run() and self-executes
// @consumers: gennady.ts
// @tasks: TSK-53
import { run } from './sync.cmd.ts';
process.exit(run(process.argv));
