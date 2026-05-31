// @file: SyncSkills command entry point — imports run() and self-executes
// @consumers: gennady.ts
// @tasks: TSK-57
import { run } from './sync-skills.cmd.ts';
run(process.argv);
