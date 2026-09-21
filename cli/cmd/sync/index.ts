// @file: Sync command entry point — imports run() and self-executes
// @spec: CLI-SYNC
// @consumers: gennady.ts
import { run } from './sync.cmd.ts';
process.exit(run(process.argv));
