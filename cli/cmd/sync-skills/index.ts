// @file: SyncSkills command entry point — imports run() and self-executes
// @spec: CLI-SYNC-SKILLS
// @consumers: gennady.ts
import { run } from './sync-skills.cmd.ts';
process.exit(run(process.argv));
